/**
 * AuthPage —— 登录 / 注册（视觉 ≈ `_legacy` App.js Auth Dialog）。
 *
 * 居中 Dialog 卡片 + Tabs；字段与旧版一致（邮箱 / 密码；注册可填昵称）。
 */
import { useState, type CSSProperties, type FormEvent } from 'react';
import { useAuth } from '@features/auth';
import { Button } from '@ds/primitives/Button';
import { Dialog } from '@ds/primitives/Dialog';
import { Tabs } from '@ds/primitives/Tabs';

const pageStyle: CSSProperties = {
  minHeight: '100%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 'var(--size-spacing-6)',
  fontFamily: 'var(--font-ui)',
  background: 'linear-gradient(135deg, var(--color-surface-0) 0%, var(--color-surface-1) 100%)',
};

const fieldStyle: CSSProperties = {
  display: 'grid',
  gap: 'var(--size-spacing-1)',
  fontSize: 'var(--text-size-sm)',
  color: 'var(--color-text-secondary)',
};

const inputStyle: CSSProperties = {
  fontFamily: 'var(--font-ui)',
  fontSize: 'var(--text-size-base)',
  padding: 'var(--size-spacing-2) var(--size-spacing-3)',
  borderRadius: 'var(--radius-md)',
  border: '1px solid var(--color-border-default)',
  background: 'var(--color-surface-0)',
  color: 'var(--color-text-primary)',
};

const dialogSurfaceStyle: CSSProperties = {
  borderRadius: 'var(--radius-2xl)',
  background: 'linear-gradient(180deg, var(--color-surface-0), var(--color-surface-1))',
  boxShadow: 'var(--shadow-xl)',
  border: '1px solid var(--color-border-subtle)',
  backdropFilter: 'blur(16px)',
  maxWidth: 420,
};

export function AuthPage() {
  const auth = useAuth();
  const [open, setOpen] = useState(true);
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === 'login') {
        await auth.login(email, password);
      } else {
        await auth.register(email, password, username);
        await auth.login(email, password);
      }
      setOpen(false);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : mode === 'login'
            ? '登录失败，请检查邮箱和密码后重试。'
            : '注册失败，请稍后重试。',
      );
    } finally {
      setBusy(false);
    }
  }

  const isLogin = mode === 'login';

  return (
    <main aria-labelledby="auth-page-title" style={pageStyle} data-testid="auth-page">
      <h1
        id="auth-page-title"
        style={{
          position: 'absolute',
          width: 1,
          height: 1,
          overflow: 'hidden',
          clip: 'rect(0, 0, 0, 0)',
        }}
      >
        账户
      </h1>

      {!open && auth.user ? (
        <div style={{ textAlign: 'center', display: 'grid', gap: 'var(--size-spacing-3)' }}>
          <p
            style={{ fontFamily: 'var(--font-serif)', fontSize: 'var(--text-size-lg)', margin: 0 }}
          >
            已登录为 {auth.user.username ?? auth.user.email}
          </p>
          <Button variant="ghost" size="md" onClick={() => auth.logout()}>
            退出登录
          </Button>
          <Button variant="secondary" size="md" onClick={() => setOpen(true)}>
            重新打开登录
          </Button>
        </div>
      ) : null}

      {!open && !auth.user ? (
        <Button variant="primary" size="md" onClick={() => setOpen(true)}>
          打开登录
        </Button>
      ) : null}

      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Content closeOnOutside={false} data-testid="auth-dialog" style={dialogSurfaceStyle}>
          <Dialog.Header>
            <Dialog.Title>{isLogin ? '登录' : '注册'}</Dialog.Title>
            <Dialog.Description>
              {isLogin ? '使用邮箱与密码登录，继续你的戏台。' : '创建账号后即可进入戏台与聊天。'}
            </Dialog.Description>
          </Dialog.Header>

          <Dialog.Body>
            <Tabs.Root
              value={mode}
              onValueChange={(v) => {
                setMode(v === 'register' ? 'register' : 'login');
                setError(null);
              }}
            >
              <Tabs.List aria-label="登录或注册">
                <Tabs.Trigger value="login">登录</Tabs.Trigger>
                <Tabs.Trigger value="register">注册</Tabs.Trigger>
              </Tabs.List>

              <Tabs.Content value="login" style={{ paddingTop: 'var(--size-spacing-3)' }}>
                <AuthForm
                  isLogin
                  email={email}
                  password={password}
                  username={username}
                  error={error}
                  busy={busy}
                  onEmail={setEmail}
                  onPassword={setPassword}
                  onUsername={setUsername}
                  onSubmit={(e) => void submit(e)}
                  onCancel={() => {
                    if (!busy) {
                      setError(null);
                      setOpen(false);
                    }
                  }}
                  onSwitch={() => {
                    setMode('register');
                    setError(null);
                  }}
                />
              </Tabs.Content>

              <Tabs.Content value="register" style={{ paddingTop: 'var(--size-spacing-3)' }}>
                <AuthForm
                  isLogin={false}
                  email={email}
                  password={password}
                  username={username}
                  error={error}
                  busy={busy}
                  onEmail={setEmail}
                  onPassword={setPassword}
                  onUsername={setUsername}
                  onSubmit={(e) => void submit(e)}
                  onCancel={() => {
                    if (!busy) {
                      setError(null);
                      setOpen(false);
                    }
                  }}
                  onSwitch={() => {
                    setMode('login');
                    setError(null);
                  }}
                />
              </Tabs.Content>
            </Tabs.Root>
          </Dialog.Body>
        </Dialog.Content>
      </Dialog.Root>
    </main>
  );
}

