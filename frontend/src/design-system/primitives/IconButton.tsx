/**
 * IconButton —— 等比正方形按钮（DS3）。
 *
 *  - 复用 Button 视觉系统，仅尺寸按 size 计算成正方形
 *  - aria-label 必填（屏幕阅读器识别按钮用途）
 *  - 仅渲染图标（children 为 ReactNode）
 *  - 交互：对齐 `_legacy` Header actionButtonSx（subtle bg / 160ms ease / pressed scale）
 */
import { forwardRef, type ButtonHTMLAttributes, type CSSProperties, type ReactNode } from 'react';
import { cn } from './utils';

export type IconButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'lacquer';
export type IconButtonSize = 'sm' | 'md' | 'lg';

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  variant?: IconButtonVariant;
  size?: IconButtonSize;
  /** aria-label 必填（用于 SR 识别）。 */
  'aria-label': string;
  children: ReactNode;
}

const VARIANT: Record<IconButtonVariant, CSSProperties> = {
  primary: {
    background: 'var(--color-brand-lantern)',
    color: 'var(--color-text-primary)',
    border: '1px solid var(--color-brand-lantern)',
  },
  secondary: {
    background: 'var(--color-surface-1)',
    color: 'var(--color-text-primary)',
    border: '1px solid var(--color-border-default)',
  },
  ghost: {
    background: 'transparent',
    color: 'var(--color-text-primary)',
    border: '1px solid transparent',
  },
  danger: {
    background: 'var(--color-brand-lacquer)',
    color: 'var(--color-text-inverse)',
    border: '1px solid var(--color-brand-lacquer)',
  },
  lacquer: {
    background: 'var(--color-brand-lacquer)',
    color: 'var(--color-text-inverse)',
    border: '1px solid var(--color-brand-lacquer)',
  },
};

const SIZE_TO_BOX: Record<IconButtonSize, string> = {
  sm: 'var(--size-spacing-7)',
  md: 'var(--size-spacing-9)',
  lg: 'var(--size-spacing-12)',
};

const SIZE_TO_RADIUS: Record<IconButtonSize, string> = {
  sm: 'var(--radius-sm)',
  md: 'var(--radius-md)',
  lg: 'var(--radius-md)',
};

const INTERACTIVE_TRANSITION =
  'background 160ms ease, color 160ms ease, box-shadow 160ms ease, transform 160ms ease, opacity 160ms ease, border-color 160ms ease';

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  {
    variant = 'ghost',
    size = 'md',
    disabled,
    className,
    children,
    type = 'button',
    style,
    ...rest
  },
  ref,
) {
  const box = SIZE_TO_BOX[size];
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled}
      data-variant={variant}
      data-size={size}
      className={cn(
        'ds-iconbutton',
        `ds-iconbutton--${variant}`,
        `ds-iconbutton--${size}`,
        className,
      )}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: box,
        height: box,
        borderRadius: SIZE_TO_RADIUS[size],
        fontFamily: 'var(--font-ui)',
        fontWeight: 'var(--text-weight-semibold)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.55 : 1,
        outline: 'none',
        transition: INTERACTIVE_TRANSITION,
        ...VARIANT[variant],
        ...style,
      }}
      {...rest}
    >
      <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
        {children}
      </span>
    </button>
  );
});

/** hover / focus / active 全局样式（由 app/styles/global.css 注入）。 */
export const ICONBUTTON_GLOBAL_CSS = `
.ds-iconbutton:not(:disabled):hover {
  background: var(--shell-action-hover, var(--color-overlay-ink-soft)) !important;
}
.ds-iconbutton--primary:not(:disabled):hover {
  background: var(--color-brand-lantern) !important;
  box-shadow: var(--shadow-glow-lantern) !important;
}
.ds-iconbutton--danger:not(:disabled):hover,
.ds-iconbutton--lacquer:not(:disabled):hover {
  box-shadow: var(--shadow-glow-lacquer) !important;
}
.ds-iconbutton:not(:disabled):active {
  transform: scale(0.96);
}
.ds-iconbutton:focus-visible {
  box-shadow: var(--shadow-focus-ring) !important;
}
.ds-iconbutton:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}
@media (prefers-reduced-motion: reduce) {
  .ds-iconbutton {
    transition-duration: 0.01ms !important;
  }
  .ds-iconbutton:not(:disabled):active {
    transform: none;
  }
}
`;
