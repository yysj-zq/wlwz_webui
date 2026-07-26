/**
 * ConversationSidebar —— 会话列表侧栏（对齐 _legacy Sidebar.js）。
 *
 * 数据：`useConversations`（shared/api 归一）+ delete/rename mutations。
 */
import { useCallback, useState, type CSSProperties } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  useRemoveConversationApiConversationsConversationIdDelete,
  useRenameConversationEndpointApiConversationsConversationIdRenamePost,
} from '@shared/api';
import { useConversations } from '@shared/api/hooks';
import { queryKeys } from '@shared/api/queryClient';
import { useAuth } from '@features/auth';
import { Button } from '@ds/primitives/Button';
import { IconButton } from '@ds/primitives/IconButton';
import { Dialog } from '@ds/primitives/Dialog';
import { ScrollArea } from '@ds/primitives/ScrollArea';

export interface ConversationSidebarProps {
  readonly open: boolean;
  readonly currentConversationId: number | null;
  readonly onSelectConversation: (id: number) => void;
  readonly onNewChat: () => void;
  readonly onClose: () => void;
  readonly isMobile?: boolean;
}

function formatStamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const overlayStyle: CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 50,
  background: 'var(--color-overlay-scrim)',
};

const drawerStyle: CSSProperties = {
  position: 'fixed',
  top: 12,
  left: 12,
  bottom: 12,
  width: 'var(--shell-drawer-width)',
  maxWidth: 'calc(100vw - 24px)',
  zIndex: 51,
  display: 'flex',
  flexDirection: 'column',
  borderRadius: 20,
  backgroundImage: 'var(--shell-sidebar-bg)',
  backdropFilter: 'blur(18px)',
  WebkitBackdropFilter: 'blur(18px)',
  boxShadow: 'var(--shell-sidebar-shadow)',
  border: 'var(--shell-sidebar-border)',
  outline: 'none',
  overflow: 'hidden',
};

const headerStyle: CSSProperties = {
  padding: 'var(--size-spacing-4) var(--size-spacing-4) var(--size-spacing-2)',
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'space-between',
  gap: 'var(--size-spacing-2)',
};

const overlineStyle: CSSProperties = {
  margin: 0,
  fontSize: 'var(--text-size-xs)',
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  opacity: 0.75,
  color: 'var(--color-text-secondary)',
};

const headingStyle: CSSProperties = {
  margin: '2px 0 0',
  fontSize: 'var(--text-size-lg)',
  fontWeight: 'var(--text-weight-bold)',
  color: 'var(--color-text-primary)',
};

const itemButtonStyle = (selected: boolean): CSSProperties => ({
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--size-spacing-2)',
  width: '100%',
  textAlign: 'left',
  border: 'none',
  borderRadius: 14,
  padding: '10px 12px',
  margin: '2px 0',
  cursor: 'pointer',
  background: selected
    ? 'color-mix(in srgb, var(--color-brand-lacquer) 18%, transparent)'
    : 'transparent',
  color: 'var(--color-text-primary)',
  fontFamily: 'var(--font-ui)',
});

