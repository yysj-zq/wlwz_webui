# 武林外传 AI 对话后端服务

FastAPI 后端，提供聊天、会话、角色、TTS 与认证等 API。

## 功能概览

- **聊天**：普通对话与流式对话（SSE），对接兼容 OpenAI Chat Completions 的 LLM
- **会话**：会话 CRUD，与用户关联并持久化到数据库
- **角色**：从 YAML 配置加载内置角色与头像，并支持自定义角色
- **TTS**：文本转语音（对接 Triton），可选 Redis 缓存
- **认证**：JWT 登录/注册，密码 Argon2 哈希

## 快速启动

```bash
uv sync
cp .env.example .env
# 编辑 .env 后启动
uv run main.py
```

服务默认在 **http://localhost:8081** 运行。API 文档：http://localhost:8081/docs 。

## 环境变量

复制 `.env.example` 为 `.env` 后按需修改，主要项如下：

| 类别     | 变量示例 | 说明 |
|----------|----------|------|
| 应用     | `PORT=8081`、`CORS_ORIGINS` | 端口与允许的跨域来源 |
| 内置角色     | `INIT_BUILTIN_ROLES_ON_START`、`ROLES_CONFIG_PATH` | 是否从 YAML 初始化角色、配置文件路径 |
| 大模型   | `MODEL_BASE_URL`、`MODEL_API_KEY`、`MODEL_NAME` | LLM API 地址与模型名 |
| TTS      | `TTS_TRITON_URL`、`TTS_MODEL_NAME` | Triton TTS 地址与模型名 |
| 数据库   | `DATABASE_URL` | 如 `sqlite+aiosqlite:///./app.db` |
| 认证     | `JWT_SECRET_KEY`、`ACCESS_TOKEN_EXPIRE_MINUTES` | JWT 密钥与过期时间 |
| 缓存     | `REDIS_URL`、`TTS_CACHE_TTL_SECONDS` | TTS 缓存（可选） |

完整列表见 `.env.example`。

## 项目结构

```
backend/
├── config/
│   └── roles.yaml       # 内置角色与 TTS 说话人配置
├── models/
│   └── db_models.py     # SQLAlchemy 模型
├── routers/
│   ├── auth_router.py           # 认证（登录/注册）
│   ├── conversation_router.py  # 会话 CRUD
│   ├── chat_router.py           # 聊天（/api/chat、/api/chat/stream）
│   ├── roles_router.py          # 角色列表
│   └── tts_router.py            # 文本转语音
├── services/            # 业务逻辑
├── utils/               # 安全、TTS 缓存、模型客户端等
├── static/              # 静态资源（如角色头像）
├── config.py            # 配置加载（Pydantic Settings）
├── db.py                # 数据库初始化
└── main.py              # 应用入口
```

## 主要 API

- `POST /api/auth/register`、`POST /api/auth/login`：注册、登录
- `GET/POST/DELETE /api/conversations`：会话列表、创建、删除
- `POST /api/chat`、`POST /api/chat/stream`：普通对话、流式对话
- `GET /api/roles`：可用角色列表
- `POST /api/tts`：文本转语音，返回 WAV

认证接口除登录/注册外，需在请求头携带 `Authorization: Bearer <token>`。