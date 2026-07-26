/**
 * SettingsPage —— 设置页（主题 / 账户 / 角色入口）。
 *
 * 对齐 plan.md pages/settings；顶栏齿轮跳转至此。
 */
import type { CSSProperties } from 'react';
import { useNavigate } from '@shared/router';
import { useTheme } from '@features/theme';
import { useAuth } from '@features/auth';
import { Button } from '@ds/primitives/Button';
import { Panel, PanelBody, PanelHeader, PanelTitle } from '@ds/patterns/Panel';

const pageStyle: CSSProperties = {
  padding: 'var(--size-spacing-6) var(--size-spacing-5)',
  maxWidth: 640,
  margin: '0 auto',
  width: '100%',
  fontFamily: 'var(--font-ui)',
  background: 'linear-gradient(135deg, var(--color-surface-0) 0%, var(--color-surface-1) 100%)',
  minHeight: '100%',
  boxSizing: 'border-box',
};

const sectionStyle: CSSProperties = {
  display: 'grid',
  gap: 'var(--size-spacing-3)',
  marginBottom: 'var(--size-spacing-5)',
};

const sectionTitleStyle: CSSProperties = {
  margin: 0,
  fontSize: 'var(--text-size-sm)',
  color: 'var(--color-text-secondary)',
  fontWeight: 'var(--text-weight-medium)',
};

export function SettingsPage() {
  const navigate = useNavigate();
  const { mode, toggleMode } = useTheme();
  const { user, logout, loading: authLoading } = useAuth();

  return (
    <main aria-labelledby="settings-title" style={pageStyle} data-testid="settings-page">
      <Panel tone="paper">
        <PanelHeader>
          <PanelTitle id="settings-title">设置</PanelTitle>
          <Button variant="ghost" size="sm" onClick={() => navigate('/')}>
            返回
          </Button>
        </PanelHeader>
        <PanelBody>
          <section style={sectionStyle} aria-labelledby="settings-appearance">
            <h2 id="settings-appearance" style={sectionTitleStyle}>
              外观
            </h2>
            <Button
              variant="secondary"
              onClick={toggleMode}
              data-testid="theme-toggle"
              aria-label={mode === 'dark' ? '切换到浅色主题' : '切换到深色主题'}
            >
              {mode === 'dark' ? '切换为浅色' : '切换为深色'}
            </Button>
          </section>

          <section style={sectionStyle} aria-labelledby="settings-account">
            <h2 id="settings-account" style={sectionTitleStyle}>
              账户
            </h2>
            {authLoading ? (
              <p
                style={{
                  margin: 0,
                  color: 'var(--color-text-muted)',
                  fontSize: 'var(--text-size-sm)',
                }}
              >
                校验登录状态…
              </p>
            ) : user ? (
              <>
                <p style={{ margin: 0, fontSize: 'var(--text-size-sm)' }}>
                  已登录：{user.email || user.username || `#${user.id}`}
                </p>
                <Button variant="ghost" onClick={() => logout()}>
                  退出登录
                </Button>
              </>
            ) : (
              <Button variant="primary" onClick={() => navigate('/auth')}>
                登录 / 注册
              </Button>
            )}
          </section>

          <section style={sectionStyle} aria-labelledby="settings-roles">
            <h2 id="settings-roles" style={sectionTitleStyle}>
              角色
            </h2>
            <Button variant="secondary" onClick={() => navigate('/roles')}>
              打开角色册
            </Button>
          </section>
        </PanelBody>
      </Panel>
    </main>
  );
}
