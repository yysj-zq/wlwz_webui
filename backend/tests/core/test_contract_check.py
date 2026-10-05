"""contract_check：lock 缺失 / 本地组成漂移应失败。"""

from __future__ import annotations

import json
from pathlib import Path

import pytest
import yaml

from app.core import contract_check as cc
from app.core import prompts as prompts_module
from app.core import settings


def _write_fake_lock(path: Path, components: dict[str, str]) -> None:
    payload = {
        "contract_version": "contract.v1",
        "contract_fingerprint": "sha256:" + ("0" * 64),
        "components": dict(sorted(components.items())),
        "canon_source": "model_pipeline/data/profiles/canon.v1.yaml",
        "generated_by": "tests.fake",
        "generated_note": "minimal fake lock for webui contract_check tests",
    }
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def _matching_lock_components() -> dict[str, str]:
    local = cc.compute_local_component_digests()
    # metrics 不在 webui 树：不重算，但 lock 必须有该 key。
    local[cc.METRICS_COMPONENT_ID] = "a" * 64
    return local


def test_verify_or_raise_fails_when_lock_missing(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    missing = tmp_path / "contract.lock.json"
    monkeypatch.setattr(cc, "_LOCK_PATH_OVERRIDE", missing)

    with pytest.raises(cc.ContractCheckError, match="contract.lock.json missing"):
        cc.verify_or_raise()


def test_verify_or_raise_passes_with_matching_fake_lock(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    lock_path = tmp_path / "contract.lock.json"
    _write_fake_lock(lock_path, _matching_lock_components())
    monkeypatch.setattr(cc, "_LOCK_PATH_OVERRIDE", lock_path)

    cc.verify_or_raise()


def test_verify_or_raise_fails_when_metrics_key_missing(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    components = cc.compute_local_component_digests()
    lock_path = tmp_path / "contract.lock.json"
    _write_fake_lock(lock_path, components)
    monkeypatch.setattr(cc, "_LOCK_PATH_OVERRIDE", lock_path)

    with pytest.raises(cc.ContractCheckError, match="missing required component key: 'metrics'"):
        cc.verify_or_raise()


def test_verify_or_raise_fails_when_roles_tampered(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    # 先用真实 roles 生成匹配 lock，再指向被篡改的 roles。
    # YAML 注释会被 safe_load 丢掉，必须改语义内容才能改变 canonical digest。
    lock_path = tmp_path / "contract.lock.json"
    _write_fake_lock(lock_path, _matching_lock_components())

    with cc.roles_path().open("r", encoding="utf-8") as f:
        roles_data = yaml.safe_load(f)
    roles_data["__contract_check_tamper__"] = True
    tampered_roles = tmp_path / "roles.yaml"
    tampered_roles.write_text(
        yaml.safe_dump(roles_data, sort_keys=True, allow_unicode=True),
        encoding="utf-8",
    )

    monkeypatch.setattr(cc, "_LOCK_PATH_OVERRIDE", lock_path)
    monkeypatch.setattr(settings, "ROLES_CONFIG_PATH", str(tampered_roles))

    with pytest.raises(cc.ContractCheckError, match="component 'roles' digest mismatch"):
        cc.verify_or_raise()


def test_verify_or_raise_fails_when_prompts_tampered(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    lock_path = tmp_path / "contract.lock.json"
    _write_fake_lock(lock_path, _matching_lock_components())
    monkeypatch.setattr(cc, "_LOCK_PATH_OVERRIDE", lock_path)
    monkeypatch.setattr(
        prompts_module,
        "DIRECTOR_SYSTEM_PROMPT",
        prompts_module.DIRECTOR_SYSTEM_PROMPT + "\n# tampered\n",
    )

    with pytest.raises(cc.ContractCheckError, match="component 'prompts' digest mismatch"):
        cc.verify_or_raise()
