/**
 * 圆形角色轮盘选择器 —— 对齐 `_legacy` RoleSelector（无 MUI）。
 * 点击触发条 → fixed 浮层；flip + preventOverflow，避免裁出视口。
 */
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from 'react';
import { createPortal, useDismissable } from '@ds/primitives';
import { resolveMediaUrl } from './resolveMediaUrl';

export type RoleWheelOption = {
  readonly slug: string;
  readonly name: string;
  readonly avatarUrl: string | null;
  readonly description: string;
};

/** 与旧 RolePillOption 同形，便于迁移。 */
export type RolePillOption = RoleWheelOption;

export interface CircleRoleSelectorProps {
  readonly label: string;
  readonly value: string;
  readonly options: readonly RoleWheelOption[];
  readonly onChange: (slug: string) => void;
  readonly disabled?: boolean;
  readonly testId?: string;
  /** 首选弹出方向：bottom 触发条在底栏（轮盘向上）；top 则向下。 */
  readonly preferredPlacement?: 'above' | 'below';
}

const WHEEL_SIZE = 300;
const WHEEL_RADIUS = 120;
const AVATAR_HALF = 25;
const VIEWPORT_PAD = 12;

const triggerStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 'var(--size-spacing-2)',
  padding:
    'var(--size-spacing-1) var(--size-spacing-3) var(--size-spacing-1) var(--size-spacing-1)',
  borderRadius: 'var(--radius-full)',
  border: '1px solid var(--color-border-subtle)',
  background: 'var(--color-surface-1)',
  color: 'var(--color-text-primary)',
  fontFamily: 'var(--font-ui)',
  maxWidth: '100%',
  minHeight: 'var(--size-spacing-10)',
  textAlign: 'left',
  cursor: 'pointer',
};

const nameStyle: CSSProperties = {
  fontWeight: 600,
  fontSize: 'var(--text-size-sm)',
  lineHeight: 1.2,
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  maxWidth: 96,
};

const descStyle: CSSProperties = {
  color: 'var(--color-text-muted)',
  fontSize: 'var(--text-size-xs)',
  lineHeight: 1,
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  maxWidth: 96,
};

function placeWheel(anchor: DOMRect, preferred: 'above' | 'below'): { top: number; left: number } {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  let top =
    preferred === 'above' ? anchor.top - WHEEL_SIZE - VIEWPORT_PAD : anchor.bottom + VIEWPORT_PAD;
  let left = anchor.left;

  if (top + WHEEL_SIZE > vh - VIEWPORT_PAD) {
    top = anchor.top - WHEEL_SIZE - VIEWPORT_PAD;
  }
  if (top < VIEWPORT_PAD) {
    top = Math.min(anchor.bottom + VIEWPORT_PAD, vh - WHEEL_SIZE - VIEWPORT_PAD);
  }
  if (top < VIEWPORT_PAD) top = VIEWPORT_PAD;

  if (left + WHEEL_SIZE > vw - VIEWPORT_PAD) {
    left = vw - WHEEL_SIZE - VIEWPORT_PAD;
  }
  if (left < VIEWPORT_PAD) left = VIEWPORT_PAD;

  return { top, left };
}

function RoleAvatar({
  name,
  avatarUrl,
  size,
  emphasized,
}: {
  readonly name: string;
  readonly avatarUrl: string | null;
  readonly size: number;
  readonly emphasized?: boolean;
}) {
  const [broken, setBroken] = useState(false);
  const resolved = resolveMediaUrl(avatarUrl);
  const showImg = Boolean(resolved) && !broken;
  const ring = emphasized
    ? '2px solid var(--color-brand-lantern, var(--color-brand-primary))'
    : '2px solid var(--color-border-subtle)';

  return (
    <span
      style={{
        position: 'relative',
        width: size,
        height: size,
        borderRadius: 'var(--radius-full)',
        flexShrink: 0,
        overflow: 'hidden',
        border: ring,
        background: 'var(--color-brand-primary, var(--color-lacquer))',
        display: 'inline-grid',
        placeItems: 'center',
        boxShadow: emphasized ? 'var(--shadow-md)' : 'var(--shadow-sm)',
        transform: emphasized ? 'scale(1.06)' : undefined,
        transition: 'transform var(--motion-duration-fast) var(--motion-easing-standard)',
      }}
      aria-hidden
    >
      {showImg ? (
        <img
          src={resolved!}
          alt=""
          width={size}
          height={size}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          onError={() => setBroken(true)}
        />
      ) : (
        <span
          style={{
            fontSize: size * 0.4,
            fontWeight: 700,
            color: 'var(--color-text-inverse)',
            lineHeight: 1,
          }}
        >
          {name.charAt(0) || '?'}
        </span>
      )}
    </span>
  );
}

