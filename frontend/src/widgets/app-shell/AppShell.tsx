/**
 * AppShell —— 产品主壳：顶栏 + 侧栏槽 + 主内容槽。
 *
 * slots:
 *  - sidebar：会话列表（由 App 注入 ConversationSidebar）
 *  - main：Chat 或 Play 页面
 */
import type { CSSProperties, ReactNode } from 'react';
import { AppHeader, type ViewMode } from './AppHeader';

export interface AppShellProps {
  readonly viewMode: ViewMode;
  readonly onViewModeChange: (mode: ViewMode) => void;
  readonly onNewChat: () => void;
  readonly onOpenSettings?: () => void;
  readonly sidebar: ReactNode;
  readonly main: ReactNode;
  readonly sidebarOpen: boolean;
  readonly onSidebarOpenChange: (open: boolean) => void;
}

const rootStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
  minHeight: 0,
  background: 'transparent',
};

const mainStyle: CSSProperties = {
  flex: 1,
  minHeight: 0,
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
};

export function AppShell({
  viewMode,
  onViewModeChange,
  onNewChat,
  onOpenSettings,
  sidebar,
  main,
  sidebarOpen,
  onSidebarOpenChange,
}: AppShellProps) {
  return (
    <div style={rootStyle} data-testid="app-shell" data-view-mode={viewMode}>
      <a href="#main-content" className="skip-link">
        跳到主内容
      </a>

      <AppHeader
        viewMode={viewMode}
        onSidebarToggle={() => onSidebarOpenChange(!sidebarOpen)}
        onNewChat={onNewChat}
        onViewModeChange={onViewModeChange}
        {...(onOpenSettings ? { onOpenSettings } : {})}
      />

      {sidebar}

      <main id="main-content" className="app-shell-main" tabIndex={-1} style={mainStyle}>
        {main}
      </main>
    </div>
  );
}
