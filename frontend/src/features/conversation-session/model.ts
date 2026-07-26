/**
 * ConversationSession feature —— Chat / Play 共享的「确保会话就绪」入口。
 *
 * 包装 `features/ensure-session`：解析 URL → loading/creating → ready，
 * 并把就绪后的 conversationId 写入共享 store，供 Roles 等跨页消费。
 */
import { useEffect } from 'react';
import {
  useEnsureSession,
  useEnsureSessionCreator,
  parseConversationId,
  ariaStatusFor,
  ENSURE_SESSION_PHASE_LABEL,
  type EnsurePhase,
  type EnsureSession,
  type EnsureSessionInput,
} from '@features/ensure-session';
import { useConversationSessionStore } from './store';

export type { EnsurePhase, EnsureSession, EnsureSessionInput };
export { parseConversationId, ariaStatusFor, ENSURE_SESSION_PHASE_LABEL, useEnsureSessionCreator };

/**
 * 页面级 hook：ensure 会话 + 同步到共享 store。
 * ChatPage / PlayPage 都应走这里，而不是各自手写 conversationId。
 */
export function useConversationSession(input: EnsureSessionInput): EnsureSession {
  const session = useEnsureSession(input);
  const setConversationId = useConversationSessionStore((s) => s.setConversationId);

  useEffect(() => {
    if (session.phase !== 'ready') return;
    const id = session.conversationId ?? session.world?.id ?? null;
    if (typeof id === 'number') {
      setConversationId(id);
    }
  }, [session.phase, session.conversationId, session.world?.id, setConversationId]);

  return session;
}

/** 跨页读取当前活跃会话 ID（RolesPage 等）。 */
export function useActiveConversationId(): number | null {
  return useConversationSessionStore((s) => s.conversationId);
}