function getOuterPosition(index: number, total: number): { left: number; top: number } {
  const center = WHEEL_SIZE / 2;
  const angle = ((2 * Math.PI) / total) * index - Math.PI / 2;
  return {
    left: center + WHEEL_RADIUS * Math.cos(angle) - AVATAR_HALF,
    top: center + WHEEL_RADIUS * Math.sin(angle) - AVATAR_HALF,
  };
}

function CircleWheel({
  selectedSlug,
  options,
  onSelect,
}: {
  readonly selectedSlug: string;
  readonly options: readonly RoleWheelOption[];
  readonly onSelect: (slug: string) => void;
}) {
  const [hoveredSlug, setHoveredSlug] = useState<string | null>(null);
  const selected = options.find((o) => o.slug === selectedSlug) ??
    options[0] ?? {
      slug: selectedSlug,
      name: selectedSlug || '角色',
      avatarUrl: null,
      description: '',
    };
  const center = (hoveredSlug ? options.find((o) => o.slug === hoveredSlug) : null) ?? selected;
  const others = options.filter((o) => o.slug !== selectedSlug);
  const totalSlots = Math.max(options.length, 1);

  return (
    <div
      role="menu"
      aria-label="选择角色"
      data-testid="circle-role-wheel"
      style={{
        position: 'relative',
        width: WHEEL_SIZE,
        height: WHEEL_SIZE,
        borderRadius: 'var(--radius-full)',
        background:
          'radial-gradient(circle at 50% 42%, color-mix(in srgb, var(--color-surface-1) 92%, transparent), color-mix(in srgb, var(--color-brand-ink) 88%, transparent))',
        border: '1px solid var(--color-border-subtle)',
        boxShadow: 'var(--shadow-lg)',
        animation:
          'circle-role-fade-in var(--motion-duration-normal, 280ms) var(--motion-easing-standard)',
      }}
    >
      <div
        style={{
          position: 'absolute',
          left: '50%',
          top: '50%',
          transform: 'translate(-50%, -58%)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 'var(--size-spacing-2)',
          width: 140,
          textAlign: 'center',
          pointerEvents: 'none',
        }}
      >
        <RoleAvatar
          name={center.name}
          avatarUrl={center.avatarUrl}
          size={64}
          emphasized={hoveredSlug !== null}
        />
        <span
          style={{
            fontWeight: 700,
            fontSize: 'var(--text-size-sm)',
            color: 'var(--color-text-primary)',
            maxWidth: '100%',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {center.name}
        </span>
        {center.description ? (
          <span
            style={{
              fontSize: 'var(--text-size-xs)',
              color: 'var(--color-text-muted)',
              lineHeight: 1.3,
              maxHeight: '2.6em',
              overflow: 'hidden',
            }}
          >
            {center.description}
          </span>
        ) : null}
      </div>

      {others.map((role, index) => {
        const pos = getOuterPosition(index, totalSlots);
        const isHovered = hoveredSlug === role.slug;
        return (
          <button
            key={role.slug}
            type="button"
            role="menuitem"
            aria-label={`切换到角色${role.name}`}
            data-testid={`circle-role-option-${role.slug}`}
            onMouseEnter={() => setHoveredSlug(role.slug)}
            onMouseLeave={() => setHoveredSlug(null)}
            onFocus={() => setHoveredSlug(role.slug)}
            onBlur={() => setHoveredSlug(null)}
            onClick={() => onSelect(role.slug)}
            style={{
              position: 'absolute',
              left: pos.left,
              top: pos.top,
              width: 50,
              margin: 0,
              padding: 0,
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 4,
              zIndex: isHovered ? 2 : 1,
            }}
          >
            <RoleAvatar
              name={role.name}
              avatarUrl={role.avatarUrl}
              size={50}
              emphasized={isHovered}
            />
            <span
              style={{
                fontSize: 10,
                color: 'var(--color-text-secondary)',
                maxWidth: 56,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {role.name}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function CircleRoleSelector({
  label,
  value,
  options,
  onChange,
  disabled = false,
  testId,
  preferredPlacement = 'above',
}: CircleRoleSelectorProps) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const anchorRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  const selected = options.find((o) => o.slug === value) ?? options[0];
  const displayName = selected?.name ?? value;
  const canOpen = !disabled && options.length > 0;

  const close = useCallback(() => setOpen(false), []);

  const updatePlacement = useCallback(() => {
    const el = anchorRef.current;
    if (!el) return;
    setCoords(placeWheel(el.getBoundingClientRect(), preferredPlacement));
  }, [preferredPlacement]);

  useLayoutEffect(() => {
    if (!open) return;
    updatePlacement();
  }, [open, updatePlacement, options.length]);

  useEffect(() => {
    if (!open) return;
    const onResize = () => updatePlacement();
    window.addEventListener('resize', onResize);
    window.addEventListener('scroll', onResize, true);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('scroll', onResize, true);
    };
  }, [open, updatePlacement]);

  useDismissable({
    containerRef: panelRef,
    triggerRef: anchorRef,
    active: open,
    escape: true,
    outside: true,
    onDismiss: close,
  });

  const handleTriggerKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (canOpen) setOpen((v) => !v);
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (canOpen) setOpen(true);
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
    }
  };

  const handleSelect = (slug: string) => {
    onChange(slug);
    close();
  };

  return (
    <div style={{ display: 'grid', gap: 'var(--size-spacing-1)', minWidth: 0 }}>
      <span
        style={{
          fontSize: 'var(--text-size-xs)',
          color: 'var(--color-text-secondary)',
          letterSpacing: '0.04em',
        }}
      >
        {label}
      </span>
      <button
        ref={anchorRef}
        type="button"
        style={{
          ...triggerStyle,
          opacity: canOpen ? 1 : 0.55,
          cursor: canOpen ? 'pointer' : 'not-allowed',
        }}
        disabled={!canOpen}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`${label}：${displayName}，点击切换角色`}
        data-testid={testId}
        onClick={() => {
          if (!canOpen) return;
          setOpen((v) => !v);
        }}
        onKeyDown={handleTriggerKeyDown}
      >
        {options.length === 0 ? (
          <>
            <RoleAvatar name="?" avatarUrl={null} size={36} />
            <span style={nameStyle}>加载角色中…</span>
          </>
        ) : (
          <>
            <RoleAvatar
              name={displayName}
              avatarUrl={selected?.avatarUrl ?? null}
              size={36}
              emphasized={open}
            />
            <span style={{ minWidth: 0, display: 'grid', gap: 2 }}>
              <span style={nameStyle}>{displayName}</span>
              {selected?.description ? <span style={descStyle}>{selected.description}</span> : null}
            </span>
          </>
        )}
      </button>

      {open && coords && typeof document !== 'undefined'
        ? createPortal(
            <div
              ref={panelRef}
              style={{
                position: 'fixed',
                top: coords.top,
                left: coords.left,
                zIndex: 1800,
              }}
              data-testid={testId ? `${testId}-wheel` : 'circle-role-popper'}
            >
              <CircleWheel selectedSlug={value} options={options} onSelect={handleSelect} />
            </div>,
            document.body,
          )
        : null}

      <style>{`
        @keyframes circle-role-fade-in {
          from { opacity: 0; transform: scale(0.92); }
          to { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  );
}

export default CircleRoleSelector;
