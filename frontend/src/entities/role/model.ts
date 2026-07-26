/**
 * Role 实体：selectors（Phase 1 F1-2）。
 */
import type { RoleOut } from '@shared/api';

export type { RoleOut };

export function isInGame(role: RoleOut | null | undefined): boolean {
  return Boolean(role?.inGame);
}

export function findRoleBySlug(
  roles: readonly RoleOut[],
  slug: string | null | undefined,
): RoleOut | null {
  if (!slug) return null;
  return roles.find((r) => r.slug === slug) ?? null;
}
