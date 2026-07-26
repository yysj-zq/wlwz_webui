/**
 * PlayPage（Phase 2 VS9）。
 *
 * URL: `/play/:conversationId?`。
 *
 * 职责：
 *  1. 从 URL 解析 conversationId
 *  2. 调 useEnsureSession 状态机：
 *      - 有 ID → 调 /conversations/{id}/world 读取
 *      - 无 ID  → 调 /conversations 创建新会话（POST ensure）
 *  3. 拿到 ConversationWorldRead 后 → 把会话 ID 写回 URL（replaceState）
 *  4. 渲染 GameShell；加载态 / 错误态给占位 UI
 *  5. 处理 create 触发（idle / error 门闸）
 *
 * a11y：aria-live 推送 ensure-session phase；用 SR 友好的提示文案。
 * 视觉：不自带产品顶栏（AppHeader 已有）；门闸态安静居中。
 */
import { useEffect, useMemo, type CSSProperties } from 'react';
import { useParams, useNavigate, playPath } from '@shared/router';
import { useConversationSession } from '@features/conversation-session';
import { Button } from '@ds/primitives/Button';
import { GameShell } from '@widgets/game-shell';
import type { WorldState } from '@shared/api';

export interface PlayPageProps {
  /** 强制当作新建（隐藏读取路径，强制 create）。 */
  readonly forceNew?: boolean;
  /** 自定义 className。 */
  readonly className?: string;
  /** 自定义 style。 */
  readonly style?: CSSProperties;
}

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
  fontFamily: 'var(--font-ui)',
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

export function PlayPage({ forceNew = false, className, style }: PlayPageProps) {
  const params = useParams();
  const navigate = useNavigate();

  const urlConversationId = params.conversationId ?? null;

  const { phase, conversationId, world, error, ariaStatus, retry, create } = useConversationSession(
    {
      urlConversationId,
      forceNew,
    },
  );

  useEffect(() => {
    if (phase !== 'ready') return;
    // conversationId 优先（来自 URL parsedId）；world 可能是上一轮会话残留
    const id = conversationId ?? world?.id;
    if (id === null || id === undefined) return;
    if (urlConversationId && Number(urlConversationId) === id) return;
    navigate(playPath(id), { replace: true });
  }, [phase, world?.id, conversationId, urlConversationId, navigate]);

  const initialWorld: WorldState | null = useMemo(() => world?.worldState ?? null, [world]);

  const conversationIdNum: number | null = useMemo(() => {
    if (conversationId !== null) return conversationId;
    const wid = world?.id;
    return typeof wid === 'number' ? wid : null;
  }, [conversationId, world?.id]);

  return (
    <div
      className={className}
      style={{ ...pageBaseStyle, ...style }}
      data-testid="play-page"
      data-ensure-phase={phase}
    >
      <div style={contentStyle}>
        {phase === 'error' ? (
          <ErrorPanel message={error?.message ?? '未知错误'} onRetry={retry} onNew={create} />
        ) : phase === 'idle' ? (
          <IdlePanel onStart={create} />
        ) : phase === 'ready' && conversationIdNum !== null ? (
          <GameShell conversationId={conversationIdNum} initialWorld={initialWorld} />
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
      <p style={{ fontSize: 'var(--text-size-lg)', margin: 0 }}>正在搭台…</p>
      <p style={{ fontSize: 'var(--text-size-sm)', color: 'var(--color-text-muted)', margin: 0 }}>
        {message}
      </p>
    </div>
  );
}

function IdlePanel({ onStart }: { onStart: () => void }) {
  return (
    <div style={statusStyle} role="region" aria-label="未开始">
      <p style={{ fontSize: 'var(--text-size-lg)', margin: 0 }}>戏未开场</p>
      <p style={{ fontSize: 'var(--text-size-sm)', color: 'var(--color-text-muted)', margin: 0 }}>
        点击下方按钮，新开一场同福客栈。
      </p>
      <Button variant="primary" size="md" onClick={onStart} data-testid="play-page-start">
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
      <p style={{ fontSize: 'var(--text-size-lg)', color: 'var(--color-lacquer)', margin: 0 }}>
        戏台故障
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
        <Button variant="ghost" size="md" onClick={onRetry} data-testid="play-page-retry">
          重试
        </Button>
        <Button variant="primary" size="md" onClick={onNew} data-testid="play-page-new-on-error">
          新开一场
        </Button>
      </div>
    </div>
  );
}

export default PlayPage;
