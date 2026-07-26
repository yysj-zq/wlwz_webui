/**
 * Motion recipes —— 5 套编排预设（DS5），基于 `motion` / `motion/react`。
 *
 *  - curtainEntry   场景帘幕揭示
 *  - beatEntry      叙事节拍入场
 *  - dockOpen       交互 Dock
 *  - turnBreathing  HUD 候场呼吸
 *  - sceneCurtain   场景切换
 *
 * 主动画由 motion 驱动；motion.css 保留布局 / token 辅助 class（MOTION_CLASSES）。
 */
import { AnimatePresence, motion, useReducedMotion, type MotionStyle } from 'motion/react';
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import './motion.css';

export type RecipeClassName =
  | 'ds-curtain'
  | 'ds-curtain--enter'
  | 'ds-curtain--exit'
  | 'ds-curtain__panel'
  | 'ds-curtain__panel--left'
  | 'ds-curtain__panel--right'
  | 'ds-beat-in'
  | 'ds-beat-in--delay-1'
  | 'ds-beat-in--delay-2'
  | 'ds-beat-in--delay-3'
  | 'ds-beat-in--delay-4'
  | 'ds-dock-enter'
  | 'ds-dock-exit'
  | 'ds-breathe'
  | 'ds-breathe-lantern'
  | 'ds-scene-out'
  | 'ds-scene-in';

/** 读取 CSS 时长 token（秒）；SSR / 解析失败时用 fallbackMs。 */
function readCssSeconds(varName: string, fallbackMs: number): number {
  if (typeof window === 'undefined') return fallbackMs / 1000;
  const raw = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
  if (!raw) return fallbackMs / 1000;
  if (raw.endsWith('ms')) return parseFloat(raw) / 1000;
  if (raw.endsWith('s')) return parseFloat(raw);
  const n = parseFloat(raw);
  return Number.isFinite(n) ? n / 1000 : fallbackMs / 1000;
}

function useMotionDurations() {
  const reduced = useReducedMotion();
  const [durations, setDurations] = useState({
    fast: 0.12,
    normal: 0.2,
    slow: 0.32,
    gentle: 0.42,
    curtain: 0.6,
    scene: 0.9,
    beatDelay: 0.08,
  });

  useEffect(() => {
    if (reduced) {
      setDurations({
        fast: 0.01,
        normal: 0.01,
        slow: 0.01,
        gentle: 0.01,
        curtain: 0.01,
        scene: 0.01,
        beatDelay: 0,
      });
      return;
    }
    setDurations({
      fast: readCssSeconds('--motion-duration-fast', 120),
      normal: readCssSeconds('--motion-duration-normal', 200),
      slow: readCssSeconds('--motion-duration-slow', 320),
      gentle: readCssSeconds('--motion-duration-gentle', 420),
      curtain: readCssSeconds('--motion-duration-curtain', 600),
      scene: readCssSeconds('--motion-duration-scene', 900),
      beatDelay: readCssSeconds('--motion-delay-beat', 80),
    });
  }, [reduced]);

  return durations;
}

const EASE_ENTRANCE = [0.16, 1, 0.3, 1] as const;
const EASE_EXIT = [0.7, 0, 0.84, 0] as const;
const EASE_STANDARD = [0.2, 0, 0, 1] as const;

/* ============================================================
 * 1. curtainEntry
 * ============================================================ */
export type CurtainPhase = 'opening' | 'open' | 'closing';

export interface CurtainProps {
  /** 当前相位；外部用状态机切换 entering → open → exit。 */
  phase: CurtainPhase;
  /** 包裹的实际内容（场景）。 */
  children: ReactNode;
  /** 自定义 className。 */
  className?: string;
  /** 自定义 style。 */
  style?: CSSProperties;
}

/**
 * 戏台开帘：左右两扇漆红 Panel。
 *  - phase=opening：帘子自外侧向中间合拢（入场）
 *  - phase=open：合拢静止
 *  - phase=closing：帘子自中间向外展开（退场）
 */
