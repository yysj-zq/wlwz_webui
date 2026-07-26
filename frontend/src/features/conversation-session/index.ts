/**
 * conversation-session feature barrel。
 *
 * Chat / Play 共用：`useConversationSession`；跨页读 ID：`useActiveConversationId`。
 */
export {
  useConversationSession,
  useActiveConversationId,
  useEnsureSessionCreator,
  parseConversationId,
  ariaStatusFor,
  ENSURE_SESSION_PHASE_LABEL,
} from './model';
export type { EnsurePhase, EnsureSession, EnsureSessionInput } from './model';
export { useConversationSessionStore } from './store';
export type { ConversationSessionStore } from './store';
