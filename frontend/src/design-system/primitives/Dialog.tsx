/**
 * Dialog —— 基于 @radix-ui/react-dialog 的模态（DS3）。
 *
 *  - Root / Trigger / Portal / Overlay / Content
 *  - Title / Description / Close
 *  - Header / Body / Footer（布局辅助）
 *
 * Content 在未包在 Portal 内时会自动 Portal + Overlay，兼容 Root > Content 用法。
 */
import * as RadixDialog from '@radix-ui/react-dialog';
import {
  createContext,
  forwardRef,
  useContext,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type ReactNode,
} from 'react';
import { cn } from './utils';

const DialogPortalScope = createContext(false);

/* ============================================================
 * Root
 * ============================================================ */
export interface DialogRootProps {
  children: ReactNode;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function DialogRoot({ children, open, defaultOpen, onOpenChange }: DialogRootProps) {
  return (
    <RadixDialog.Root
      {...(open !== undefined ? { open } : {})}
      {...(defaultOpen !== undefined ? { defaultOpen } : {})}
      {...(onOpenChange !== undefined ? { onOpenChange } : {})}
    >
      {children}
    </RadixDialog.Root>
  );
}

/* ============================================================
 * Trigger
 * ============================================================ */
export interface DialogTriggerProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  asChild?: boolean;
}

export const DialogTrigger = forwardRef<HTMLButtonElement, DialogTriggerProps>(
  function DialogTrigger({ asChild, children, ...rest }, ref) {
    return (
      <RadixDialog.Trigger ref={ref} {...(asChild !== undefined ? { asChild } : {})} {...rest}>
        {children}
      </RadixDialog.Trigger>
    );
  },
);

/* ============================================================
 * Portal
 * ============================================================ */
export interface DialogPortalProps {
  children: ReactNode;
  container?: HTMLElement | null;
}

export function DialogPortal({ children, container }: DialogPortalProps) {
  return (
    <DialogPortalScope.Provider value={true}>
      <RadixDialog.Portal {...(container ? { container } : {})}>{children}</RadixDialog.Portal>
    </DialogPortalScope.Provider>
  );
}

/* ============================================================
 * Overlay
 * ============================================================ */
export type DialogOverlayProps = HTMLAttributes<HTMLDivElement>;

export const DialogOverlay = forwardRef<HTMLDivElement, DialogOverlayProps>(function DialogOverlay(
  { style, className, ...rest },
  ref,
) {
  return (
    <RadixDialog.Overlay
      ref={ref}
      className={cn('ds-dialog__overlay', className)}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'var(--color-overlay-scrim)',
        zIndex: 1000,
        animation: 'ds-dock-open var(--motion-duration-fast) var(--motion-easing-entrance)',
        ...style,
      }}
      {...rest}
    />
  );
});

/* ============================================================
 * Content
 * ============================================================ */
export interface DialogContentProps extends HTMLAttributes<HTMLDivElement> {
  /** 自定义 portal 容器；默认 document.body。 */
  container?: HTMLElement | null;
  /** 关闭时是否阻止 Esc。 */
  disableEscapeKeyDown?: boolean;
  /** 外点是否关闭；false 时点击 overlay 不会关闭。 */
  closeOnOutside?: boolean;
  onClose?: () => void;
}

export const DialogContent = forwardRef<HTMLDivElement, DialogContentProps>(function DialogContent(
  {
    children,
    container,
    disableEscapeKeyDown = false,
    closeOnOutside = true,
    onClose,
    style,
    className,
    onKeyDown,
    ...rest
  },
  forwardedRef,
) {
  const inPortal = useContext(DialogPortalScope);

  const content = (
    <RadixDialog.Content
      ref={forwardedRef}
      className={cn('ds-dialog__content', className)}
      onEscapeKeyDown={(event) => {
        if (disableEscapeKeyDown) {
          event.preventDefault();
          return;
        }
        onClose?.();
      }}
      onPointerDownOutside={(event) => {
        if (!closeOnOutside) {
          event.preventDefault();
          return;
        }
        onClose?.();
      }}
      onInteractOutside={(event) => {
        if (!closeOnOutside) event.preventDefault();
      }}
      {...(onKeyDown ? { onKeyDown } : {})}
      style={{
        position: 'fixed',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        zIndex: 1001,
        background: 'var(--color-surface-0)',
        color: 'var(--color-text-primary)',
        borderRadius: 'var(--radius-lg)',
        boxShadow: 'var(--shadow-xl)',
        border: '1px solid var(--color-border-subtle)',
        maxWidth: '560px',
        width: 'calc(100% - var(--size-spacing-8))',
        maxHeight: '90vh',
        overflow: 'auto',
        padding: 'var(--size-spacing-6)',
        fontFamily: 'var(--font-ui)',
        animation: 'ds-dock-open var(--motion-duration-normal) var(--motion-easing-entrance)',
        outline: 'none',
        ...style,
      }}
      {...rest}
    >
      {children}
    </RadixDialog.Content>
  );

  if (inPortal) return content;

  return (
    <RadixDialog.Portal {...(container ? { container } : {})}>
      <DialogOverlay />
      {content}
    </RadixDialog.Portal>
  );
});