function ChatBubbleIcon({ active }: { active: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M5 6.5A2.5 2.5 0 0 1 7.5 4h9A2.5 2.5 0 0 1 19 6.5v6A2.5 2.5 0 0 1 16.5 15H10l-4 4v-4.2A2.5 2.5 0 0 1 5 12.5v-6Z"
        stroke={active ? 'var(--color-brand-lacquer)' : 'currentColor'}
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M6 6l12 12M18 6L6 18"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M5 7h14M10 11v6M14 11v6M8 7l1-2h6l1 2M7 7l1 12h8l1-12"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function EditIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 16.5V20h3.5L19 8.5 15.5 5 4 16.5Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export function ConversationSidebar({
  open,
  currentConversationId,
  onSelectConversation,
  onNewChat,
  onClose,
  isMobile = false,
}: ConversationSidebarProps) {
  const { user, token } = useAuth();
  const queryClient = useQueryClient();
  const listEnabled = Boolean(token && user);

  const listQuery = useConversations({
    enabled: listEnabled && open,
    staleTime: 15_000,
  });

  const removeMutation = useRemoveConversationApiConversationsConversationIdDelete();
  const renameMutation = useRenameConversationEndpointApiConversationsConversationIdRenamePost();

  const conversations = listQuery.data ?? [];

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const invalidateList = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.conversation.list() });
  }, [queryClient]);

  const handleEditSave = useCallback(async () => {
    if (editingId === null) return;
    const title = editingTitle.trim();
    if (!title) {
      setEditingId(null);
      return;
    }
    await renameMutation.mutateAsync({ conversationId: editingId, data: { title } });
    setEditingId(null);
    await invalidateList();
  }, [editingId, editingTitle, renameMutation, invalidateList]);

  const handleConfirmDelete = useCallback(async () => {
    if (deleteId === null) return;
    await removeMutation.mutateAsync({ conversationId: deleteId });
    setDeleteId(null);
    await invalidateList();
  }, [deleteId, removeMutation, invalidateList]);

  if (!open) return null;

  return (
    <>
      <div
        role="presentation"
        style={overlayStyle}
        onClick={onClose}
        data-testid="sidebar-overlay"
      />
      <aside
        style={drawerStyle}
        role="dialog"
        aria-modal="true"
        aria-label="对话列表"
        data-testid="conversation-sidebar"
      >
        <div style={headerStyle}>
          <div>
            <p style={overlineStyle}>Conversation Hub</p>
            <h2 style={headingStyle}>对话列表</h2>
          </div>
          {isMobile ? (
            <IconButton variant="ghost" size="sm" aria-label="关闭侧边栏" onClick={onClose}>
              <CloseIcon />
            </IconButton>
          ) : null}
        </div>

        <div style={{ padding: 'var(--size-spacing-3) var(--size-spacing-4)' }}>
          <Button
            variant="primary"
            fullWidth
            leftIcon={<PlusIcon />}
            onClick={() => {
              onNewChat();
              onClose();
            }}
            style={{ borderRadius: 999 }}
          >
            新对话
          </Button>
        </div>

        <ScrollArea style={{ flex: 1, minHeight: 0, padding: '0 var(--size-spacing-2)' }}>
          {!listEnabled ? (
            <p
              style={{
                padding: 'var(--size-spacing-4)',
                textAlign: 'center',
                color: 'var(--color-text-secondary)',
                fontSize: 'var(--text-size-sm)',
              }}
            >
              登录后可同步会话列表
            </p>
          ) : listQuery.isPending ? (
            <p
              role="status"
              style={{
                padding: 'var(--size-spacing-4)',
                textAlign: 'center',
                color: 'var(--color-text-muted)',
                fontSize: 'var(--text-size-sm)',
              }}
            >
              加载中…
            </p>
          ) : conversations.length === 0 ? (
            <p
              style={{
                padding: 'var(--size-spacing-4)',
                textAlign: 'center',
                color: 'var(--color-text-secondary)',
                fontSize: 'var(--text-size-sm)',
              }}
            >
              没有对话记录
            </p>
          ) : (
            <ul style={{ listStyle: 'none', margin: 0, padding: '0 0 var(--size-spacing-4)' }}>
              {conversations.map((conv) => {
                const selected = conv.id === currentConversationId;
                const editing = editingId === conv.id;
                return (
                  <li key={conv.id} style={{ position: 'relative' }}>
                    <button
                      type="button"
                      style={itemButtonStyle(selected)}
                      aria-current={selected ? 'true' : undefined}
                      onClick={() => {
                        if (!editing) {
                          onSelectConversation(conv.id);
                          if (isMobile) onClose();
                        }
                      }}
                    >
                      <ChatBubbleIcon active={selected} />
                      <span style={{ flex: 1, minWidth: 0 }}>
                        {editing ? (
                          <input
                            value={editingTitle}
                            onChange={(e) => setEditingTitle(e.target.value)}
                            onClick={(e) => e.stopPropagation()}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                void handleEditSave();
                              } else if (e.key === 'Escape') {
                                setEditingId(null);
                              }
                            }}
                            aria-label="编辑对话标题"
                            autoFocus
                            style={{
                              width: '100%',
                              border: 'none',
                              background: 'transparent',
                              color: 'inherit',
                              font: 'inherit',
                              outline: '1px solid var(--color-border-focus)',
                              borderRadius: 8,
                              padding: '2px 6px',
                            }}
                          />
                        ) : (
                          <>
                            <span
                              style={{
                                display: 'block',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                                maxWidth: 150,
                                fontWeight: 'var(--text-weight-medium)',
                              }}
                            >
                              {conv.title}
                            </span>
                            <span
                              style={{
                                display: 'block',
                                fontSize: 'var(--text-size-xs)',
                                color: 'var(--color-text-muted)',
                              }}
                            >
                              {formatStamp(conv.createdAt)}
                            </span>
                          </>
                        )}
                      </span>
                    </button>
                    {!editing ? (
                      <div
                        style={{
                          position: 'absolute',
                          right: 4,
                          top: '50%',
                          transform: 'translateY(-50%)',
                          display: 'flex',
                          gap: 2,
                        }}
                      >
                        <IconButton
                          variant="ghost"
                          size="sm"
                          aria-label="编辑对话标题"
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingId(conv.id);
                            setEditingTitle(conv.title);
                          }}
                          style={{ width: 30, height: 30 }}
                        >
                          <EditIcon />
                        </IconButton>
                        <IconButton
                          variant="ghost"
                          size="sm"
                          aria-label="删除对话"
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteId(conv.id);
                          }}
                          style={{ width: 30, height: 30 }}
                        >
                          <TrashIcon />
                        </IconButton>
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </ScrollArea>
      </aside>

      <Dialog.Root open={deleteId !== null} onOpenChange={(next) => !next && setDeleteId(null)}>
        <Dialog.Content>
          <Dialog.Title>确认删除</Dialog.Title>
          <Dialog.Description>你确定要删除这个对话吗？此操作无法撤销。</Dialog.Description>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
            <Button variant="ghost" onClick={() => setDeleteId(null)}>
              取消
            </Button>
            <Button variant="danger" onClick={() => void handleConfirmDelete()}>
              删除
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Root>
    </>
  );
}
