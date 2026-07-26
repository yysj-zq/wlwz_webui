/**
 * Conversation 实体 selectors + types（Phase 1 F1-2）。
 * 业务代码从 entities/conversation 读，禁止直接读 shared/api 的 raw response。
 */
import type {
  ConversationOut,
  ConversationRename,
  ConversationWorldRead,
  EnsureConversationRequest,
} from '@shared/api';

export type {
  ConversationOut,
  ConversationRename,
  ConversationWorldRead,
  EnsureConversationRequest,
};

export function conversationId(c: ConversationWorldRead | null | undefined): number | null {
  return c?.id ?? null;
}

export function conversationTitle(c: ConversationOut | null | undefined): string {
  return c?.title ?? '';
}