/* ============================================================
 * Header / Body / Footer
 * ============================================================ */
export function DialogHeader({
  style,
  className,
  children,
  ...rest
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('ds-dialog__header', className)}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--size-spacing-1)',
        marginBottom: 'var(--size-spacing-4)',
        ...style,
      }}
      {...rest}
    >
      {children}
    </div>
  );
}

export function DialogBody({
  style,
  className,
  children,
  ...rest
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('ds-dialog__body', className)}
      style={{ marginBottom: 'var(--size-spacing-4)', ...style }}
      {...rest}
    >
      {children}
    </div>
  );
}

export function DialogFooter({
  style,
  className,
  children,
  ...rest
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('ds-dialog__footer', className)}
      style={{
        display: 'flex',
        justifyContent: 'flex-end',
        gap: 'var(--size-spacing-2)',
        ...style,
      }}
      {...rest}
    >
      {children}
    </div>
  );
}

/* ============================================================
 * Title / Description
 * ============================================================ */
export interface DialogTitleProps extends HTMLAttributes<HTMLHeadingElement> {
  as?: 'h1' | 'h2' | 'h3';
}

export const DialogTitle = forwardRef<HTMLHeadingElement, DialogTitleProps>(function DialogTitle(
  { as: Tag = 'h2', style, children, ...rest },
  ref,
) {
  return (
    <RadixDialog.Title ref={ref} asChild>
      <Tag
        className="ds-dialog__title"
        style={{
          margin: 0,
          fontFamily: 'var(--font-serif)',
          fontSize: 'var(--text-size-2xl)',
          fontWeight: 'var(--text-weight-semibold)',
          lineHeight: 'var(--text-line-height-snug)',
          color: 'var(--color-text-primary)',
          ...style,
        }}
        {...rest}
      >
        {children}
      </Tag>
    </RadixDialog.Title>
  );
});

export const DialogDescription = forwardRef<
  HTMLParagraphElement,
  HTMLAttributes<HTMLParagraphElement>
>(function DialogDescription({ style, children, ...rest }, ref) {
  return (
    <RadixDialog.Description
      ref={ref}
      className="ds-dialog__description"
      style={{
        margin: 0,
        fontSize: 'var(--text-size-sm)',
        lineHeight: 'var(--text-line-height-normal)',
        color: 'var(--color-text-secondary)',
        ...style,
      }}
      {...rest}
    >
      {children}
    </RadixDialog.Description>
  );
});

/* ============================================================
 * Close
 * ============================================================ */
export interface DialogCloseProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  asChild?: boolean;
}

export const DialogClose = forwardRef<HTMLButtonElement, DialogCloseProps>(function DialogClose(
  { asChild, children, style, ...rest },
  ref,
) {
  return (
    <RadixDialog.Close
      ref={ref}
      {...(asChild !== undefined ? { asChild } : {})}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'transparent',
        border: '1px solid transparent',
        color: 'var(--color-text-secondary)',
        padding: 'var(--size-spacing-2)',
        borderRadius: 'var(--radius-md)',
        cursor: 'pointer',
        ...style,
      }}
      {...rest}
    >
      {children ?? '关闭'}
    </RadixDialog.Close>
  );
});

/* ============================================================
 * 命名空间导出
 * ============================================================ */
export const Dialog = {
  Root: DialogRoot,
  Trigger: DialogTrigger,
  Portal: DialogPortal,
  Overlay: DialogOverlay,
  Content: DialogContent,
  Header: DialogHeader,
  Body: DialogBody,
  Footer: DialogFooter,
  Title: DialogTitle,
  Description: DialogDescription,
  Close: DialogClose,
};
