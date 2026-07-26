# 武林外传 AI 对话 — 前端

Vite + React 单页客户端：文本对话（Chat）与同福舞台（Play）。

开发架构、脚本与规范见 **[DEVELOPERS.md](DEVELOPERS.md)**。

## 功能

- 角色扮演对话与会话管理（创建 / 切换 / 删除）
- Play：像素舞台移动、点选 NPC/物件交互、叙事时间线
- Chat：戏文式对话界面
- 角色册、设置、登录注册
- TTS 朗读、明暗主题

## 环境要求

- Node.js `>=20.19.0`
- pnpm `>=9`

后端需另行启动（仓库 `backend/`，默认 `:8081`）。

## 启动

```bash
pnpm install
cp .env.example .env
pnpm dev
```

浏览器打开 **http://localhost:5173**。

### 环境变量

| 变量                | 说明                                                           |
| ------------------- | -------------------------------------------------------------- |
| `VITE_API_BASE_URL` | 后端 origin，默认 `http://localhost:8081`（**不要**带 `/api`） |
| `VITE_OPENAPI_URL`  | 可选；仅仓库根无 `openapi.json` 时，生成客户端才回退拉取       |

## 目录概览

```
frontend/
├── public/assets/   # 舞台资源（manifest.json 为入口）
├── src/
│   ├── app/         # 应用入口与全局样式
│   ├── pages/       # 路由页面
│   ├── widgets/     # 页面级组合（壳、侧栏、舞台 UI）
│   ├── features/    # 业务能力（认证、回合、TTS…）
│   ├── entities/    # 领域模型投影
│   ├── shared/      # API 客户端、舞台引擎、路由
│   └── design-system/
├── tests/
└── package.json
```

## 常用命令

| 命令             | 说明            |
| ---------------- | --------------- |
| `pnpm dev`       | 开发服务器      |
| `pnpm build`     | 生产构建        |
| `pnpm test`      | 单元 / 组件测试 |
| `pnpm test:e2e`  | E2E             |
| `pnpm storybook` | 组件文档        |
