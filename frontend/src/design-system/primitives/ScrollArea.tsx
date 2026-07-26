/**
 * ScrollArea —— 基于 @radix-ui/react-scroll-area 的滚动容器（DS3）。
 *
 *  - direction: vertical / horizontal / both
 *  - fadeBottom: 内容底部渐隐
 *  - 长列表虚拟化请用 TanStack Virtual，本组件仅做容器
 */
import * as RadixScrollArea from '@radix-ui/react-scroll-area';
import {
  forwardRef,
  useEffect,
  useRef,
  useState,
  type ComponentPropsWithoutRef,
  type CSSProperties,
  type HTMLAttributes,
  type ReactNode,
} from 'react';
import { cn } from './utils';

export type ScrollDirection = 'vertical' | 'horizontal' | 'both';

export interface ScrollAreaProps extends HTMLAttributes<HTMLDivElement> {
  /** 高度（vertical/both 时）。 */
  height?: number | string;
  /** 宽度（horizontal/both 时）。 */
  width?: number | string;
  direction?: ScrollDirection;
  /** 是否显示滚动条（默认 true）。 */
  scrollbar?: boolean;
  /** 内容底部 fade mask（用于长列表渐隐）。 */
  fadeBottom?: boolean;
  children: ReactNode;
}

const scrollbarStyle: CSSProperties = {
  display: 'flex',
  userSelect: 'none',
  touchAction: 'none',
  padding: 2,
  background: 'transparent',
  transition: 'background var(--motion-duration-fast) var(--motion-easing-standard)',
};

const thumbStyle: CSSProperties = {
  flex: 1,
  background: 'var(--color-border-default)',
  borderRadius: 'var(--radius-full)',
  position: 'relative',
};

export const ScrollArea = forwardRef<HTMLDivElement, ScrollAreaProps>(function ScrollArea(
  {
    height = 240,
    width = '100%',
    direction = 'vertical',
    scrollbar = true,
    fadeBottom = false,
    style,
    className,
    children,
    ...rest
  },
  ref,
) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const [showFade, setShowFade] = useState(false);

  useEffect(() => {
    if (!fadeBottom) return;
    const el = viewportRef.current;
    if (!el) return;
    const check = () => {
      const max = el.scrollHeight - el.clientHeight;
      setShowFade(max > 8 && el.scrollTop < max - 8);
    };
    check();
    el.addEventListener('scroll', check);
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => {
      el.removeEventListener('scroll', check);
      ro.disconnect();
    };
  }, [fadeBottom]);

  const showVertical = direction === 'vertical' || direction === 'both';
  const showHorizontal = direction === 'horizontal' || direction === 'both';

  return (
    <RadixScrollArea.Root
      ref={ref}
      className={cn('ds-scrollarea', `ds-scrollarea--${direction}`, className)}
      style={{
        position: 'relative',
        width,
        height,
        overflow: 'hidden',
        ...style,
      }}
      {...(rest as ComponentPropsWithoutRef<typeof RadixScrollArea.Root>)}
    >
      <RadixScrollArea.Viewport
        ref={viewportRef}
        style={{ width: '100%', height: '100%', borderRadius: 'inherit' }}
      >
        {children}
        {fadeBottom && showFade ? (
          <div
            aria-hidden
            style={{
              position: 'sticky',
              left: 0,
              right: 0,
              bottom: 0,
              height: 'var(--size-spacing-8)',
              background:
                'linear-gradient(to bottom, var(--color-overlay-paper-soft), var(--color-surface-0))',
              pointerEvents: 'none',
              marginTop: 'calc(var(--size-spacing-8) * -1)',
            }}
          />
        ) : null}
      </RadixScrollArea.Viewport>

      {scrollbar && showVertical ? (
        <RadixScrollArea.Scrollbar orientation="vertical" style={{ ...scrollbarStyle, width: 8 }}>
          <RadixScrollArea.Thumb style={thumbStyle} />
        </RadixScrollArea.Scrollbar>
      ) : null}

      {scrollbar && showHorizontal ? (
        <RadixScrollArea.Scrollbar
          orientation="horizontal"
          style={{ ...scrollbarStyle, flexDirection: 'column', height: 8 }}
        >
          <RadixScrollArea.Thumb style={thumbStyle} />
        </RadixScrollArea.Scrollbar>
      ) : null}

      <RadixScrollArea.Corner />
    </RadixScrollArea.Root>
  );
});

/** 全局样式：精简滚动条外观（原生 fallback / Storybook）。 */
export const SCROLLAREA_GLOBAL_CSS = `
.ds-scrollarea {
  --radix-scroll-area-thumb-color: var(--color-border-default);
}
.ds-scrollarea [data-radix-scroll-area-thumb]:hover {
  background: var(--color-brand-mute);
}
`;
