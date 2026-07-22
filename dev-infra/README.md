## 本地 Postgres & Redis 调试环境

此目录提供本项目后端在本地开发时使用的 PostgreSQL 和 Redis 容器。

### 启动

在项目根目录执行：

```bash
cd dev-infra
docker compose up -d
```

启动后默认连接信息：

- PostgreSQL：
  - 地址：`localhost:5432`
  - 数据库：`webui_db`
  - 用户：`webui`
  - 密码：`webui_password`
  - 建议在后端 `.env` 中设置：
    - `DATABASE_URL=postgresql+asyncpg://webui:webui_password@localhost:5432/webui_db`

- Redis：
  - 地址：`localhost:6379`
  - 对应后端配置：
    - `REDIS_URL=redis://localhost:6379/0`

### 停止

```bash
cd dev-infra
docker compose down
```

