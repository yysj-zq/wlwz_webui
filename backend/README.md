# 武林外传 AI 对话后端服务

FastAPI 后端，提供聊天、会话、角色、TTS 与认证等 API。

## 功能概览

- **聊天**：普通对话与流式对话（SSE），对接兼容 OpenAI Chat Completions 的 LLM
- **会话**：会话 CRUD，与用户关联并持久化到数据库
- **角色**：从 YAML 配置加载内置角色与头像，并支持自定义角色
- **TTS**：文本转语音（对接 Triton），可选 Redis 缓存
- **认证**：JWT 登录/注册，密码 Argon2 哈希

## 快速启动

在 `backend/` 目录：

```bash
uv sync
cp .env.example .env
# 编辑 .env 后
make dev
```

服务默认在 **http://localhost:8081**，API 文档：http://localhost:8081/docs 。

**开发与贡献**（迁移、测试、规范等）见 **[DEVELOPERS.md](DEVELOPERS.md)**。

## 环境变量

复制 `.env.example` 为 `.env` 后按需修改。主要项：

| 类别 | 变量示例 | 说明 |
|------|----------|------|
| 应用 | `PORT=8081`、`CORS_ORIGINS` | 端口与跨域 |
| 内置角色 | `INIT_BUILTIN_ROLES_ON_START`、`ROLES_CONFIG_PATH` | 是否从 YAML 初始化角色 |
| 大模型 | `MODEL_BASE_URL`、`MODEL_API_KEY`、`MODEL_NAME` | LLM API |
| TTS | `TTS_TRITON_URL`、`TTS_MODEL_NAME` | Triton TTS |
| 数据库 | `DATABASE_URL` | 应用连接串；改库后需 `upgrade` 或 `make dev` |
| 测试 | `TEST_DATABASE_URL`（可选） | 仅 pytest 使用；与 `DATABASE_URL` 分开，避免误用开发库 |
| 认证 | `JWT_SECRET_KEY`、`ACCESS_TOKEN_EXPIRE_MINUTES` | JWT |
| 缓存 | `REDIS_URL`、`TTS_CACHE_TTL_SECONDS` | TTS 缓存（可选） |

完整列表见 `.env.example`。

## 项目结构

```
backend/
├── Makefile                     # make dev：upgrade head 后启动
├── alembic/
│   └── versions/
├── app/
│   ├── api/
│   │   ├── dependencies/
│   │   ├── middleware/
│   │   ├── routers/
│   │   ├── schemas/
│   │   └── router.py
│   ├── common/
│   ├── core/
│   ├── db/
│   │   ├── models/
│   │   └── session.py
│   ├── infra/
│   ├── services/
│   └── main.py
├── config/
│   └── roles.yaml
├── tests/
│   ├── api/
│   └── services/
└── main.py
```
## 主要 API

- `POST /api/auth/register`、`POST /api/auth/login`：注册、登录
- `GET/POST/DELETE /api/conversations`：会话列表、创建、删除
- `POST /api/chat`、`POST /api/chat/stream`：普通对话、流式对话
- `GET /api/roles`：可用角色列表
- `POST /api/tts`：文本转语音，返回 WAV

认证接口除登录/注册外，需在请求头携带 `Authorization: Bearer <token>`。