/**
 * ChatPage —— 聊天模式入口。
 *
 * 与 PlayPage 同源：`useConversationSession` ensure 会话，就绪后渲染 ChatShell。
 * 自包含全高 flex 列，适配父级 App shell（不自带产品顶栏，避免与壳层重复）。
 *
 * URL: `/` 或 `/chat/:conversationId?`（产品壳默认主体验）
 */
import { useEffect, useMemo, type CSSProperties } from 'react';
import { useParams, useNavigate, useLocation, chatPath } from '@shared/router';
import { useConversationSession } from '@features/conversation-session';
import { Button } from '@ds/primitives/Button';
import { ChatShell } from '@widgets/chat-shell/ChatShell';

const pageBaseStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  flex: 1,
  width: '100%',
  height: '100%',
  minHeight: 0,
  fontFamily: 'var(--font-ui)',
};

const contentStyle: CSSProperties = {
  flex: 1,
  minHeight: 0,
  display: 'flex',
  flexDirection: 'column',
};

const statusStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 'var(--size-spacing-3)',
  padding: 'var(--size-spacing-7)',
  textAlign: 'center',
  fontFamily: 'var(--font-serif)',
  color: 'var(--color-text-secondary)',
  flex: 1,
};

const ariaStatusStyle: CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: 'hidden',
  clip: 'rect(0, 0, 0, 0)',
  whiteSpace: 'nowrap',
};

export function ChatPage() {
  const location = useLocation();
  const params = useParams();
  const navigate = useNavigate();
  // `/` 与 `/chat` 同为 chat 主体验；会话 ID 只出现在 `/chat/:id`
  const urlConversationId =
    location.pathname === '/' || location.pathname === '' ? null : (params.conversationId ?? null);

  const { phase, conversationId, world, error, ariaStatus, retry, create } = useConversationSession(
    {
      urlConversationId,
    },
  );

  useEffect(() => {
    if (phase !== 'ready') return;
    // conversationId 优先（来自 URL parsedId）；world 可能是上一轮会话残留
    const id = conversationId ?? world?.id;
    if (id === null || id === undefined) return;
    if (urlConversationId && Number(urlConversationId) === id) return;
    navigate(chatPath(id), { replace: true });
  }, [phase, world?.id, conversationId, urlConversationId, navigate]);

  const conversationIdNum: number | null = useMemo(() => {
    if (conversationId !== null) return conversationId;
    const wid = world?.id;
    return typeof wid === 'number' ? wid : null;
  }, [conversationId, world?.id]);

  return (
    <div style={pageBaseStyle} data-testid="chat-page" data-ensure-phase={phase}>
      <div style={contentStyle}>
        {phase === 'error' ? (
          <ErrorPanel message={error?.message ?? '未知错误'} onRetry={retry} onNew={create} />
        ) : phase === 'idle' ? (
          <IdlePanel onStart={create} />
        ) : phase === 'ready' && conversationIdNum !== null ? (
          <ChatShell conversationId={conversationIdNum} />
        ) : (
          <LoadingPanel message={ariaStatus} />
        )}
      </div>

      <span role="status" aria-live="polite" style={ariaStatusStyle}>
        {ariaStatus}
      </span>
    </div>
  );
}

function LoadingPanel({ message }: { message: string }) {
  return (
    <div style={statusStyle} role="region" aria-busy="true">
      <p style={{ fontSize: 'var(--text-size-lg)', margin: 0 }}>正在接通会话…</p>
      <p style={{ fontSize: 'var(--text-size-sm)', color: 'var(--color-text-muted)', margin: 0 }}>
        {message}
      </p>
    </div>
  );
}

function IdlePanel({ onStart }: { onStart: () => void }) {
  return (
    <div style={statusStyle} role="region" aria-label="未开始">
      <p style={{ fontSize: 'var(--text-size-2xl)', margin: 0 }}>舞台已就绪</p>
      <p style={{ fontSize: 'var(--text-size-sm)', color: 'var(--color-text-muted)', margin: 0 }}>
        写下第一句台词，故事会从你按下发送的瞬间开始。
      </p>
      <Button variant="primary" size="md" onClick={onStart} data-testid="chat-page-start">
        开场
      </Button>
    </div>
  );
}

function ErrorPanel({
  message,
  onRetry,
  onNew,
}: {
  message: string;
  onRetry: () => void;
  onNew: () => void;
}) {
  return (
    <div style={statusStyle} role="alert" aria-label="出错了">
      <p
        style={{ fontSize: 'var(--text-size-lg)', color: 'var(--color-brand-lacquer)', margin: 0 }}
      >
        会话故障
      </p>
      <p
        style={{
          fontSize: 'var(--text-size-sm)',
          color: 'var(--color-text-muted)',
          margin: 0,
          maxWidth: 480,
        }}
      >
        {message}
      </p>
      <div style={{ display: 'flex', gap: 'var(--size-spacing-2)' }}>
        <Button variant="ghost" size="md" onClick={onRetry} data-testid="chat-page-retry">
          重试
        </Button>
        <Button variant="primary" size="md" onClick={onNew} data-testid="chat-page-new-on-error">
          新开一场
        </Button>
      </div>
    </div>
  );
}

export default ChatPage;