export function Curtain({ phase, children, className, style }: CurtainProps) {
  const { curtain } = useMotionDurations();
  const phaseClass =
    phase === 'opening' ? 'ds-curtain--enter' : phase === 'closing' ? 'ds-curtain--exit' : '';

  // 与 motion.css 原 keyframes 一致：enter → x:0；exit → 向外收起
  const leftX = phase === 'closing' ? '-100%' : '0%';
  const rightX = phase === 'closing' ? '100%' : '0%';
  const leftFrom = phase === 'opening' ? '-100%' : phase === 'closing' ? '0%' : leftX;
  const rightFrom = phase === 'opening' ? '100%' : phase === 'closing' ? '0%' : rightX;

  return (
    <div
      className={['ds-curtain', phaseClass, className].filter(Boolean).join(' ')}
      style={style}
      data-phase={phase}
    >
      <motion.div
        className="ds-curtain__panel ds-curtain__panel--left"
        aria-hidden
        initial={{ x: leftFrom }}
        animate={{ x: leftX }}
        transition={{
          duration: curtain,
          ease: phase === 'closing' ? EASE_EXIT : EASE_ENTRANCE,
        }}
      />
      <motion.div
        className="ds-curtain__panel ds-curtain__panel--right"
        aria-hidden
        initial={{ x: rightFrom }}
        animate={{ x: rightX }}
        transition={{
          duration: curtain,
          ease: phase === 'closing' ? EASE_EXIT : EASE_ENTRANCE,
        }}
      />
      <div style={{ position: 'relative', zIndex: 1 }}>{children}</div>
    </div>
  );
}

/* ============================================================
 * 2. beatEntry
 * ============================================================ */
export interface BeatInProps {
  children: ReactNode;
  /** 错峰序号（0-4）；0=立即，1-4=递增 beat delay。 */
  index?: number;
  /** 渲染标签，默认 div。 */
  as?: 'div' | 'li' | 'section' | 'article' | 'p';
  className?: string;
  style?: CSSProperties;
}

const beatMotion = {
  div: motion.div,
  li: motion.li,
  section: motion.section,
  article: motion.article,
  p: motion.p,
} as const;

