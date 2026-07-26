/**
 * AppHeader —— 产品顶栏（对齐 _legacy Header.js）。
 *
 * 品牌：「武林外传 AI 聊天」+「STORY CONSOLE」
 * 操作：侧栏 / 新对话 / Chat↔Game / 设置
 */
import type { CSSProperties } from 'react';
import { IconButton } from '@ds/primitives/IconButton';
import { Button } from '@ds/primitives/Button';

export type ViewMode = 'chat' | 'game';

export interface AppHeaderProps {
  readonly viewMode: ViewMode;
  readonly onSidebarToggle?: () => void;
  readonly onNewChat?: () => void;
  readonly onViewModeChange?: (mode: ViewMode) => void;
  readonly onOpenSettings?: () => void;
  readonly condensed?: boolean;
}

const headerStyle: CSSProperties = {
  position: 'sticky',
  top: 0,
  zIndex: 40,
  flexShrink: 0,
  background: 'var(--shell-header-bg)',
  backdropFilter: 'blur(8px) saturate(110%)',
  WebkitBackdropFilter: 'blur(8px) saturate(110%)',
  borderBottom: '1px solid var(--shell-header-border)',
};

const toolbarStyle = (condensed: boolean): CSSProperties => ({
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--size-spacing-1)',
  minHeight: condensed ? 56 : 62,
  padding: '0 var(--size-spacing-5)',
  width: '100%',
  transition: 'min-height 180ms ease, background 180ms ease',
});

const brandStyle: CSSProperties = {
  flex: 1,
  minWidth: 0,
  paddingLeft: 'var(--size-spacing-1)',
};

const titleStyle: CSSProperties = {
  margin: 0,
  fontFamily: 'var(--font-ui)',
  fontWeight: 'var(--text-weight-semibold)',
  fontSize: 'var(--text-size-sm)',
  letterSpacing: '0.02em',
  color: 'var(--shell-header-title)',
  lineHeight: 1.15,
};

const subtitleStyle: CSSProperties = {
  margin: 0,
  display: 'block',
  fontSize: 'var(--text-size-xs)',
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: 'var(--shell-header-subtitle)',
  opacity: 0.7,
};

const actionBtnStyle: CSSProperties = {
  width: 36,
  height: 36,
  marginLeft: 4,
  borderRadius: 10,
  color: 'var(--shell-action-fg)',
  background: 'transparent',
  border: 'none',
  boxShadow: 'none',
};

const modeBtnStyle: CSSProperties = {
  marginLeft: 4,
  height: 34,
  borderRadius: 12,
  textTransform: 'none' as const,
  color: 'var(--shell-action-fg)',
  border: '1px solid var(--shell-mode-border)',
  background: 'var(--shell-mode-bg)',
  fontSize: 'var(--text-size-sm)',
  fontWeight: 'var(--text-weight-medium)',
  padding: '0 12px',
  transition: 'background 160ms ease, color 160ms ease, transform 160ms ease',
};

function SidebarIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 5h16v14H4V5zm6 0v14"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <path
        d="M19.4 13.5v-3l1.6-1.4-1.5-2.6-2.1.5a7.2 7.2 0 0 0-1.5-.9L15.5 4h-3l-.4 2.1c-.5.2-1 .5-1.5.9l-2.1-.5-1.5 2.6L8.6 10.5v3l-1.6 1.4 1.5 2.6 2.1-.5c.5.4 1 .7 1.5.9l.4 2.1h3l.4-2.1c.5-.2 1-.5 1.5-.9l2.1.5 1.5-2.6-1.6-1.4Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ChatIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M5 6.5A2.5 2.5 0 0 1 7.5 4h9A2.5 2.5 0 0 1 19 6.5v6A2.5 2.5 0 0 1 16.5 15H10l-4 4v-4.2A2.5 2.5 0 0 1 5 12.5v-6Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function GameIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M7 9h10a4 4 0 0 1 3.9 4.8l-.7 3.2A2.5 2.5 0 0 1 17.8 19H6.2a2.5 2.5 0 0 1-2.4-2l-.7-3.2A4 4 0 0 1 7 9Z"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <path
        d="M9 13h2M10 12v2M15.5 12.5h.01M17 14.5h.01"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function AppHeader({
  viewMode,
  onSidebarToggle,
  onNewChat,
  onViewModeChange,
  onOpenSettings,
  condensed = false,
}: AppHeaderProps) {
  return (
    <header style={headerStyle} data-testid="app-header">
      <div style={toolbarStyle(condensed)}>
        <div style={brandStyle}>
          <p style={titleStyle}>武林外传 AI 聊天</p>
          <span style={subtitleStyle}>Story Console</span>
        </div>

        {onSidebarToggle ? (
          <IconButton
            variant="ghost"
            size="sm"
            aria-label="显示或隐藏会话列表"
            onClick={onSidebarToggle}
            style={actionBtnStyle}
            className="app-header-action"
          >
            <SidebarIcon />
          </IconButton>
        ) : null}

        {onNewChat ? (
          <IconButton
            variant="ghost"
            size="sm"
            aria-label="新建对话"
            onClick={onNewChat}
            style={actionBtnStyle}
            className="app-header-action"
          >
            <PlusIcon />
          </IconButton>
        ) : null}

        {onViewModeChange ? (
          <Button
            variant="ghost"
            size="sm"
            leftIcon={viewMode === 'game' ? <ChatIcon /> : <GameIcon />}
            onClick={() => onViewModeChange(viewMode === 'game' ? 'chat' : 'game')}
            style={modeBtnStyle}
            className="app-header-mode"
            aria-label={viewMode === 'game' ? '切换到对话模式' : '切换到游戏模式'}
            data-testid="view-mode-toggle"
          >
            {viewMode === 'game' ? '对话' : '游戏'}
          </Button>
        ) : null}

        <IconButton
          variant="ghost"
          size="sm"
          aria-label="打开设置"
          onClick={() => onOpenSettings?.()}
          style={actionBtnStyle}
          className="app-header-action"
          data-testid="open-settings"
        >
          <SettingsIcon />
        </IconButton>
      </div>
    </header>
  );
}
