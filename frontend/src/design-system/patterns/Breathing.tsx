/**
 * Breathing —— HUD 候场呼吸 pattern（DS4）。
 *
 *  - 复用 motion.Breathing，提供语义化 props
 *  - tone: lantern(暖光晕) / standard(纯缩放)
 *  - label: 候场/思考中/落幕 等 HUD 文案
 *  - active=false 时不显示动画
 */
import { forwardRef, type CSSProperties, type HTMLAttributes, type ReactNode } from 'react';
import { cn } from '../primitives/utils';
import { Breathing as MotionBreathing } from '../motion/recipes';

export interface BreathingProps extends HTMLAttributes<HTMLDivElement> {
  active: boolean;
  /** 暖光晕（适合 TurnHUD 候场）；默认 true。 */
  lantern?: boolean;
  /** 文案（候场/思考中/落幕）。 */
  label?: ReactNode;
  /** tone: ink(默认) / lacquer(漆红强调)。 */
  tone?: 'ink' | 'lacquer';
  children?: ReactNode;
}

export const BreathingPattern = forwardRef<HTMLDivElement, BreathingProps>(
  function BreathingPattern(
    { active, lantern = true, label, tone = 'ink', children, className, style, ...rest },
    ref,
  ) {
    const accent = tone === 'lacquer' ? 'var(--color-brand-lacquer)' : 'var(--color-brand-lantern)';
    const combined: CSSProperties = {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 'var(--size-spacing-2)',
      padding: 'var(--size-spacing-2) var(--size-spacing-3)',
      borderRadius: 'var(--radius-full)',
      background: 'var(--color-surface-1)',
      color: 'var(--color-text-primary)',
      border: `1px solid var(--color-border-subtle)`,
      fontFamily: 'var(--font-ui)',
      fontSize: 'var(--text-size-sm)',
      fontWeight: 'var(--text-weight-medium)',
      ...style,
    };
    return (
      <div
        ref={ref}
        role="status"
        aria-live="polite"
        data-active={active}
        className={cn('ds-pattern-breathing', `ds-pattern-breathing--${tone}`, className)}
        style={combined}
        {...rest}
      >
        <MotionBreathing active={active && lantern} as="span">
          <span
            aria-hidden
            style={{
              display: 'inline-block',
              width: 8,
              height: 8,
              borderRadius: 'var(--radius-full)',
              background: accent,
            }}
          />
        </MotionBreathing>
        {label ? <span>{label}</span> : null}
        {children}
      </div>
    );
  },
);

export default BreathingPattern;