function AuthForm({
  isLogin,
  email,
  password,
  username,
  error,
  busy,
  onEmail,
  onPassword,
  onUsername,
  onSubmit,
  onCancel,
  onSwitch,
}: {
  isLogin: boolean;
  email: string;
  password: string;
  username: string;
  error: string | null;
  busy: boolean;
  onEmail: (v: string) => void;
  onPassword: (v: string) => void;
  onUsername: (v: string) => void;
  onSubmit: (e: FormEvent) => void;
  onCancel: () => void;
  onSwitch: () => void;
}) {
  return (
    <form
      onSubmit={onSubmit}
      style={{ display: 'grid', gap: 'var(--size-spacing-3)' }}
      aria-label={isLogin ? '登录表单' : '注册表单'}
    >
      {!isLogin ? (
        <label style={fieldStyle}>
          昵称
          <input
            style={inputStyle}
            value={username}
            onChange={(e) => onUsername(e.target.value)}
            autoComplete="nickname"
            aria-label="昵称"
            name="username"
          />
        </label>
      ) : null}
      <label style={fieldStyle}>
        邮箱
        <input
          required
          type="email"
          autoComplete="email"
          name="email"
          inputMode="email"
          spellCheck={false}
          style={inputStyle}
          value={email}
          onChange={(e) => onEmail(e.target.value)}
          aria-label="邮箱"
          autoFocus={isLogin}
        />
      </label>
      <label style={fieldStyle}>
        密码
        <input
          required
          type="password"
          autoComplete={isLogin ? 'current-password' : 'new-password'}
          name="password"
          style={inputStyle}
          value={password}
          onChange={(e) => onPassword(e.target.value)}
          aria-label="密码"
        />
      </label>
      {error ? (
        <p role="alert" style={{ margin: 0, minHeight: 24, color: 'var(--color-brand-lacquer)' }}>
          {error}
        </p>
      ) : (
        <p role="status" aria-live="polite" style={{ margin: 0, minHeight: 24 }} />
      )}
      <Dialog.Footer style={{ marginTop: 'var(--size-spacing-1)' }}>
        <Button type="button" variant="ghost" size="md" onClick={onCancel} disabled={busy}>
          取消
        </Button>
        <Button type="button" variant="ghost" size="md" onClick={onSwitch} disabled={busy}>
          {isLogin ? '去注册' : '去登录'}
        </Button>
        <Button type="submit" variant="primary" size="md" loading={busy}>
          {busy ? (isLogin ? '登录中…' : '注册中…') : isLogin ? '登录' : '注册'}
        </Button>
      </Dialog.Footer>
    </form>
  );
}

export default AuthPage;
