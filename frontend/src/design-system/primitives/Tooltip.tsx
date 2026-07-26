/**
 * Tooltip —— 基于 @radix-ui/react-tooltip 的悬浮提示（DS3）。
 *
 *  - Root: Provider + 状态容器（受控/非受控）；side / align / delayMs 经 context 传给 Content
 *  - Trigger: 触发元素（asChild 包裹单一 ReactElement）
 *  - Content: Portal 浮层
 *  - Arrow: 可选箭头
 */
import * as RadixTooltip from '@radix-ui/react-tooltip';
import {
  createContext,
  forwardRef,
  isValidElement,
  useContext,
  useMemo,
  type ComponentPropsWithoutRef,
  type CSSProperties,
  type HTMLAttributes,
  type ReactElement,
  type ReactNode,
} from 'react';
import { cn } from './utils';

export type TooltipSide = 'top' | 'right' | 'bottom' | 'left';
export type TooltipAlign = 'start' | 'center' | 'end';

interface TooltipConfigValue {
  side: TooltipSide;
  align: TooltipAlign;
}

const TooltipConfig = createContext<TooltipConfigValue>({
  side: 'top',
  align: 'center',
});

/* ============================================================
 * Root
 * ============================================================ */
export interface TooltipRootProps {
  children: ReactNode;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  side?: TooltipSide;
  align?: TooltipAlign;
  /** 触发延迟（ms）。 */
  delayMs?: number;
}

export function TooltipRoot({
  children,
  open,
  defaultOpen,
  onOpenChange,
  side = 'top',
  align = 'center',
  delayMs = 120,
}: TooltipRootProps) {
  const config = useMemo(() => ({ side, align }), [side, align]);
  return (
    <RadixTooltip.Provider delayDuration={delayMs}>
      <RadixTooltip.Root
        {...(open !== undefined ? { open } : {})}
        {...(defaultOpen !== undefined ? { defaultOpen } : {})}
        {...(onOpenChange !== undefined ? { onOpenChange } : {})}
      >
        <TooltipConfig.Provider value={config}>{children}</TooltipConfig.Provider>
      </RadixTooltip.Root>
    </RadixTooltip.Provider>
  );
}

/* ============================================================
 * Trigger —— 包裹任意可聚焦元素
 * ============================================================ */
export interface TooltipTriggerProps extends HTMLAttributes<HTMLElement> {
  /** 子元素（必须是单个 ReactElement）。 */
  children: ReactElement;
}

export const TooltipTrigger = forwardRef<HTMLElement, TooltipTriggerProps>(function TooltipTrigger(
  { children, ...rest },
  forwardedRef,
) {
  if (!isValidElement(children)) {
    throw new Error('TooltipTrigger requires a single React element child');
  }
  return (
    <RadixTooltip.Trigger ref={forwardedRef as React.Ref<HTMLButtonElement>} asChild {...rest}>
      {children}
    </RadixTooltip.Trigger>
  );
});

/* ============================================================
 * Content
 * ============================================================ */
export interface TooltipContentProps extends HTMLAttributes<HTMLDivElement> {
  container?: HTMLElement | null;
  /** 与 trigger 的像素间距。 */
  sideOffset?: number;
  /** 内容 ID（用于 aria-describedby）；留空由 Radix 生成。 */
  id?: string;
  side?: TooltipSide;
  align?: TooltipAlign;
}

export const TooltipContent = forwardRef<HTMLDivElement, TooltipContentProps>(
  function TooltipContent(
    { children, container, sideOffset = 6, id, side, align, style, className, ...rest },
    forwardedRef,
  ) {
    const config = useContext(TooltipConfig);
    return (
      <RadixTooltip.Portal {...(container ? { container } : {})}>
        <RadixTooltip.Content
          ref={forwardedRef}
          side={side ?? config.side}
          align={align ?? config.align}
          sideOffset={sideOffset}
          className={cn('ds-tooltip__content', className)}
          style={{
            background: 'var(--color-brand-ink)',
            color: 'var(--color-text-inverse)',
            fontFamily: 'var(--font-ui)',
            fontSize: 'var(--text-size-sm)',
            lineHeight: 'var(--text-line-height-snug)',
            padding: 'var(--size-spacing-2) var(--size-spacing-3)',
            borderRadius: 'var(--radius-sm)',
            boxShadow: 'var(--shadow-md)',
            maxWidth: '320px',
            zIndex: 1500,
            animation: 'ds-dock-open var(--motion-duration-fast) var(--motion-easing-entrance)',
            ...style,
          }}
          {...(id !== undefined ? { id } : {})}
          {...(rest as ComponentPropsWithoutRef<typeof RadixTooltip.Content>)}
        >
          {children}
        </RadixTooltip.Content>
      </RadixTooltip.Portal>
    );
  },
);

/* ============================================================
 * Arrow（可选）
 * ============================================================ */
export function TooltipArrow({ className, style }: { className?: string; style?: CSSProperties }) {
  return (
    <RadixTooltip.Arrow
      className={cn('ds-tooltip__arrow', className)}
      width={8}
      height={4}
      style={{
        fill: 'var(--color-brand-ink)',
        ...style,
      }}
    />
  );
}

/* ============================================================
 * 命名空间
 * ============================================================ */
export const Tooltip = {
  Root: TooltipRoot,
  Trigger: TooltipTrigger,
  Content: TooltipContent,
  Arrow: TooltipArrow,
};