/** 叙事节拍入场：淡入 + 轻微上移 + 错峰延迟。 */
export function BeatIn({ children, index = 0, as = 'div', className, style }: BeatInProps) {
  const { slow, beatDelay } = useMotionDurations();
  const clamped = Math.min(4, Math.max(0, index));
  const delayClass = clamped > 0 ? `ds-beat-in--delay-${clamped}` : '';
  const MotionTag = beatMotion[as];

  return (
    <MotionTag
      className={['ds-beat-in', delayClass, className].filter(Boolean).join(' ')}
      {...(style ? { style: style as MotionStyle } : {})}
      initial={{ opacity: 0, y: 8, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{
        duration: slow,
        delay: clamped * beatDelay,
        ease: EASE_ENTRANCE,
      }}
    >
      {children}
    </MotionTag>
  );
}

/* ============================================================
 * 3. dockOpen
 * ============================================================ */
export interface DockProps {
  open: boolean;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}

/** Dock 展开/收起动画。 */
export function DockMotion({ open, children, className, style }: DockProps) {
  const { normal, fast } = useMotionDurations();
  return (
    <motion.div
      className={[open ? 'ds-dock-enter' : 'ds-dock-exit', className].filter(Boolean).join(' ')}
      {...(style ? { style: style as MotionStyle } : {})}
      aria-hidden={!open}
      initial={false}
      animate={open ? { opacity: 1, y: 0, scale: 1 } : { opacity: 0, y: 16, scale: 0.96 }}
      transition={{
        duration: open ? normal : fast,
        ease: open ? EASE_ENTRANCE : EASE_EXIT,
      }}
    >
      {children}
    </motion.div>
  );
}

/* ============================================================
 * 4. turnBreathing
 * ============================================================ */
export interface BreathingProps {
  active: boolean;
  /** 渲染标签，默认 div。 */
  as?: 'div' | 'span' | 'section';
  /** 是否用灯笼晕染（box-shadow）；否则用纯缩放。 */
  lantern?: boolean;
  children?: ReactNode;
  className?: string;
  style?: CSSProperties;
}

const breatheMotion = {
  div: motion.div,
  span: motion.span,
  section: motion.section,
} as const;

/**
 * HUD 候场呼吸：active=true 时循环脉动。
 * 使用 lantern=true 触发暖光晕（TurnHUD 候场专用）。
 */
export function Breathing({
  active,
  as = 'div',
  lantern = false,
  children,
  className,
  style,
}: BreathingProps) {
  const { gentle } = useMotionDurations();
  const MotionTag = breatheMotion[as];
  const animClass = active ? (lantern ? 'ds-breathe-lantern' : 'ds-breathe') : '';

  const animate = !active
    ? { opacity: 1, scale: 1 }
    : lantern
      ? { opacity: [0.7, 1, 0.7] }
      : { opacity: [0.6, 1, 0.6], scale: [1, 1.04, 1] };

  const mergedStyle = {
    ...style,
    ...(active && lantern ? { boxShadow: 'var(--shadow-glow-lantern)' } : {}),
  } as MotionStyle;

  return (
    <MotionTag
      className={[animClass, className].filter(Boolean).join(' ')}
      style={mergedStyle}
      aria-hidden={!active}
      animate={animate}
      transition={
        active ? { duration: gentle, repeat: Infinity, ease: EASE_STANDARD } : { duration: 0.01 }
      }
    >
      {children}
    </MotionTag>
  );
}

/**
 * 容器挂载时短暂启用呼吸（用于回合开始/结束过渡）。
 * 返回 active prop，组件挂载 N ms 后自动 false。
 */
export function useBreatheMount(durationMs: number = 1200): boolean {
  const [active, setActive] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setActive(false), durationMs);
    return () => clearTimeout(t);
  }, [durationMs]);
  return active;
}

/* ============================================================
 * 5. sceneCurtain
 * ============================================================ */
export interface SceneCurtainProps {
  /** 当前展示的 sceneKey。变化时旧景退出、新景进入。 */
  sceneKey: string;
  /** sceneKey → 内容的映射。 */
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}

/**
 * 场景切换动画：
 *  - 旧 children 被替换时外推退出
 *  - 新 children 从右侧揭幕进入
 */
export function SceneCurtain({ sceneKey, children, className, style }: SceneCurtainProps) {
  const { scene } = useMotionDurations();

  return (
    <div className={className} style={{ position: 'relative', ...style }}>
      <AnimatePresence mode="wait">
        <motion.div
          key={sceneKey}
          className="ds-scene-in"
          initial={{ opacity: 0, x: '12%', scale: 0.98 }}
          animate={{ opacity: 1, x: '0%', scale: 1 }}
          exit={{ opacity: 0, x: '-12%', scale: 0.98 }}
          transition={{
            duration: scene,
            ease: EASE_ENTRANCE,
          }}
        >
          {children}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

/* ============================================================
 * 默认导出：所有 recipe 的 className 表（用于 Storybook / 文档）
 * ============================================================ */
export const MOTION_CLASSES = {
  curtain: {
    root: 'ds-curtain',
    enter: 'ds-curtain--enter',
    exit: 'ds-curtain--exit',
    panel: 'ds-curtain__panel',
    panelLeft: 'ds-curtain__panel--left',
    panelRight: 'ds-curtain__panel--right',
  },
  beat: {
    base: 'ds-beat-in',
    delay: (i: number) => `ds-beat-in--delay-${Math.min(4, Math.max(0, i))}` as RecipeClassName,
  },
  dock: {
    enter: 'ds-dock-enter',
    exit: 'ds-dock-exit',
  },
  breathing: {
    base: 'ds-breathe',
    lantern: 'ds-breathe-lantern',
  },
  scene: {
    out: 'ds-scene-out',
    in: 'ds-scene-in',
  },
} as const;
