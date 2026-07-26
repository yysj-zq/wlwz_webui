"""导出 FastAPI ``openapi.json`` 到磁盘，供前端 orval 客户端生成 TS 类型。

Phase 1 B1-1 (Contract Normalizer) 的落地工具：

- 内部字段统一 snake_case（继承自 :class:`app.schemas._alias.CamelModel`）。
- OpenAPI / 响应体对外统一 camelCase（端点上 ``response_model_by_alias=True``）。
- 本脚本直接把 ``app.openapi()`` 落盘。前端 ``pnpm openapi`` 通过
``frontend/scripts/resolve-openapi.mjs`` 优先读取仓库根 ``openapi.json``，
再跑 orval；仅在本地无导出文件时才 fallback 拉取运行中的后端。

默认输出 ``../openapi.json`` —— 相对 ``backend/`` 启动时落在仓库根，
便于在不同 CWD 下都能 ``make openapi`` 复现。可通过位置参数或
``OPENAPI_OUTPUT`` 环境变量覆盖。

使用方式::

    # 仓库根
    cd backend
    make openapi                                    # 默认 ../openapi.json（仓库根）

    # 或
    python3 scripts/export_openapi.py
    python3 scripts/export_openapi.py ./openapi.json
    OPENAPI_OUTPUT=../frontend/openapi.json python3 scripts/export_openapi.py
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path

# 允许直接 `python3 scripts/export_openapi.py` 运行时找到 app 包。
_BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(_BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(_BACKEND_DIR))

from app.main import create_app  # noqa: E402  (sys.path 调整后再导入)


def _resolve_output_path() -> Path:
    """解析输出路径：argv[1] > OPENAPI_OUTPUT > ../openapi.json。"""

    if len(sys.argv) > 1 and sys.argv[1]:
        return Path(sys.argv[1]).expanduser().resolve()
    env_value = os.environ.get("OPENAPI_OUTPUT")
    if env_value:
        return Path(env_value).expanduser().resolve()
    # 默认：相对 CWD 的 ../openapi.json。
    # 多数调用场景（CWD=backend/）会落在仓库根 webui_2/openapi.json。
    return (Path.cwd() / ".." / "openapi.json").resolve()


def main() -> int:
    app = create_app()
    spec = app.openapi()

    output_path = _resolve_output_path()
    output_path.parent.mkdir(parents=True, exist_ok=True)

    payload = json.dumps(spec, ensure_ascii=False, indent=2, sort_keys=False)
    output_path.write_text(payload, encoding="utf-8")

    schema_count = len(spec.get("components", {}).get("schemas", {}))
    path_count = len(spec.get("paths", {}))
    info = spec.get("info", {})
    print(f"Saved OpenAPI spec to {output_path} ({len(payload)} bytes, {path_count} paths, {schema_count} schemas)")
    print(f"  info.title={info.get('title')!r}  info.version={info.get('version')!r}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
