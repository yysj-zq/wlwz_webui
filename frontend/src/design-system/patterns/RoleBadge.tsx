/**
 * RoleBadge —— 角色徽章 pattern（DS4）。
 *
 *  - 显示角色名 + tone 色环
 *  - size: sm | md | lg
 *  - tone: player / npc / scene / lacquer（覆盖业务色）
 *  - 可选 portrait（图位）
 *  - 全 token 化；可叠加在 NarrativeRail / SpeechBubble 等位置
 */
import { forwardRef, type CSSProperties, type HTMLAttributes, type ReactNode } from 'react';
import { cn } from '../primitives/utils';

export type RoleBadgeTone = 'player' | 'npc' | 'scene' | 'lacquer';
export type RoleBadgeSize = 'sm' | 'md' | 'lg';

export interface RoleBadgeProps extends HTMLAttributes<HTMLSpanElement> {
  name: string;
  slug?: string;
  tone?: RoleBadgeTone;
  size?: RoleBadgeSize;
  /** 角色 portrait 图（ReactNode：通常是 <img />）。 */
  portrait?: ReactNode;
  /** 自定义副标题（身份/位置）。 */
  subtitle?: ReactNode;
  /** 在线指示灯。 */
  online?: boolean;
}

const TONE_COLOR: Record<RoleBadgeTone, string> = {
  player: 'var(--color-role-player)',
  npc: 'var(--color-role-npc)',
  scene: 'var(--color-role-scene)',
  lacquer: 'var(--color-brand-lacquer)',
};

const SIZE: Record<
  RoleBadgeSize,
  { dot: number; font: string; padding: string; portrait: number }
> = {
  sm: { dot: 6, font: 'var(--text-size-xs)', padding: '2px 8px', portrait: 20 },
  md: { dot: 8, font: 'var(--text-size-sm)', padding: '4px 10px', portrait: 28 },
  lg: { dot: 10, font: 'var(--text-size-base)', padding: '6px 12px', portrait: 36 },
};

export const RoleBadge = forwardRef<HTMLSpanElement, RoleBadgeProps>(function RoleBadge(
  { name, slug, tone = 'npc', size = 'md', portrait, subtitle, online, className, style, ...rest },
  ref,
) {
  const cfg = SIZE[size];
  const combined: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 'var(--size-spacing-2)',
    padding: cfg.padding,
    background: 'var(--color-surface-1)',
    border: `1px solid var(--color-border-subtle)`,
    borderRadius: 'var(--radius-full)',
    fontFamily: 'var(--font-ui)',
    fontSize: cfg.font,
    fontWeight: 'var(--text-weight-medium)',
    color: 'var(--color-text-primary)',
    lineHeight: 1,
    ...style,
  };
  return (
    <span
      ref={ref}
      data-tone={tone}
      data-slug={slug}
      className={cn('ds-rolebadge', `ds-rolebadge--${tone}`, `ds-rolebadge--${size}`, className)}
      style={combined}
      {...rest}
    >
      {portrait ? (
        <span
          aria-hidden
          style={{
            display: 'inline-flex',
            width: cfg.portrait,
            height: cfg.portrait,
            borderRadius: 'var(--radius-full)',
            overflow: 'hidden',
            border: `1px solid ${TONE_COLOR[tone]}`,
            background: 'var(--color-surface-2)',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {portrait}
        </span>
      ) : (
        <span
          aria-hidden
          style={{
            display: 'inline-block',
            width: cfg.dot,
            height: cfg.dot,
            borderRadius: 'var(--radius-full)',
            background: TONE_COLOR[tone],
          }}
        />
      )}
      <span style={{ display: 'inline-flex', flexDirection: 'column', lineHeight: 1.2 }}>
        <span style={{ fontWeight: 'var(--text-weight-semibold)' }}>{name}</span>
        {subtitle ? (
          <span
            style={{
              fontSize: 'var(--text-size-xs)',
              color: 'var(--color-text-muted)',
              fontWeight: 'var(--text-weight-regular)',
            }}
          >
            {subtitle}
          </span>
        ) : null}
      </span>
      {online !== undefined ? (
        <span
          aria-label={online ? '在线' : '离线'}
          style={{
            display: 'inline-block',
            width: cfg.dot,
            height: cfg.dot,
            borderRadius: 'var(--radius-full)',
            background: online ? 'var(--color-feedback-success)' : 'var(--color-text-muted)',
          }}
        />
      ) : null}
    </span>
  );
});

export default RoleBadge;
