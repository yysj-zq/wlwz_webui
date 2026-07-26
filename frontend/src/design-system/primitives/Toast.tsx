/**
 * Toast —— Radix 风格吐司提示（DS3）。
 *
 *  - Provider: 注入 toast store；提供 useToast() hook
 *  - Viewport: 容器，渲染所有 toast（建议放在 App 根）
 *  - 4 种 tone：info / success / warning / danger
 *  - 自动消失（可配置 duration；duration=Infinity 表示不自动消失）
 *  - 关闭按钮 + 键盘 Esc 关闭最新一条
 *  - ARIA: role=status / role=alert；aria-live=polite / assertive
 */
import {
  createContext,
  forwardRef,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type HTMLAttributes,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { cn, usePortal } from './utils';

export type ToastTone = 'info' | 'success' | 'warning' | 'danger';

export interface ToastOptions {
  /** 必填：吐司文案。 */
  title: string;
  /** 副标题 / 描述。 */
  description?: ReactNode;
  tone?: ToastTone;
  /** ms；Infinity 不自动关闭。 */
  duration?: number;
  /** 自定义 id；缺省自动生成。 */
  id?: string;
}

interface ToastEntry extends Required<Omit<ToastOptions, 'description' | 'id'>> {
  id: string;
  description?: ReactNode;
  createdAt: number;
  open: boolean;
}

interface ToastContextValue {
  toasts: ToastEntry[];
  toast: (opts: ToastOptions) => string;
  dismiss: (id: string) => void;
  clear: () => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within <ToastProvider>');
  return ctx;
}

let idCounter = 0;
function nextId(): string {
  idCounter += 1;
  return `toast-${Date.now()}-${idCounter}`;
}

/* ============================================================
 * Provider
 * ============================================================ */
export interface ToastProviderProps {
  children: ReactNode;
  /** 全局默认 duration（ms）；可被 options 覆盖。 */
  duration?: number;
  /** 一次最多展示几个；超出排队。 */
  limit?: number;
}

export function ToastProvider({ children, duration = 4000, limit = 5 }: ToastProviderProps) {
  const [toasts, setToasts] = useState<ToastEntry[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback(
    (opts: ToastOptions): string => {
      const id = opts.id ?? nextId();
      const entry: ToastEntry = {
        id,
        title: opts.title,
        description: opts.description,
        tone: opts.tone ?? 'info',
        duration: opts.duration ?? duration,
        createdAt: Date.now(),
        open: true,
      };
      setToasts((prev) => {
        const next = [...prev.filter((t) => t.id !== id), entry];
        return next.slice(-limit);
      });
      return id;
    },
    [duration, limit],
  );

  const clear = useCallback(() => setToasts([]), []);

  const value = useMemo<ToastContextValue>(
    () => ({ toasts, toast, dismiss, clear }),
    [toasts, toast, dismiss, clear],
  );

  return <ToastContext.Provider value={value}>{children}</ToastContext.Provider>;
}

/* ============================================================
 * Viewport —— 渲染容器
 * ============================================================ */
export interface ToastViewportProps extends HTMLAttributes<HTMLDivElement> {
  position?:
    'top-right' | 'top-left' | 'top-center' | 'bottom-right' | 'bottom-left' | 'bottom-center';
}

const POSITION_STYLES: Record<
  NonNullable<ToastViewportProps['position']>,
  HTMLAttributes<HTMLDivElement>['style']
> = {
  'top-right': { top: 'var(--size-spacing-4)', right: 'var(--size-spacing-4)' },
  'top-left': { top: 'var(--size-spacing-4)', left: 'var(--size-spacing-4)' },
  'top-center': { top: 'var(--size-spacing-4)', left: '50%', transform: 'translateX(-50%)' },
  'bottom-right': { bottom: 'var(--size-spacing-4)', right: 'var(--size-spacing-4)' },
  'bottom-left': { bottom: 'var(--size-spacing-4)', left: 'var(--size-spacing-4)' },
  'bottom-center': { bottom: 'var(--size-spacing-4)', left: '50%', transform: 'translateX(-50%)' },
};

export const ToastViewport = forwardRef<HTMLDivElement, ToastViewportProps>(function ToastViewport(
  { position = 'top-right', style, className, ...rest },
  ref,
) {
  const ctx = useToast();
  const portal = usePortal();

  // 全局 Esc 关闭最新一条
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape') return;
      const latest = ctx.toasts[ctx.toasts.length - 1];
      if (latest) ctx.dismiss(latest.id);
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [ctx]);

  if (!portal) return null;
  return createPortal(
    <div
      ref={ref}
      className={cn('ds-toast__viewport', className)}
      style={{
        position: 'fixed',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--size-spacing-2)',
        zIndex: 2000,
        maxWidth: '420px',
        ...POSITION_STYLES[position],
        ...style,
      }}
      {...rest}
    >
      {ctx.toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onDismiss={ctx.dismiss} />
      ))}
    </div>,
    portal,
  );
});

