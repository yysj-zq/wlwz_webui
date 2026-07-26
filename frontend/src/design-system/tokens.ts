/**
 * Design System tokens —— 单一真相源（Style Dictionary 生成）。
 *
 *  - 颜色 / 字号 / 间距 / 动效 / 圆角 / 阴影全部走 CSS 变量，
 *    运行时通过 `var(--color-...)` 引用，避免魔法色值。
 *  - 这里只导出 token 名称常量与类型，方便 TS 代码强类型取值
 *    （例如 `StyleSheet.create({ c: { color: cssVar.color.text.primary } })`）。
 *
 * 业务代码应使用 `tokens.color.brand.lacquer` 等常量传给 CSS-in-JS；
 * 禁止直接写字面量颜色 / 字号 / 时长。
 */

// ---------- 类型 ----------
export type ColorBrandKey = keyof typeof tokens.color.brand;
export type ColorTextKey = keyof typeof tokens.color.text;
export type ColorSurfaceKey = keyof typeof tokens.color.surface;
export type ColorBorderKey = keyof typeof tokens.color.border;
export type ColorRoleKey = keyof typeof tokens.color.role;
export type ColorFeedbackKey = keyof typeof tokens.color.feedback;
export type ColorOverlayKey = keyof typeof tokens.color.overlay;
export type ColorKey =
  | `brand.${ColorBrandKey}`
  | `text.${ColorTextKey}`
  | `surface.${ColorSurfaceKey}`
  | `border.${ColorBorderKey}`
  | `role.${ColorRoleKey}`
  | `feedback.${ColorFeedbackKey}`
  | `overlay.${ColorOverlayKey}`;

export type SpacingKey = keyof typeof tokens.size.spacing;
export type RadiusKey = keyof typeof tokens.radius;
export type ShadowKey = keyof typeof tokens.shadow;
export type MotionDurationKey = keyof typeof tokens.motion.duration;
export type MotionEasingKey = keyof typeof tokens.motion.easing;
export type MotionDelayKey = keyof typeof tokens.motion.delay;

export type FontFamilyKey = keyof typeof tokens.font;
export type TextSizeKey = keyof typeof tokens.text.size;
export type TextWeightKey = keyof typeof tokens.text.weight;
export type LineHeightKey = keyof typeof tokens.text.lineHeight;

