/**
 * BeatIn —— 叙事节拍入场 pattern（DS4）。
 *
 *  - 复用 motion recipe 的 BeatIn，组合出 NarrativeRail 风格的节拍行
 *  - 支持 kind: speak / act / scene（与 timeline.kind 对齐）
 *  - 自动应用 ds-beat-in + delay class
 */
import { forwardRef, type CSSProperties, type HTMLAttributes, type ReactNode } from 'react';
import { cn } from '../primitives/utils';
import { BeatIn as MotionBeatIn } from '../motion/recipes';

export type BeatKind = 'speak' | 'act' | 'speak_and_act' | 'scene';

export interface BeatInProps extends HTMLAttributes<HTMLDivElement> {
  /** timeline kind 投影；影响样式。 */
  kind?: BeatKind;
  /** 错峰序号（0-4）。 */
  index?: number;
  /** 渲染标签，默认 li。 */
  as?: 'div' | 'li' | 'article' | 'section';
  children: ReactNode;
}

const KIND_STYLE: Record<BeatKind, CSSProperties> = {
  speak: {
    borderLeft: '3px solid var(--color-role-npc)',
  },
  act: {
    borderLeft: '3px solid var(--color-role-player)',
  },
  speak_and_act: {
    borderLeft: '3px solid var(--color-brand-lacquer)',
  },
  scene: {
    borderLeft: '3px solid var(--color-role-scene)',
    background: 'var(--color-surface-1)',
    fontStyle: 'italic',
  },
};

export const BeatInPattern = forwardRef<HTMLDivElement, BeatInProps>(function BeatInPattern(
  { kind = 'speak', index = 0, as = 'div', children, className, style, ...rest },
  ref,
) {
  const Tag = as as 'div';
  return (
    <MotionBeatIn index={index} as={as} className={cn('ds-beat', `ds-beat--${kind}`, className)}>
      <Tag
        ref={ref}
        data-kind={kind}
        style={{
          padding: 'var(--size-spacing-3) var(--size-spacing-4)',
          marginBottom: 'var(--size-spacing-2)',
          background: 'var(--color-surface-0)',
          borderRadius: 'var(--radius-sm)',
          boxShadow: 'var(--shadow-xs)',
          fontFamily: kind === 'scene' ? 'var(--font-serif)' : 'var(--font-ui)',
          fontSize: 'var(--text-size-base)',
          lineHeight: 'var(--text-line-height-normal)',
          color: 'var(--color-text-primary)',
          ...KIND_STYLE[kind],
          ...style,
        }}
        {...rest}
      >
        {children}
      </Tag>
    </MotionBeatIn>
  );
});

export default BeatInPattern;
