/**
 * DropdownMenu —— 基于 @radix-ui/react-dropdown-menu 的下拉菜单（DS3）。
 *
 *  - Root / Trigger / Content / Item / Separator / Label
 *  - Item 保留 id / danger / onSelect API
 */
import * as RadixMenu from '@radix-ui/react-dropdown-menu';
import {
  forwardRef,
  isValidElement,
  type HTMLAttributes,
  type ReactElement,
  type ReactNode,
} from 'react';
import { cn } from './utils';

/* ============================================================
 * Root
 * ============================================================ */
export interface DropdownMenuRootProps {
  children: ReactNode;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function DropdownMenuRoot({
  children,
  open,
  defaultOpen,
  onOpenChange,
}: DropdownMenuRootProps) {
  return (
    <RadixMenu.Root
      {...(open !== undefined ? { open } : {})}
      {...(defaultOpen !== undefined ? { defaultOpen } : {})}
      {...(onOpenChange !== undefined ? { onOpenChange } : {})}
    >
      {children}
    </RadixMenu.Root>
  );
}

/* ============================================================
 * Trigger
 * ============================================================ */
export interface DropdownMenuTriggerProps extends HTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  asChild?: boolean;
}

export const DropdownMenuTrigger = forwardRef<HTMLButtonElement, DropdownMenuTriggerProps>(
  function DropdownMenuTrigger({ asChild, children, ...rest }, ref) {
    const useAsChild = asChild ?? isValidElement(children);
    return (
      <RadixMenu.Trigger ref={ref} asChild={useAsChild} {...rest}>
        {useAsChild && isValidElement(children) ? (children as ReactElement) : children}
      </RadixMenu.Trigger>
    );
  },
);

/* ============================================================
 * Content
 * ============================================================ */
export interface DropdownMenuContentProps extends HTMLAttributes<HTMLDivElement> {
  container?: HTMLElement | null;
  /** 与 trigger 的像素间距。 */
  sideOffset?: number;
  align?: 'start' | 'center' | 'end';
}

export const DropdownMenuContent = forwardRef<HTMLDivElement, DropdownMenuContentProps>(
  function DropdownMenuContent(
    { children, container, sideOffset = 6, align = 'start', style, className, ...rest },
    ref,
  ) {
    return (
      <RadixMenu.Portal {...(container ? { container } : {})}>
        <RadixMenu.Content
          ref={ref}
          sideOffset={sideOffset}
          align={align}
          className={cn('ds-menu__content', className)}
          style={{
            background: 'var(--color-surface-0)',
            color: 'var(--color-text-primary)',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--color-border-subtle)',
            boxShadow: 'var(--shadow-lg)',
            padding: 'var(--size-spacing-1)',
            minWidth: '180px',
            maxHeight: '320px',
            overflow: 'auto',
            zIndex: 1500,
            animation: 'ds-dock-open var(--motion-duration-fast) var(--motion-easing-entrance)',
            outline: 'none',
            fontFamily: 'var(--font-ui)',
            ...style,
          }}
          {...rest}
        >
          {children}
        </RadixMenu.Content>
      </RadixMenu.Portal>
    );
  },
);

/* ============================================================
 * Item
 * ============================================================ */
export interface DropdownMenuItemProps extends HTMLAttributes<HTMLDivElement> {
  /** 该 item 的稳定 id。 */
  id: string;
  /** 危险项（漆红文字）。 */
  danger?: boolean;
  disabled?: boolean;
  onSelect?: () => void;
}

export const DropdownMenuItem = forwardRef<HTMLDivElement, DropdownMenuItemProps>(
  function DropdownMenuItem(
    { id, danger, disabled, onSelect, onClick, style, className, children, ...rest },
    ref,
  ) {
    return (
      <RadixMenu.Item
        ref={ref}
        {...(disabled !== undefined ? { disabled } : {})}
        data-ds-menu-id={id}
        className={cn('ds-menu__item', danger && 'ds-menu__item--danger', className)}
        onSelect={() => {
          if (disabled) return;
          onSelect?.();
        }}
        {...(onClick !== undefined ? { onClick } : {})}
        style={{
          padding: 'var(--size-spacing-2) var(--size-spacing-3)',
          borderRadius: 'var(--radius-sm)',
          fontSize: 'var(--text-size-base)',
          fontWeight: 'var(--text-weight-regular)',
          color: disabled
            ? 'var(--color-text-muted)'
            : danger
              ? 'var(--color-brand-lacquer)'
              : 'var(--color-text-primary)',
          cursor: disabled ? 'not-allowed' : 'pointer',
          outline: 'none',
          userSelect: 'none',
          ...style,
        }}
        {...rest}
      >
        {children}
      </RadixMenu.Item>
    );
  },
);

/* ============================================================
 * Separator / Label
 * ============================================================ */
export function DropdownMenuSeparator({ style, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <RadixMenu.Separator
      className="ds-menu__separator"
      style={{
        height: 1,
        background: 'var(--color-border-subtle)',
        margin: 'var(--size-spacing-1) 0',
        ...style,
      }}
      {...rest}
    />
  );
}

export function DropdownMenuLabel({ style, children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <RadixMenu.Label
      className="ds-menu__label"
      style={{
        padding: 'var(--size-spacing-2) var(--size-spacing-3) var(--size-spacing-1)',
        fontSize: 'var(--text-size-xs)',
        fontWeight: 'var(--text-weight-semibold)',
        color: 'var(--color-text-muted)',
        letterSpacing: 'var(--text-letter-wide)',
        textTransform: 'uppercase',
        ...style,
      }}
      {...rest}
    >
      {children}
    </RadixMenu.Label>
  );
}

/* ============================================================
 * Hover 样式（注入到全局 CSS / Storybook preview）
 * ============================================================ */
export const DROPDOWN_GLOBAL_CSS = `
.ds-menu__item:not([data-disabled]):hover,
.ds-menu__item:not([data-disabled]):focus-visible,
.ds-menu__item[data-highlighted] {
  background: var(--color-surface-2);
  outline: none;
}
.ds-menu__item--danger:not([data-disabled]):hover,
.ds-menu__item--danger:not([data-disabled]):focus-visible,
.ds-menu__item--danger[data-highlighted] {
  background: var(--color-overlay-paper-soft);
}
`;

/* ============================================================
 * 命名空间
 * ============================================================ */
export const DropdownMenu = {
  Root: DropdownMenuRoot,
  Trigger: DropdownMenuTrigger,
  Content: DropdownMenuContent,
  Item: DropdownMenuItem,
  Separator: DropdownMenuSeparator,
  Label: DropdownMenuLabel,
};
