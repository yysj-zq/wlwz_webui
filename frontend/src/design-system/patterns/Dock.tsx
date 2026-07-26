/**
 * Dock —— 交互 Dock pattern（DS4）。
 *
 *  - 自下而上展开（复用 motion.DockMotion）
 *  - 提供 slot 给 Action（Button / IconButton 等）
 *  - 集成位置：底部居中 / 跟随 anchor
 *  - tone: paper(默认) / lacquer(强调) / ink(夜话)
 */
import { forwardRef, type CSSProperties, type HTMLAttributes, type ReactNode } from 'react';
import { cn } from '../primitives/utils';
import { DockMotion } from '../motion/recipes';

export type DockTone = 'paper' | 'lacquer' | 'ink';

export interface DockProps extends HTMLAttributes<HTMLDivElement> {
  open: boolean;
  tone?: DockTone;
  /** 固定在视口底部（默认）。 */
  position?: 'viewport-bottom' | 'inline';
  children: ReactNode;
}

const TONE_STYLE: Record<DockTone, CSSProperties> = {
  paper: {
    background: 'var(--color-surface-0)',
    color: 'var(--color-text-primary)',
    border: '1px solid var(--color-border-subtle)',
    boxShadow: 'var(--shadow-lg)',
  },
  lacquer: {
    background: 'var(--color-brand-lacquer)',
    color: 'var(--color-text-inverse)',
    border: '1px solid var(--color-brand-lacquer)',
    boxShadow: 'var(--shadow-glow-lacquer)',
  },
  ink: {
    background: 'var(--color-brand-ink)',
    color: 'var(--color-text-inverse)',
    border: '1px solid var(--color-brand-ink)',
    boxShadow: 'var(--shadow-lg)',
  },
};

export const Dock = forwardRef<HTMLDivElement, DockProps>(function Dock(
  { open, tone = 'paper', position = 'viewport-bottom', children, className, style, ...rest },
  ref,
) {
  const combined: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--size-spacing-2)',
    padding: 'var(--size-spacing-3) var(--size-spacing-4)',
    borderRadius: 'var(--radius-lg)',
    fontFamily: 'var(--font-ui)',
    ...TONE_STYLE[tone],
    ...(position === 'viewport-bottom'
      ? {
          position: 'fixed',
          bottom: 'var(--size-spacing-6)',
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 1100,
        }
      : {}),
    ...style,
  };
  return (
    <DockMotion open={open}>
      <div
        ref={ref}
        role="toolbar"
        aria-label="交互 Dock"
        data-tone={tone}
        className={cn('ds-pattern-dock', `ds-pattern-dock--${tone}`, className)}
        style={combined}
        {...rest}
      >
        {children}
      </div>
    </DockMotion>
  );
});

export default Dock;