/* ============================================================
 * ToastItem
 * ============================================================ */
interface ToastItemProps {
  toast: ToastEntry;
  onDismiss: (id: string) => void;
}

const TONE_STYLES: Record<
  ToastTone,
  { border: string; accent: string; ariaRole: 'status' | 'alert'; ariaLive: 'polite' | 'assertive' }
> = {
  info: {
    border: 'var(--color-feedback-info)',
    accent: 'var(--color-feedback-info)',
    ariaRole: 'status',
    ariaLive: 'polite',
  },
  success: {
    border: 'var(--color-feedback-success)',
    accent: 'var(--color-feedback-success)',
    ariaRole: 'status',
    ariaLive: 'polite',
  },
  warning: {
    border: 'var(--color-feedback-warning)',
    accent: 'var(--color-feedback-warning)',
    ariaRole: 'status',
    ariaLive: 'polite',
  },
  danger: {
    border: 'var(--color-feedback-danger)',
    accent: 'var(--color-feedback-danger)',
    ariaRole: 'alert',
    ariaLive: 'assertive',
  },
};

function ToastItem({ toast, onDismiss }: ToastItemProps) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (toast.duration === Infinity || toast.duration <= 0) return;
    timer.current = setTimeout(() => onDismiss(toast.id), toast.duration);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [toast.id, toast.duration, onDismiss]);

  const tone = TONE_STYLES[toast.tone];
  return (
    <div
      role={tone.ariaRole}
      aria-live={tone.ariaLive}
      data-tone={toast.tone}
      className="ds-toast__item"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--size-spacing-1)',
        background: 'var(--color-surface-0)',
        color: 'var(--color-text-primary)',
        border: '1px solid var(--color-border-subtle)',
        borderLeft: `4px solid ${tone.border}`,
        borderRadius: 'var(--radius-md)',
        boxShadow: 'var(--shadow-md)',
        padding: 'var(--size-spacing-3) var(--size-spacing-4)',
        fontFamily: 'var(--font-ui)',
        fontSize: 'var(--text-size-sm)',
        minWidth: '260px',
        animation: 'ds-dock-open var(--motion-duration-normal) var(--motion-easing-entrance)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--size-spacing-2)' }}>
        <strong
          style={{
            flex: 1,
            fontWeight: 'var(--text-weight-semibold)',
            color: tone.accent,
          }}
        >
          {toast.title}
        </strong>
        <button
          type="button"
          aria-label="关闭"
          onClick={() => onDismiss(toast.id)}
          style={{
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--color-text-muted)',
            fontSize: 'var(--text-size-lg)',
            lineHeight: 1,
            padding: 0,
          }}
        >
          ×
        </button>
      </div>
      {toast.description ? (
        <div style={{ color: 'var(--color-text-secondary)' }}>{toast.description}</div>
      ) : null}
    </div>
  );
}

/* ============================================================
 * 命名空间
 * ============================================================ */
export const Toast = {
  Provider: ToastProvider,
  Viewport: ToastViewport,
};
