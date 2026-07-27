# 前端开发者指南

面向修改本前端的贡献者：架构分层、日常开发步骤与约定。

使用者向说明见 [README.md](README.md)。

## 技术栈

| 层         | 选型                                                                |
| ---------- | ------------------------------------------------------------------- |
| 构建       | Vite 6                                                              |
| UI         | React 19 + TypeScript（strict）                                     |
| 路由       | React Router 7                                                      |
| 服务器状态 | TanStack Query v5                                                   |
| 客户端状态 | Zustand（薄：UI / 回合瞬时态）                                      |
| API        | OpenAPI → Orval（类型 + React Query hooks）                         |
| 组件基座   | Radix 原语 + 自研 Design Tokens（Style Dictionary）+ Tailwind CSS 4 |
| 动效       | Motion                                                              |
| 舞台       | Phaser 4（`shared/stage`，经 `StageRuntime` 接口）                  |
| 测试       | Vitest + Testing Library；Playwright；Storybook 8                   |

包管理：**pnpm**（见 `engines` 与 `pnpm-lock.yaml`）。

## 架构：Feature-Sliced Design

依赖方向只能向下：

```
app → pages → widgets → features → entities → shared / design-system
```

| 层              | 职责                            | 示例                                          |
| --------------- | ------------------------------- | --------------------------------------------- |
| `app`           | Providers、全局样式、根组件     | `App.tsx`                                     |
| `pages`         | 路由页，组装 widgets / features | `play`、`chat`、`auth`                        |
| `widgets`       | 可复用页面区块                  | `game-shell`、`chat-shell`、`app-shell`       |
| `features`      | 用户场景能力                    | `turn-queue`、`auth`、`tts`、`ensure-session` |
| `entities`      | 领域投影（与 API 类型对齐）     | `world`、`timeline`、`role`                   |
| `shared`        | 无业务语义的基础设施            | `api`、`stage`、`router`                      |
| `design-system` | tokens、primitives、patterns    | Button、Panel、Motion recipes                 |

路径别名（`tsconfig`）：`@app/*`、`@pages/*`、`@widgets/*`、`@features/*`、`@entities/*`、`@shared/*`、`@ds/*`。

**约定要点：**

- 服务器数据进 TanStack Query；不要把会话 world / timeline 塞进全局 Zustand。
- 舞台只吃规范化世界视图与语音 cue，不直接打 HTTP；通过 `StageRuntime`，勿在业务里 import Phaser 实现细节。
- 业务 API 调用走 `src/shared/api/hooks.ts`（及 mutation hooks），不要散落手写 `fetch`。

## 本地开发

```bash
pnpm install
cp .env.example .env
# 后端已在 :8081 运行
pnpm dev
```

### 同步 API 契约

后端更新 `openapi.json` 后（后端侧流程见 [backend/DEVELOPERS.md](../backend/DEVELOPERS.md#改-api--schema-后)），前端拉取最新契约生成 orval client：

```bash
pnpm openapi   # 读取仓库根 openapi.json → src/shared/api/generated
```

`VITE_API_BASE_URL` 只作运行时 origin；生成代码不写死 host（见 `shared/api/mutator.ts`）。

### 设计 tokens

源文件在 `src/design-system/tokens/`（本地 JSON）。修改后：

```bash
pnpm tokens:build
```

### 舞台资产

- 清单：`public/assets/manifest.json`
- 交图与目录约定：`public/assets/README.md`
- 与后端 `roles.yaml` 对齐门禁：`pnpm check:assets`

## 代码质量

本地命令：

```bash
pnpm typecheck
pnpm lint
pnpm format         # Prettier 写盘；pnpm format:check 只校验
pnpm test
pnpm test:e2e       # 需先 pnpm test:e2e:install（首次）
pnpm build
pnpm storybook
```

三道关卡各自覆盖的范围（`pnpm openapi` 生成 orval 契约，是 lint/typecheck 的前置）：

| 检查项             | 本地命令         | pre-commit | CI (`frontend-ci`) |
| ------------------ | ---------------- | :--------: | :----------------: |
| 契约生成（orval）  | `pnpm openapi`   |     ✓      |   ✓（前置步骤）    |
| 类型（tsc strict） | `pnpm typecheck` |     ✓      |         ✓          |
| ESLint             | `pnpm lint`      |     ✓      |         ✓          |
| 格式（Prettier）   | `pnpm format`    | ✓（写盘）  |   ✓（`:check`）    |
| 单元测试（Vitest） | `pnpm test`      |     —      |         ✓          |
| 构建               | `pnpm build`     |     —      |         ✓          |
| E2E（Playwright）  | `pnpm test:e2e`  |     —      |         ✓          |

- **pre-commit**：`git commit` 时对 frontend 改动自动跑前四项（先生成契约再 lint/type/format），与 CI 同源，避免格式/lint 问题推到 CI 才暴露。测试与构建太重，只在 CI 跑。安装见下节「提交前检查」。
- **CI**：仓库根 [`.github/workflows/frontend-ci.yml`](../.github/workflows/frontend-ci.yml)，经 `frontend-with-openapi`（导出 OpenAPI → orval）后并行跑 typecheck / lint+format:check / test / build / e2e。

## 提交前检查（pre-commit）

前后端共用仓库根 `.pre-commit-config.yaml`，按改动路径触发（frontend 改动跑上表前四项）。`pre-commit` 是独立的 Python CLI，全局安装一次即可，对前后端同时生效：

```bash
pipx install pre-commit      # 或 brew install pre-commit
pre-commit install           # 在仓库任意位置执行
```

配置全貌与后端侧检查见 [backend/DEVELOPERS.md](../backend/DEVELOPERS.md#提交前检查pre-commit)。

## 代码规范（摘要）

- TypeScript strict；优先明确类型，避免无必要的 `any`。
- 遵循 FSD 边界：上层可依赖下层，禁止下层依赖上层、禁止跨 slice 随意深耦。
- 交互副作用放在事件处理里；派生数据在渲染期计算，避免「props → effect → setState」同步。
- UI：使用 design-system tokens / primitives，业务里避免魔法色值与重复造轮子。

## 测试布局

```
tests/
├── unit/     # 域与舞台工具
├── a11y/     # 关键面板可达性
└── e2e/      # Playwright 关键路径
```
