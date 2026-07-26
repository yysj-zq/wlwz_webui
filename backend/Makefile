.PHONY: dev openapi

# 启动开发服务器（先迁移数据库再跑 uvicorn）
dev:
	uv run alembic upgrade head
	uv run python main.py

# 导出 FastAPI openapi.json 到 ../openapi.json（仓库根）。
# 等价于：
#   uv run python scripts/export_openapi.py
# 也支持：
#   make openapi OUTPUT=../frontend/openapi.json
#   OPENAPI_OUTPUT=../frontend/openapi.json make openapi
openapi:
	@if command -v uv >/dev/null 2>&1; then \
		uv run python scripts/export_openapi.py $(OUTPUT); \
	else \
		python3 scripts/export_openapi.py $(OUTPUT); \
	fi
