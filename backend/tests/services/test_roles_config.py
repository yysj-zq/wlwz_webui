from pathlib import Path

import pytest

from app.core import settings
from app.services.roles_service import _load_roles_config

_ROLES_YAML = """
builtin_roles:
  - name: 佟湘玉
    slug: tongxiangyu
    persona: 来自 roles.yaml 的人设
  - name: 玩家
    slug: player
    persona: 外来客
"""

_CANON_YAML = """
profiles:
  tongxiangyu: |
    背景：同福客栈掌柜
"""


def test_canon_yaml_overrides_matching_persona(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    (tmp_path / "roles.yaml").write_text(_ROLES_YAML, encoding="utf-8")
    (tmp_path / "canon.v1.yaml").write_text(_CANON_YAML, encoding="utf-8")
    monkeypatch.setattr(settings, "ROLES_CONFIG_PATH", str(tmp_path / "roles.yaml"))

    roles = {item["slug"]: item["persona"] for item in _load_roles_config()}

    assert roles["tongxiangyu"] == "背景：同福客栈掌柜"
    assert roles["player"] == "外来客"


def test_missing_or_unparsed_canon_keeps_roles_persona(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    roles_path = tmp_path / "roles.yaml"
    roles_path.write_text(_ROLES_YAML, encoding="utf-8")
    monkeypatch.setattr(settings, "ROLES_CONFIG_PATH", str(roles_path))

    roles = {item["slug"]: item["persona"] for item in _load_roles_config()}
    assert roles["tongxiangyu"] == "来自 roles.yaml 的人设"

    (tmp_path / "canon.v1.yaml").write_text(":\n  - [", encoding="utf-8")
    roles = {item["slug"]: item["persona"] for item in _load_roles_config()}
    assert roles["tongxiangyu"] == "来自 roles.yaml 的人设"
