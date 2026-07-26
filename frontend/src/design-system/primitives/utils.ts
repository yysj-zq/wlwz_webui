/**
 * Primitive 工具集 —— 基础设施（DS3）。
 *
 * 交互原语已迁至 @radix-ui/*；本文件保留通用 helpers，兼容既有 import。
 */
import {
  cloneElement,
  createElement,
  forwardRef,
  useCallback,
  useEffect,
  useId as useReactId,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ForwardedRef,
  type HTMLAttributes,
  type ReactElement,
  type Ref,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';

/* ============================================================
 * cn —— className 拼接
 * ============================================================ */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

/* ============================================================
 * VisuallyHidden —— 仅 SR 可见
 * ============================================================ */
const visuallyHiddenStyle: CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: 'hidden',
  clip: 'rect(0, 0, 0, 0)',
  whiteSpace: 'nowrap',
  border: 0,
};

export const VisuallyHidden = forwardRef<HTMLSpanElement, HTMLAttributes<HTMLSpanElement>>(
  function VisuallyHidden({ style, ...rest }, ref) {
    return createElement('span', { ref, style: { ...visuallyHiddenStyle, ...style }, ...rest });
  },
);

/* ============================================================
 * useId —— 稳定的 SSR-friendly id
 * ============================================================ */
export function useId(prefix?: string): string {
  const id = useReactId();
  return prefix ? `${prefix}-${id}` : id;
}

/* ============================================================
 * usePortal —— 挂到 document.body 的子节点
 * ============================================================ */
export function usePortal(container?: HTMLElement | null): HTMLElement | null {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return useMemo(() => {
    if (!mounted) return null;
    if (container) return container;
    if (typeof document === 'undefined') return null;
    return document.body;
  }, [container, mounted]);
}

/* ============================================================
 * useFocusTrap —— 保留导出；优先使用 Radix Dialog / Menu 的焦点管理
 * ============================================================ */
export interface FocusTrapOptions {
  containerRef: RefObject<HTMLElement | null>;
  active: boolean;
  autoFocus?: boolean;
  restoreFocus?: boolean;
}

export function useFocusTrap({
  containerRef,
  active,
  autoFocus = true,
  restoreFocus = true,
}: FocusTrapOptions): void {
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!active) return;
    previouslyFocused.current =
      (typeof document !== 'undefined' ? (document.activeElement as HTMLElement | null) : null) ??
      null;
    const container = containerRef.current;
    if (container && autoFocus) {
      const focusable = container.querySelector<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      (focusable ?? container).focus();
    }
    return () => {
      if (restoreFocus && previouslyFocused.current) {
        previouslyFocused.current.focus();
      }
    };
  }, [active, autoFocus, restoreFocus, containerRef]);
}

/* ============================================================
 * useDismissable —— Esc + 外点关闭（兼容导出）
 * ============================================================ */
export interface DismissableOptions {
  containerRef: RefObject<HTMLElement | null>;
  triggerRef?: RefObject<HTMLElement | null>;
  active: boolean;
  escape?: boolean;
  outside?: boolean;
  onDismiss: () => void;
}

export function useDismissable({
  containerRef,
  triggerRef,
  active,
  escape = true,
  outside = true,
  onDismiss,
}: DismissableOptions): void {
  const onDismissRef = useRef(onDismiss);
  useEffect(() => {
    onDismissRef.current = onDismiss;
  }, [onDismiss]);

  useEffect(() => {
    if (!active || !escape) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onDismissRef.current();
      }
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [active, escape]);

  useEffect(() => {
    if (!active || !outside) return;
    function handlePointer(e: PointerEvent) {
      const target = e.target as Node | null;
      if (!target) return;
      const container = containerRef.current;
      const trigger = triggerRef?.current;
      if (container && container.contains(target)) return;
      if (trigger && trigger.contains(target)) return;
      onDismissRef.current();
    }
    document.addEventListener('pointerdown', handlePointer);
    return () => document.removeEventListener('pointerdown', handlePointer);
  }, [active, outside, containerRef, triggerRef]);
}

/* ============================================================
 * mergeRefs —— 合并多个 ref
 * ============================================================ */
export function mergeRefs<T>(...refs: Array<Ref<T> | undefined>): (node: T | null) => void {
  return (node: T | null) => {
    refs.forEach((ref) => {
      if (!ref) return;
      if (typeof ref === 'function') {
        ref(node);
      } else {
        (ref as { current: T | null }).current = node;
      }
    });
  };
}

/* ============================================================
 * Slot —— 透传 props + className/style 合并
 * ============================================================ */
export interface SlotProps extends HTMLAttributes<HTMLElement> {
  children?: React.ReactNode;
}

export function Slot({ children, ...props }: SlotProps) {
  if (!children || typeof children !== 'object') return null;
  const child = children as ReactElement<Record<string, unknown>>;
  const childProps = child.props ?? {};
  const merged: Record<string, unknown> = { ...props, ...childProps };
  if (props.className || childProps.className) {
    merged.className = cn(props.className, childProps.className as string | undefined);
  }
  if (props.style || childProps.style) {
    merged.style = { ...(props.style as CSSProperties), ...(childProps.style as CSSProperties) };
  }
  return cloneElement(child, merged);
}

/* ============================================================
 * useControllableState —— 受控/非受控混合
 * ============================================================ */
export interface UseControllableStateOptions<T> {
  value?: T;
  defaultValue: T;
  onChange?: (next: T) => void;
}

export function useControllableState<T>({
  value,
  defaultValue,
  onChange,
}: UseControllableStateOptions<T>): [T, (next: T) => void] {
  const isControlled = value !== undefined;
  const [internal, setInternal] = useState<T>(defaultValue);
  const current = isControlled ? (value as T) : internal;
  const setValue = useCallback(
    (next: T) => {
      if (!isControlled) setInternal(next);
      onChange?.(next);
    },
    [isControlled, onChange],
  );
  return [current, setValue];
}

export type { ForwardedRef };
export { forwardRef, useImperativeHandle };
export { createPortal };

export const dataAttr = (value: boolean | string | undefined | null): Record<string, string> => {
  if (value === undefined || value === null || value === false) return {};
  return { 'data-state': String(value) };
};

export const dataDisabled = (value: boolean | undefined): Record<string, string> =>
  value ? { 'data-disabled': '' } : {};

export const dataOrientation = (
  value: 'horizontal' | 'vertical' | undefined,
): Record<string, string> => (value ? { 'data-orientation': value } : {});
