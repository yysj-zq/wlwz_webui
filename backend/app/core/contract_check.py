"""启动时对照 ``contract.lock.json`` 校验本地可及契约组成。

算法与 ``model_pipeline/contracts/fingerprint.py`` 对齐；本模块禁止 import model_pipeline。
``metrics`` 不在 webui 树内：不重算，但要求 lock.components 中存在该 key。
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any

import yaml
from langchain_core.utils.function_calling import convert_to_openai_tool

from app.core import prompts as prompts_module
from app.core.config import settings
from app.graph.tools.registry import DIRECTOR_TOOLS, NPC_TOOLS

# 本地可及组成（相对 webui backend）；metrics 仅要求 lock 含 key。
# 人读 contract_version 只存在于 lock 中，由 model_pipeline publish 自动分配；本模块不硬编码。

LOCAL_COMPONENT_IDS: tuple[str, ...] = (
    "prompts",
    "prompt_render",
    "timeline_render",
    "tools_director",
    "tools_npc",
    "roles",
    "canon",
    "world_schema",
    "world_enums",
)

PROMPT_CONSTANT_NAMES: tuple[str, ...] = (
    "DIRECTOR_SYSTEM_PROMPT",
    "NPC_SYSTEM_PROMPT_TEMPLATE",
    "COMPACTOR_SYSTEM_PROMPT",
    "SUMMARIZER_SYSTEM_PROMPT",
)

METRICS_COMPONENT_ID = "metrics"

# 测试可 monkeypatch 为临时 lock 路径。
_LOCK_PATH_OVERRIDE: Path | None = None


class ContractCheckError(RuntimeError):
    """契约锁缺失或本地组成与 lock 不一致。"""


def backend_root() -> Path:
    return Path(__file__).resolve().parents[2]


def contract_lock_path() -> Path:
    if _LOCK_PATH_OVERRIDE is not None:
        return _LOCK_PATH_OVERRIDE
    return backend_root() / "config" / "contract.lock.json"


def roles_path() -> Path:
    path = Path(settings.ROLES_CONFIG_PATH)
    if path.is_absolute():
        return path
    return backend_root() / path


def canon_path() -> Path:
    return backend_root() / "config" / "canon.v1.yaml"


def prompt_render_path() -> Path:
    return backend_root() / "app" / "graph" / "prompt_render.py"


def timeline_service_path() -> Path:
    return backend_root() / "app" / "services" / "timeline_service.py"


def world_schema_path() -> Path:
    return backend_root() / "app" / "schemas" / "world.py"


def world_enums_path() -> Path:
    return backend_root() / "app" / "schemas" / "enums.py"


def normalize_text(text: str) -> str:
    """UTF-8 text: unify newlines to ``\\n``; ensure exactly one trailing ``\\n``."""
    normalized = text.replace("\r\n", "\n").replace("\r", "\n")
    return normalized.rstrip("\n") + "\n"


def sha256_hex(payload: bytes) -> str:
    return hashlib.sha256(payload).hexdigest()


def source_file_payload(path: Path) -> bytes:
    raw = path.read_text(encoding="utf-8")
    return normalize_text(raw).encode("utf-8")


def yaml_canonical_payload(path: Path) -> bytes:
    with path.open("r", encoding="utf-8") as f:
        data = yaml.safe_load(f)
    dumped = yaml.safe_dump(data, sort_keys=True, allow_unicode=True)
    return dumped.encode("utf-8")


def prompt_constants_payload(constant_names: tuple[str, ...] | list[str] = PROMPT_CONSTANT_NAMES) -> bytes:
    """Prompt 常量值各自 newline-normalize 后按列出顺序拼接。"""
    parts: list[str] = []
    for name in constant_names:
        value = getattr(prompts_module, name)
        if not isinstance(value, str):
            raise TypeError(f"prompt constant {name} must be str, got {type(value)}")
        parts.append(normalize_text(value))
    return "".join(parts).encode("utf-8")


def tool_schemas_payload(tools: list[Any]) -> bytes:
    """``convert_to_openai_tool`` → 按 ``function.name`` 排序 → canonical JSON。"""
    schemas = [convert_to_openai_tool(t) for t in tools]
    schemas.sort(key=lambda s: s["function"]["name"])
    text = json.dumps(schemas, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return text.encode("utf-8")


def component_digest(payload: bytes) -> str:
    return sha256_hex(payload)


def compute_local_component_digests() -> dict[str, str]:
    """重算 webui 本地可及组成的 component digest。"""
    return {
        "prompts": component_digest(prompt_constants_payload()),
        "prompt_render": component_digest(source_file_payload(prompt_render_path())),
        "timeline_render": component_digest(source_file_payload(timeline_service_path())),
        "tools_director": component_digest(tool_schemas_payload(list(DIRECTOR_TOOLS))),
        "tools_npc": component_digest(tool_schemas_payload(list(NPC_TOOLS))),
        "roles": component_digest(yaml_canonical_payload(roles_path())),
        "canon": component_digest(yaml_canonical_payload(canon_path())),
        "world_schema": component_digest(source_file_payload(world_schema_path())),
        "world_enums": component_digest(source_file_payload(world_enums_path())),
    }


def load_lock(path: Path | None = None) -> dict[str, Any]:
    lock_path = path if path is not None else contract_lock_path()
    if not lock_path.is_file():
        raise ContractCheckError(f"contract.lock.json missing: {lock_path}")
    with lock_path.open("r", encoding="utf-8") as f:
        data = json.load(f)
    if not isinstance(data, dict):
        raise ContractCheckError(f"contract.lock.json must be a JSON object: {lock_path}")
    return data


def verify_or_raise(lock_path: Path | None = None) -> None:
    """读 lock，重算本地可及组成 digest 并与 ``lock.components`` 比对；失败抛 ``ContractCheckError``。"""
    lock = load_lock(lock_path)
    lock_components = lock.get("components")
    if not isinstance(lock_components, dict):
        raise ContractCheckError("contract.lock.json missing components mapping")

    if METRICS_COMPONENT_ID not in lock_components:
        raise ContractCheckError(f"contract.lock.json missing required component key: {METRICS_COMPONENT_ID!r}")

    local = compute_local_component_digests()
    mismatches: list[str] = []
    for cid in LOCAL_COMPONENT_IDS:
        if cid not in lock_components:
            mismatches.append(f"component {cid!r}: missing from lock.components")
            continue
        expected = lock_components[cid]
        actual = local[cid]
        if expected != actual:
            mismatches.append(f"component {cid!r} digest mismatch: lock={expected!r} local={actual!r}")

    if mismatches:
        raise ContractCheckError("contract surface drift detected:\n" + "\n".join(mismatches))
