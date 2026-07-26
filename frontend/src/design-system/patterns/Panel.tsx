/**
 * Panel —— 通用面板容器（DS4）。
 *
 *  - tone: paper(默认) / lacquer(漆红) / ink(墨底) / glow(暖光)
 *  - bordered / elevated: 边框 + 阴影控制
 *  - inset: 内描纸边
 *  - padding: sm | md | lg | none
 *  - 全 token 化；可作 NarrativeRail / Settings 等通用容器
 */
import { forwardRef, type CSSProperties, type HTMLAttributes, type ReactNode } from 'react';
import { cn } from '../primitives/utils';

export type PanelTone = 'paper' | 'lacquer' | 'ink' | 'glow' | 'muted';
export type PanelPadding = 'none' | 'sm' | 'md' | 'lg';
export type PanelRadius = 'sm' | 'md' | 'lg' | 'xl' | '2xl';

export interface PanelProps extends HTMLAttributes<HTMLDivElement> {
  tone?: PanelTone;
  bordered?: boolean;
  elevated?: boolean;
  inset?: boolean;
  padding?: PanelPadding;
  radius?: PanelRadius;
  as?: 'div' | 'section' | 'article' | 'aside';
  children: ReactNode;
}

const TONE_STYLES: Record<PanelTone, CSSProperties> = {
  paper: {
    background: 'var(--color-surface-0)',
    color: 'var(--color-text-primary)',
  },
  lacquer: {
    background: 'var(--color-brand-lacquer)',
    color: 'var(--color-text-inverse)',
  },
  ink: {
    background: 'var(--color-brand-ink)',
    color: 'var(--color-text-inverse)',
  },
  glow: {
    background: 'var(--color-surface-1)',
    color: 'var(--color-text-primary)',
    boxShadow: 'var(--shadow-glow-lantern)',
  },
  muted: {
    background: 'var(--color-surface-2)',
    color: 'var(--color-text-secondary)',
  },
};

const PADDING: Record<PanelPadding, string> = {
  none: '0',
  sm: 'var(--size-spacing-3)',
  md: 'var(--size-spacing-5)',
  lg: 'var(--size-spacing-7)',
};

const RADIUS: Record<PanelRadius, string> = {
  sm: 'var(--radius-sm)',
  md: 'var(--radius-md)',
  lg: 'var(--radius-lg)',
  xl: 'var(--radius-xl)',
  '2xl': 'var(--radius-2xl)',
};

export const Panel = forwardRef<HTMLDivElement, PanelProps>(function Panel(
  {
    tone = 'paper',
    bordered = true,
    elevated = false,
    inset = false,
    padding = 'md',
    radius = 'lg',
    as: Tag = 'div',
    children,
    className,
    style,
    ...rest
  },
  ref,
) {
  const combined: CSSProperties = {
    ...TONE_STYLES[tone],
    border: bordered ? '1px solid var(--color-border-subtle)' : 'none',
    boxShadow: elevated
      ? tone === 'glow'
        ? 'var(--shadow-glow-lantern)'
        : 'var(--shadow-lg)'
      : inset
        ? 'var(--shadow-inset-paper)'
        : undefined,
    borderRadius: RADIUS[radius],
    padding: PADDING[padding],
    fontFamily: 'var(--font-ui)',
    ...style,
  };
  return (
    <Tag
      ref={ref}
      className={cn('ds-panel', `ds-panel--${tone}`, className)}
      style={combined}
      {...rest}
    >
      {children}
    </Tag>
  );
});

/* ============================================================
 * 子件：PanelHeader / PanelBody / PanelFooter / PanelTitle
 * ============================================================ */
export function PanelHeader({
  children,
  className,
  style,
  ...rest
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('ds-panel__header', className)}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 'var(--size-spacing-3)',
        marginBottom: 'var(--size-spacing-3)',
        ...style,
      }}
      {...rest}
    >
      {children}
    </div>
  );
}

export function PanelTitle({
  children,
  className,
  style,
  ...rest
}: HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3
      className={cn('ds-panel__title', className)}
      style={{
        margin: 0,
        fontFamily: 'var(--font-serif)',
        fontSize: 'var(--text-size-xl)',
        fontWeight: 'var(--text-weight-semibold)',
        lineHeight: 'var(--text-line-height-snug)',
        color: 'var(--color-text-primary)',
        ...style,
      }}
      {...rest}
    >
      {children}
    </h3>
  );
}

export function PanelBody({ children, className, style, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('ds-panel__body', className)} style={{ ...style }} {...rest}>
      {children}
    </div>
  );
}

export function PanelFooter({
  children,
  className,
  style,
  ...rest
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('ds-panel__footer', className)}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'flex-end',
        gap: 'var(--size-spacing-2)',
        marginTop: 'var(--size-spacing-4)',
        ...style,
      }}
      {...rest}
    >
      {children}
    </div>
  );
}