// ---------- 常量（与 tokens.json 一一对应） ----------
export const tokens = {
  color: {
    brand: {
      ink: 'color-brand-ink',
      lacquer: 'color-brand-lacquer',
      lantern: 'color-brand-lantern',
      paper: 'color-brand-paper',
      mute: 'color-brand-mute',
    },
    surface: {
      0: 'color-surface-0',
      1: 'color-surface-1',
      2: 'color-surface-2',
      3: 'color-surface-3',
    },
    text: {
      primary: 'color-text-primary',
      secondary: 'color-text-secondary',
      muted: 'color-text-muted',
      inverse: 'color-text-inverse',
    },
    border: {
      default: 'color-border-default',
      subtle: 'color-border-subtle',
      strong: 'color-border-strong',
      focus: 'color-border-focus',
      danger: 'color-border-danger',
    },
    role: {
      player: 'color-role-player',
      npc: 'color-role-npc',
      scene: 'color-role-scene',
    },
    feedback: {
      info: 'color-feedback-info',
      success: 'color-feedback-success',
      warning: 'color-feedback-warning',
      danger: 'color-feedback-danger',
    },
    overlay: {
      scrim: 'color-overlay-scrim',
      inkSoft: 'color-overlay-ink-soft',
      inkStrong: 'color-overlay-ink-strong',
      paperSoft: 'color-overlay-paper-soft',
    },
  },
  size: {
    spacing: {
      0: 'size-spacing-0',
      0.5: 'size-spacing-0-5',
      1: 'size-spacing-1',
      1.5: 'size-spacing-1-5',
      2: 'size-spacing-2',
      3: 'size-spacing-3',
      4: 'size-spacing-4',
      5: 'size-spacing-5',
      6: 'size-spacing-6',
      7: 'size-spacing-7',
      8: 'size-spacing-8',
      10: 'size-spacing-10',
      12: 'size-spacing-12',
      14: 'size-spacing-14',
      16: 'size-spacing-16',
      20: 'size-spacing-20',
      24: 'size-spacing-24',
      32: 'size-spacing-32',
    },
  },
  radius: {
    none: 'radius-none',
    xs: 'radius-xs',
    sm: 'radius-sm',
    md: 'radius-md',
    lg: 'radius-lg',
    xl: 'radius-xl',
    '2xl': 'radius-2xl',
    full: 'radius-full',
  },
  shadow: {
    xs: 'shadow-xs',
    sm: 'shadow-sm',
    md: 'shadow-md',
    lg: 'shadow-lg',
    xl: 'shadow-xl',
    glowLantern: 'shadow-glow-lantern',
    glowLacquer: 'shadow-glow-lacquer',
    focusRing: 'shadow-focus-ring',
    insetPaper: 'shadow-inset-paper',
  },
  motion: {
    duration: {
      instant: 'motion-duration-instant',
      fast: 'motion-duration-fast',
      normal: 'motion-duration-normal',
      slow: 'motion-duration-slow',
      gentle: 'motion-duration-gentle',
      curtain: 'motion-duration-curtain',
      scene: 'motion-duration-scene',
    },
    easing: {
      standard: 'motion-easing-standard',
      entrance: 'motion-easing-entrance',
      exit: 'motion-easing-exit',
      spring: 'motion-easing-spring',
      linear: 'motion-easing-linear',
    },
    delay: {
      none: 'motion-delay-none',
      beat: 'motion-delay-beat',
      step: 'motion-delay-step',
    },
  },
  font: {
    ui: 'font-ui',
    serif: 'font-serif',
    mono: 'font-mono',
  },
  text: {
    size: {
      xs: 'text-size-xs',
      sm: 'text-size-sm',
      base: 'text-size-base',
      lg: 'text-size-lg',
      xl: 'text-size-xl',
      '2xl': 'text-size-2xl',
      '3xl': 'text-size-3xl',
      '4xl': 'text-size-4xl',
      '5xl': 'text-size-5xl',
    },
    weight: {
      regular: 'text-weight-regular',
      medium: 'text-weight-medium',
      semibold: 'text-weight-semibold',
      bold: 'text-weight-bold',
    },
    lineHeight: {
      tight: 'text-line-height-tight',
      snug: 'text-line-height-snug',
      normal: 'text-line-height-normal',
      relaxed: 'text-line-height-relaxed',
    },
  },
} as const;

// ---------- 辅助函数 ----------
/** 把 token 路径转成 `var(--xxx)` 引用字符串。 */
export function cssVar(name: string): string {
  return `var(--${name})`;
}

/** 引用色 token（拼接 path 后转 var）。 */
export function color(path: ColorKey): string {
  const segs = path.split('.');
  const root = tokens.color[segs[0] as keyof typeof tokens.color] as Record<string, string>;
  const key = segs[1] as string;
  return cssVar(root[key] ?? path);
}

/** 引用间距 token（数字 key）。 */
export function space(key: SpacingKey): string {
  return cssVar(tokens.size.spacing[key]);
}

/** 引用圆角 token。 */
export function radius(key: RadiusKey): string {
  return cssVar(tokens.radius[key]);
}

/** 引用阴影 token。 */
export function shadow(key: ShadowKey): string {
  return cssVar(tokens.shadow[key]);
}

/** 引用时长 token。 */
export function duration(key: MotionDurationKey): string {
  return cssVar(tokens.motion.duration[key]);
}

/** 引用缓动 token。 */
export function easing(key: MotionEasingKey): string {
  return cssVar(tokens.motion.easing[key]);
}

/** 引用延迟 token。 */
export function delay(key: MotionDelayKey): string {
  return cssVar(tokens.motion.delay[key]);
}

/** 引用字体家族 token。 */
export function font(key: FontFamilyKey): string {
  return cssVar(tokens.font[key]);
}
