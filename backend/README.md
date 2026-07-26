# 武林外传 AI 对话 — 后端

FastAPI 服务：认证、会话与世界状态、LLM 回合、角色与 TTS。

开发架构、迁移与规范见 **[DEVELOPERS.md](DEVELOPERS.md)**。

## 功能

- 注册 / 登录（JWT）
- 会话 CRUD；世界状态与时间线读写
- 对话回合与舞台动作回合（经 LangGraph 编排 Director / NPC）
- 内置角色（`config/roles.yaml`）与自定义角色、头像
- TTS（Triton），可选 Redis 缓存

## 启动

```bash
uv sync
cp .env.example .env   # 至少配置 DATABASE_URL、LLM；按需 TTS / Redis
make dev               # alembic upgrade head + 启动
```

默认 **http://localhost:8081**，交互文档：**http://localhost:8081/docs**。

## 环境变量（常用）

| 类别 | 示例 | 说明 |
|------|------|------|
| 应用 | `PORT`、`CORS_ORIGINS` | 端口与跨域 |
| 数据库 | `DATABASE_URL` | 应用库；改模型后需迁移 |
| 测试 | `TEST_DATABASE_URL` | 仅 pytest，勿与开发库混用 |
| LLM | `MODEL_BASE_URL`、`MODEL_API_KEY`、`MODEL_NAME` | 回合推理 |
| TTS | `TTS_TRITON_URL`、`TTS_MODEL_NAME` | 语音合成 |
| 认证 | `JWT_SECRET_KEY` | JWT |
| 角色 | `INIT_BUILTIN_ROLES_ON_START`、`ROLES_CONFIG_PATH` | 启动播种 |

完整项见 `.env.example`。

## 目录概览

```
backend/
├── app/
│   ├── api/           # HTTP 端点与依赖
│   ├── core/          # 配置、数据库、安全、LLM
│   ├── graph/         # 回合图（LangGraph）
│   ├── models/        # ORM
│   ├── repositories/
│   ├── schemas/       # 请求/响应模型
│   └── services/      # 领域服务
├── alembic/
├── config/roles.yaml
├── scripts/           # 含 OpenAPI 导出
└── tests/
```

## API 入口（摘要）

以 `/docs` 与仓库根 `openapi.json` 为准。常用：

- `POST /api/auth/register`、`POST /api/auth/login`
- `GET/POST /api/conversations` 及 world / timeline / chat / actions
- `GET /api/roles` 等角色接口
- `POST /api/tts`

除登录注册外需 `Authorization: Bearer <token>`。

## OpenAPI 导出

供前端 Orval 使用：

```bash
make openapi                         # → ../openapi.json
make openapi OUTPUT=../frontend/openapi.json
```
