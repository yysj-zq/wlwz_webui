/**
 * RolesPage —— 角色册（视觉 ≈ `_legacy` RolesPage Paper 卡）。
 *
 * 卡片网格：头像 + 名 + 简述 + 扮演；会话 ID 来自 conversation-session。
 */
import { useState, type CSSProperties } from 'react';
import { useRoles } from '@shared/api/hooks';
import { useNavigate } from '@shared/router';
import type { RoleOut } from '@shared/api';
import { useActiveConversationId } from '@features/conversation-session';
import { useSetPlayedRole } from '@features/played-role';
import { Button } from '@ds/primitives/Button';
import { Panel, PanelBody, PanelHeader, PanelTitle } from '@ds/patterns/Panel';

const PLACEHOLDER_AVATAR =
  'data:image/svg+xml,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" fill="#9e9e9e"><circle cx="24" cy="24" r="24"/><text x="24" y="30" text-anchor="middle" fill="#fff" font-size="20" font-family="sans-serif">?</text></svg>',
  );

function resolveAvatar(url: string | null | undefined): string {
  if (!url) return PLACEHOLDER_AVATAR;
  if (/^https?:\/\//i.test(url) || url.startsWith('data:')) return url;
  const raw = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim();
  const base = (raw && raw.length > 0 ? raw : 'http://localhost:8081').replace(/\/+$/, '');
  return `${base}${url.startsWith('/') ? url : `/${url}`}`;
}

const pageStyle: CSSProperties = {
  padding: 'var(--size-spacing-6) var(--size-spacing-5)',
  maxWidth: 1100,
  margin: '0 auto',
  width: '100%',
  fontFamily: 'var(--font-ui)',
  background: 'linear-gradient(135deg, var(--color-surface-0) 0%, var(--color-surface-1) 100%)',
  minHeight: '100%',
  boxSizing: 'border-box',
};

const gridStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
  gap: 'var(--size-spacing-4)',
  listStyle: 'none',
  padding: 0,
  margin: 0,
};

const cardStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--size-spacing-3)',
  padding: 'var(--size-spacing-4)',
  borderRadius: 'var(--radius-xl)',
  border: '1px solid var(--color-border-subtle)',
  background: 'var(--color-surface-0)',
  boxShadow: 'var(--shadow-sm)',
  minHeight: 168,
};

export function RolesPage() {
  const roles = useRoles();
  const navigate = useNavigate();
  const conversationId = useActiveConversationId();
  const { setPlayedRole, isPending, error } = useSetPlayedRole();
  const [selected, setSelected] = useState<string | null>(null);

  const roleList: readonly RoleOut[] = roles.data ?? [];

  async function play(slug: string) {
    setSelected(slug);
    if (conversationId === null) return;
    await setPlayedRole({ conversationId, actorId: slug });
    navigate(`/play/${conversationId}`);
  }

  return (
    <main aria-labelledby="roles-title" style={pageStyle} data-testid="roles-page">
      <Panel
        tone="paper"
        elevated
        padding="lg"
        radius="2xl"
        style={{
          background: 'linear-gradient(180deg, var(--color-surface-0), var(--color-surface-1))',
          boxShadow: 'var(--shadow-lg)',
        }}
      >
        <PanelHeader>
          <p
            style={{
              margin: 0,
              fontSize: 'var(--text-size-xs)',
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              color: 'var(--color-text-muted)',
              opacity: 0.85,
            }}
          >
            Role Studio
          </p>
          <PanelTitle id="roles-title">角色配置</PanelTitle>
        </PanelHeader>
        <PanelBody>
          <p
            style={{
              margin: '0 0 var(--size-spacing-5)',
              color: 'var(--color-text-secondary)',
              fontSize: 'var(--text-size-sm)',
            }}
          >
            选择要扮演的角色；切换会同步当前会话
            {conversationId !== null ? `（#${conversationId}）` : '（请先在戏台或聊天开场）'}。
          </p>

          {roles.isPending ? <p role="status">正在加载角色…</p> : null}
          {roles.isError ? <p role="alert">角色加载失败，请稍后重试。</p> : null}
          {error ? (
            <p role="alert" style={{ color: 'var(--color-brand-lacquer)' }}>
              {error.message}
            </p>
          ) : null}

          <ul style={gridStyle}>
            {roleList.map((role) => {
              const slug = role.slug ?? String(role.id);
              const pressed = selected === slug;
              const prompt = role.systemPrompt ?? '';
              const blurb =
                prompt.length > 72
                  ? `${prompt.slice(0, 72)}…`
                  : prompt || (role.inGame ? '可进入戏台扮演' : '旁观角色');
              return (
                <li key={role.id} style={cardStyle}>
                  <div
                    style={{ display: 'flex', alignItems: 'center', gap: 'var(--size-spacing-3)' }}
                  >
                    <img
                      src={resolveAvatar(role.avatarUrl)}
                      alt=""
                      width={52}
                      height={52}
                      style={{
                        width: 52,
                        height: 52,
                        borderRadius: 'var(--radius-full)',
                        objectFit: 'cover',
                        border: '1px solid var(--color-border-subtle)',
                        background: 'var(--color-surface-2)',
                      }}
                      onError={(e) => {
                        e.currentTarget.src = PLACEHOLDER_AVATAR;
                      }}
                    />
                    <div style={{ minWidth: 0 }}>
                      <div
                        style={{
                          fontWeight: 600,
                          fontSize: 'var(--text-size-base)',
                          color: 'var(--color-text-primary)',
                        }}
                      >
                        {role.name}
                      </div>
                      <div
                        style={{
                          fontSize: 'var(--text-size-xs)',
                          color: 'var(--color-text-muted)',
                          marginTop: 2,
                        }}
                      >
                        {role.inGame ? '可扮演' : '旁观'}
                        {role.isBuiltin ? ' · 内置' : role.isMine ? ' · 我的' : ''}
                      </div>
                    </div>
                  </div>
                  <p
                    style={{
                      margin: 0,
                      flex: 1,
                      fontSize: 'var(--text-size-sm)',
                      color: 'var(--color-text-secondary)',
                      lineHeight: 1.45,
                    }}
                  >
                    {blurb}
                  </p>
                  <Button
                    variant={pressed ? 'lacquer' : 'secondary'}
                    size="sm"
                    loading={isPending && pressed}
                    disabled={!role.inGame || conversationId === null}
                    aria-pressed={pressed}
                    onClick={() => void play(slug)}
                    data-testid={`role-play-${slug}`}
                    fullWidth
                  >
                    {conversationId === null ? '需先开场' : pressed ? '已选' : '扮演'}
                  </Button>
                </li>
              );
            })}
          </ul>
        </PanelBody>
      </Panel>
    </main>
  );
}

export default RolesPage;
