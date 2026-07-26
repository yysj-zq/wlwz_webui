/**
 * A11y 基线（Phase 1 A1-6）：skip-link + 焦点环 token。
 *
 *  - 屏幕阅读器用户跳过导航直达主内容
 *  - 全局焦点环用 token（Phase 3 DS5 motion 接入后替换为 Motion 动画）
 */
import type { ReactNode } from 'react';

export function SkipLink({ targetId = 'main-content' }: { targetId?: string }) {
  return (
    <a
      href={`#${targetId}`}
      style={{
        position: 'absolute',
        left: '-9999px',
        top: 'auto',
        width: 1,
        height: 1,
        overflow: 'hidden',
      }}
      onFocus={(e) => {
        const el = e.currentTarget;
        el.style.left = '8px';
        el.style.top = '8px';
        el.style.width = 'auto';
        el.style.height = 'auto';
        el.style.padding = '8px 16px';
        el.style.background = 'var(--color-lacquer)';
        el.style.color = 'var(--color-text-inverse)';
        el.style.zIndex = '9999';
        el.style.borderRadius = '4px';
      }}
      onBlur={(e) => {
        const el = e.currentTarget;
        el.style.left = '-9999px';
        el.style.top = 'auto';
        el.style.width = '1px';
        el.style.height = '1px';
      }}
    >
      跳到主要内容
    </a>
  );
}

export function MainContent({
  children,
  id = 'main-content',
}: {
  children: ReactNode;
  id?: string;
}) {
  return (
    <main id={id} tabIndex={-1} style={{ outline: 'none' }}>
      {children}
    </main>
  );
}
