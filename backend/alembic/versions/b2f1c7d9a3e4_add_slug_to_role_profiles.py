"""add slug to role_profiles

Revision ID: b2f1c7d9a3e4
Revises: 91a31990f9df
Create Date: 2026-07-22 09:10:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "b2f1c7d9a3e4"
down_revision: str | Sequence[str] | None = "91a31990f9df"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# 内置角色 name → 拼音 slug 的稳定映射。内置角色启动时会按 yaml 重建并写入 slug，
# 此处回填仅为保证迁移后存量内置行也带正确 slug、不破坏唯一索引。
_BUILTIN_NAME_TO_SLUG: dict[str, str] = {
    "佟湘玉": "tongxiangyu",
    "白展堂": "baizhantang",
    "郭芙蓉": "guofurong",
    "李大嘴": "lidazui",
    "吕秀才": "lvxiucai",
    "莫小贝": "moxiaobei",
    "燕小六": "yanxiaoliu",
    "祝无双": "zhuwushuang",
    "邢育森": "xingyusen",
}


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column("role_profiles", sa.Column("slug", sa.String(length=64), nullable=True))
    op.create_index(op.f("ix_role_profiles_slug"), "role_profiles", ["slug"], unique=True)

    # 回填存量内置角色 slug（按 name 匹配拼音）
    for name, slug in _BUILTIN_NAME_TO_SLUG.items():
        op.execute(
            sa.text(
                "UPDATE role_profiles SET slug = :slug WHERE name = :name AND is_builtin = true AND slug IS NULL"
            ).bindparams(slug=slug, name=name)
        )

    # 回填存量自定义角色 slug = 'custom' || id
    op.execute("UPDATE role_profiles SET slug = 'custom' || id WHERE is_builtin = false AND slug IS NULL")


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f("ix_role_profiles_slug"), table_name="role_profiles")
    op.drop_column("role_profiles", "slug")
