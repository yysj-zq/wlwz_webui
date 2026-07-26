/**
 * SpeechBubble —— 戏文气泡（DS4）。
 *
 *  - tone: paper(默认) / ink(夜话) / lacquer(强调)
 *  - tail: 气泡尖角方向（top / bottom / left / right / none）
 *  - actor: 显示说话者名（带角色色）
 *  - 完整台词走 NarrativeRail；本组件用于"谁在说话 + 前几句"
 */
import { forwardRef, type CSSProperties, type HTMLAttributes, type ReactNode } from 'react';
import { cn } from '../primitives/utils';

export type SpeechTone = 'paper' | 'ink' | 'lacquer' | 'lantern';
export type SpeechTail = 'top' | 'bottom' | 'left' | 'right' | 'none';

export interface SpeechBubbleProps extends HTMLAttributes<HTMLDivElement> {
  tone?: SpeechTone;
  tail?: SpeechTail;
  /** 说话者名字。 */
  actor?: string;
  /** 说话者角色色 key（brand-ink / role-player / role-npc / role-scene）。 */
  actorTone?: 'ink' | 'player' | 'npc' | 'scene';
  /** 是否粗体显示 actor。 */
  actorBold?: boolean;
  children: ReactNode;
}

const TONE: Record<SpeechTone, CSSProperties> = {
  paper: {
    background: 'var(--color-surface-0)',
    color: 'var(--color-text-primary)',
    border: '1px solid var(--color-border-subtle)',
  },
  ink: {
    background: 'var(--color-brand-ink)',
    color: 'var(--color-text-inverse)',
    border: '1px solid var(--color-brand-ink)',
  },
  lacquer: {
    background: 'var(--color-brand-lacquer)',
    color: 'var(--color-text-inverse)',
    border: '1px solid var(--color-brand-lacquer)',
  },
  lantern: {
    background: 'var(--color-brand-lantern)',
    color: 'var(--color-text-primary)',
    border: '1px solid var(--color-brand-lantern)',
  },
};

const ACTOR_COLOR: Record<NonNullable<SpeechBubbleProps['actorTone']>, string> = {
  ink: 'var(--color-brand-ink)',
  player: 'var(--color-role-player)',
  npc: 'var(--color-role-npc)',
  scene: 'var(--color-role-scene)',
};

/** 尖角：用 ::after 伪元素 + border 实现。 */
const TAIL: Record<SpeechTail, CSSProperties & Record<string, string>> = {
  top: {
    borderTopLeftRadius: 'var(--radius-md)',
    borderTopRightRadius: 'var(--radius-md)',
    borderBottomLeftRadius: 'var(--radius-md)',
    borderBottomRightRadius: 'var(--radius-md)',
    marginTop: 'var(--size-spacing-2)',
    '--tail-side': 'top',
  },
  bottom: {
    borderRadius: 'var(--radius-md)',
    marginBottom: 'var(--size-spacing-2)',
    '--tail-side': 'bottom',
  },
  left: {
    borderRadius: 'var(--radius-md)',
    marginLeft: 'var(--size-spacing-2)',
    '--tail-side': 'left',
  },
  right: {
    borderRadius: 'var(--radius-md)',
    marginRight: 'var(--size-spacing-2)',
    '--tail-side': 'right',
  },
  none: {
    borderRadius: 'var(--radius-md)',
  },
};

export const SpeechBubble = forwardRef<HTMLDivElement, SpeechBubbleProps>(function SpeechBubble(
  {
    tone = 'paper',
    tail = 'top',
    actor,
    actorTone = 'ink',
    actorBold = true,
    children,
    className,
    style,
    ...rest
  },
  ref,
) {
  const combined: CSSProperties = {
    position: 'relative',
    display: 'inline-block',
    maxWidth: '320px',
    padding: 'var(--size-spacing-3) var(--size-spacing-4)',
    fontFamily: 'var(--font-serif)',
    fontSize: 'var(--text-size-base)',
    lineHeight: 'var(--text-line-height-relaxed)',
    boxShadow: 'var(--shadow-sm)',
    ...TONE[tone],
    ...TAIL[tail],
    ...style,
  };

  return (
    <div
      ref={ref}
      role="group"
      aria-label={actor ? `${actor}说` : '气泡'}
      data-tail={tail}
      className={cn('ds-speechbubble', `ds-speechbubble--${tone}`, className)}
      style={combined}
      {...rest}
    >
      {actor ? (
        <div
          style={{
            fontFamily: 'var(--font-ui)',
            fontSize: 'var(--text-size-xs)',
            fontWeight: actorBold ? 'var(--text-weight-bold)' : 'var(--text-weight-medium)',
            color: tone === 'paper' || tone === 'lantern' ? ACTOR_COLOR[actorTone] : 'inherit',
            letterSpacing: 'var(--text-letter-wide)',
            textTransform: 'uppercase',
            marginBottom: 'var(--size-spacing-1)',
          }}
        >
          {actor}
        </div>
      ) : null}
      <div>{children}</div>
    </div>
  );
});

/* ============================================================
 * 全局 CSS（注入到 base.css / Storybook preview）
 * ============================================================ */
export const SPEECHBUBBLE_GLOBAL_CSS = `
.ds-speechbubble[data-tail="top"]::before,
.ds-speechbubble[data-tail="bottom"]::before,
.ds-speechbubble[data-tail="left"]::before,
.ds-speechbubble[data-tail="right"]::before {
  content: '';
  position: absolute;
  width: 0;
  height: 0;
  border: 8px solid transparent;
}
.ds-speechbubble[data-tail="top"]::before {
  top: -16px;
  left: 24px;
  borderBottomColor: inherit;
}
.ds-speechbubble[data-tail="bottom"]::after {
  content: '';
  position: absolute;
  bottom: -16px;
  left: 24px;
  width: 0;
  height: 0;
  border: 8px solid transparent;
  borderTopColor: inherit;
}
.ds-speechbubble[data-tail="left"]::before {
  top: 16px;
  left: -16px;
  borderRightColor: inherit;
}
.ds-speechbubble[data-tail="right"]::before {
  top: 16px;
  right: -16px;
  borderLeftColor: inherit;
}
.ds-speechbubble--paper::before,
.ds-speechbubble--paper::after {
  filter: drop-shadow(0 1px 1px var(--color-overlay-ink-soft));
}
`;
