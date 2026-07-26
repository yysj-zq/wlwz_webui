/**
 * Tabs —— 基于 @radix-ui/react-tabs 的标签页（DS3）。
 *
 *  - Root / List / Trigger / Content
 *  - 键盘导航由 Radix 提供
 */
import * as RadixTabs from '@radix-ui/react-tabs';
import {
  createContext,
  forwardRef,
  useContext,
  useState,
  type ButtonHTMLAttributes,
  type ComponentPropsWithoutRef,
  type HTMLAttributes,
  type ReactNode,
} from 'react';
import { cn, dataOrientation } from './utils';

export type TabsOrientation = 'horizontal' | 'vertical';

interface TabsContextValue {
  value: string;
  orientation: TabsOrientation;
}

const TabsContext = createContext<TabsContextValue>({
  value: '',
  orientation: 'horizontal',
});

/* ============================================================
 * Root
 * ============================================================ */
export interface TabsRootProps {
  children: ReactNode;
  value?: string;
  defaultValue?: string;
  onValueChange?: (v: string) => void;
  orientation?: TabsOrientation;
  /** id 可选；缺省由 Radix 生成。 */
  id?: string;
}

export function TabsRoot({
  children,
  value,
  defaultValue,
  onValueChange,
  orientation = 'horizontal',
  id,
}: TabsRootProps) {
  const [internal, setInternal] = useState(defaultValue ?? '');
  const isControlled = value !== undefined;
  const current = isControlled ? value : internal;

  return (
    <TabsContext.Provider value={{ value: current, orientation }}>
      <RadixTabs.Root
        {...(id !== undefined ? { id } : {})}
        {...(value !== undefined ? { value } : {})}
        {...(defaultValue !== undefined ? { defaultValue } : {})}
        onValueChange={(next) => {
          if (!isControlled) setInternal(next);
          onValueChange?.(next);
        }}
        orientation={orientation}
      >
        {children}
      </RadixTabs.Root>
    </TabsContext.Provider>
  );
}

/* ============================================================
 * List
 * ============================================================ */
export type TabsListProps = HTMLAttributes<HTMLDivElement>;

export const TabsList = forwardRef<HTMLDivElement, TabsListProps>(function TabsList(
  { children, style, className, ...rest },
  ref,
) {
  const { orientation } = useContext(TabsContext);
  const isVertical = orientation === 'vertical';
  return (
    <RadixTabs.List
      ref={ref}
      className={cn('ds-tabs__list', className)}
      style={{
        display: 'flex',
        flexDirection: isVertical ? 'column' : 'row',
        gap: 'var(--size-spacing-1)',
        borderBottom: isVertical ? undefined : '1px solid var(--color-border-subtle)',
        borderRight: isVertical ? '1px solid var(--color-border-subtle)' : undefined,
        ...style,
      }}
      {...dataOrientation(orientation)}
      {...rest}
    >
      {children}
    </RadixTabs.List>
  );
});

/* ============================================================
 * Trigger
 * ============================================================ */
export interface TabsTriggerProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  value: string;
  disabled?: boolean;
}

export const TabsTrigger = forwardRef<HTMLButtonElement, TabsTriggerProps>(function TabsTrigger(
  { value, disabled, children, style, className, ...rest },
  ref,
) {
  const { value: current, orientation } = useContext(TabsContext);
  const active = current === value;
  return (
    <RadixTabs.Trigger
      ref={ref}
      value={value}
      {...(disabled !== undefined ? { disabled } : {})}
      className={cn('ds-tabs__trigger', active && 'ds-tabs__trigger--active', className)}
      style={{
        padding: 'var(--size-spacing-2) var(--size-spacing-3)',
        background: 'transparent',
        color: active ? 'var(--color-brand-lacquer)' : 'var(--color-text-secondary)',
        border: 'none',
        borderBottom:
          orientation === 'horizontal'
            ? `2px solid ${active ? 'var(--color-brand-lacquer)' : 'transparent'}`
            : undefined,
        borderLeft:
          orientation === 'vertical'
            ? `2px solid ${active ? 'var(--color-brand-lacquer)' : 'transparent'}`
            : undefined,
        borderRadius: 'var(--radius-sm)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        fontFamily: 'var(--font-ui)',
        fontSize: 'var(--text-size-base)',
        fontWeight: 'var(--text-weight-medium)',
        opacity: disabled ? 0.55 : 1,
        transition:
          'color var(--motion-duration-fast) var(--motion-easing-standard), border-color var(--motion-duration-fast) var(--motion-easing-standard)',
        ...style,
      }}
      {...rest}
    >
      {children}
    </RadixTabs.Trigger>
  );
});

/* ============================================================
 * Content
 * ============================================================ */
export interface TabsContentProps extends HTMLAttributes<HTMLDivElement> {
  value: string;
  /** 即使非激活也保留 DOM（用于做切换动画）。 */
  forceMount?: boolean;
}

export const TabsContent = forwardRef<HTMLDivElement, TabsContentProps>(function TabsContent(
  { value, forceMount, style, className, children, ...rest },
  ref,
) {
  const { value: current } = useContext(TabsContext);
  const active = current === value;
  return (
    <RadixTabs.Content
      ref={ref}
      {...(rest as Omit<
        ComponentPropsWithoutRef<typeof RadixTabs.Content>,
        'value' | 'forceMount' | 'className' | 'style' | 'children'
      >)}
      value={value}
      {...(forceMount ? { forceMount: true as const } : {})}
      className={cn('ds-tabs__content', active && 'ds-tabs__content--active', className)}
      style={{
        padding: 'var(--size-spacing-4) 0',
        fontFamily: 'var(--font-ui)',
        color: 'var(--color-text-primary)',
        ...style,
      }}
    >
      {children}
    </RadixTabs.Content>
  );
});

/* ============================================================
 * 命名空间
 * ============================================================ */
export const Tabs = {
  Root: TabsRoot,
  List: TabsList,
  Trigger: TabsTrigger,
  Content: TabsContent,
};
