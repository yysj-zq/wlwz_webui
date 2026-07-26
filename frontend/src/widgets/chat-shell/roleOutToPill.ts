import type { RoleOut } from '@shared/api';
import type { RolePillOption } from './CircleRoleSelector';

export function roleOutToPill(role: RoleOut): RolePillOption {
  const slug = role.slug ?? String(role.id);
  const prompt = role.systemPrompt ?? '';
  const description =
    prompt.length > 40 ? `${prompt.slice(0, 40)}…` : prompt || (role.inGame ? '可扮演' : '旁观');
  return {
    slug,
    name: role.name,
    avatarUrl: role.avatarUrl ?? null,
    description,
  };
}
