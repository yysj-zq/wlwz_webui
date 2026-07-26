/**
 * ConversationSession 共享 store —— Chat / Play / Roles 同源会话 ID。
 *
 * ensure 成功后写入；logout / 显式清空时归零。
 * UI 壳（ChatShell / GameShell）仍由页面 props 传入 ID；本 store 供跨页读取。
 */
import { create } from 'zustand';

export type ConversationSessionStore = {
  readonly conversationId: number | null;
  readonly setConversationId: (id: number | null) => void;
};

export const useConversationSessionStore = create<ConversationSessionStore>((set) => ({
  conversationId: null,
  setConversationId: (id) => set({ conversationId: id }),
}));
