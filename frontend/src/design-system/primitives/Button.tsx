/**
 * Button —— Radix 风格无依赖按钮（DS3）。
 *
 *  - variants: primary | secondary | ghost | danger | lacquer
 *  - sizes:    sm | md | lg
 *  - states:   loading / disabled / fullWidth
 *  - 全部 token 化（颜色 / 圆角 / 阴影 / 时长 / 字重）
 *  - 默认 type=button，避免表单外误触发表单提交
 *  - loading 时显示 ds-breathe 圈点
 *  - 键盘可达：Enter / Space 触发 onClick
 *  - 交互：对齐 `_legacy` Header actionButtonSx（subtle bg / 160ms ease / pressed scale）
 */
import { forwardRef, type ButtonHTMLAttributes, type CSSProperties, type ReactNode } from 'react';
import { cn } from './utils';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'lacquer';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  fullWidth?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  children?: ReactNode;
}

const VARIANT_STYLES: Record<ButtonVariant, CSSProperties> = {
  primary: {
    background: 'var(--color-brand-lantern)',
    color: 'var(--color-text-primary)',
    border: '1px solid var(--color-brand-lantern)',
    boxShadow: 'var(--shadow-sm)',
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
    boxShadow: 'var(--shadow-sm)',
  },
  lacquer: {
    background: 'var(--color-brand-lacquer)',
    color: 'var(--color-text-inverse)',
    border: '1px solid var(--color-brand-lacquer)',
    boxShadow: 'var(--shadow-glow-lacquer)',
  },
};

const SIZE_STYLES: Record<ButtonSize, CSSProperties> = {
  sm: {
    height: 'var(--size-spacing-7)',
    padding: '0 var(--size-spacing-3)',
    fontSize: 'var(--text-size-sm)',
    gap: 'var(--size-spacing-1)',
    borderRadius: 'var(--radius-sm)',
  },
  md: {
    height: 'var(--size-spacing-9)',
    padding: '0 var(--size-spacing-4)',
    fontSize: 'var(--text-size-base)',
    gap: 'var(--size-spacing-2)',
    borderRadius: 'var(--radius-md)',
  },
  lg: {
    height: 'var(--size-spacing-12)',
    padding: '0 var(--size-spacing-6)',
    fontSize: 'var(--text-size-lg)',
    gap: 'var(--size-spacing-2)',
    borderRadius: 'var(--radius-md)',
  },
};

const INTERACTIVE_TRANSITION =
  'background 160ms ease, color 160ms ease, box-shadow 160ms ease, transform 160ms ease, opacity 160ms ease, border-color 160ms ease';

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'primary',
    size = 'md',
    loading = false,
    fullWidth = false,
    leftIcon,
    rightIcon,
    disabled,
    className,
    children,
    type = 'button',
    style,
    ...rest
  },
  ref,
) {
  const isDisabled = disabled || loading;
  const base: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: 'var(--font-ui)',
    fontWeight: 'var(--text-weight-semibold)',
    lineHeight: 1,
    cursor: isDisabled ? 'not-allowed' : 'pointer',
    userSelect: 'none',
    opacity: isDisabled ? 0.55 : 1,
    width: fullWidth ? '100%' : undefined,
    transition: INTERACTIVE_TRANSITION,
    outline: 'none',
    position: 'relative',
    whiteSpace: 'nowrap',
    ...VARIANT_STYLES[variant],
    ...SIZE_STYLES[size],
    ...style,
  };

  return (
    <button
      ref={ref}
      type={type}
      disabled={isDisabled}
      data-variant={variant}
      data-size={size}
      data-loading={loading || undefined}
      aria-busy={loading || undefined}
      className={cn('ds-button', `ds-button--${variant}`, `ds-button--${size}`, className)}
      style={base}
      {...rest}
    >
      {loading ? (
        <span
          aria-hidden
          className="ds-breathe"
          style={{
            display: 'inline-block',
            width: '0.6em',
            height: '0.6em',
            borderRadius: 'var(--radius-full)',
            background: 'currentColor',
            marginRight: 'var(--size-spacing-1)',
          }}
        />
      ) : leftIcon ? (
        <span aria-hidden style={{ display: 'inline-flex' }}>
          {leftIcon}
        </span>
      ) : null}
      <span>{children}</span>
      {rightIcon ? (
        <span aria-hidden style={{ display: 'inline-flex' }}>
          {rightIcon}
        </span>
      ) : null}
    </button>
  );
});

/** hover / focus / active 全局样式（由 app/styles/global.css 注入；此处供 Storybook / 文档复用）。 */
export const BUTTON_GLOBAL_CSS = `
.ds-button--ghost:not(:disabled):hover,
.ds-button--secondary:not(:disabled):hover {
  background: var(--shell-action-hover, var(--color-overlay-ink-soft)) !important;
}
.ds-button--primary:not(:disabled):hover {
  box-shadow: var(--shadow-glow-lantern) !important;
}
.ds-button--danger:not(:disabled):hover,
.ds-button--lacquer:not(:disabled):hover {
  box-shadow: var(--shadow-glow-lacquer) !important;
}
.ds-button:not(:disabled):active {
  transform: scale(0.97);
}
.ds-button:focus-visible {
  box-shadow: var(--shadow-focus-ring) !important;
}
.ds-button:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}
@media (prefers-reduced-motion: reduce) {
  .ds-button {
    transition-duration: 0.01ms !important;
  }
  .ds-button:not(:disabled):active {
    transform: none;
  }
}
`;
