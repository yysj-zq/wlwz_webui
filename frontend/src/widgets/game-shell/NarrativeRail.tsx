/**
 * NarrativeRail widget —— TanStack Virtual 长 timeline。
 *
 * 把 TimelineEntry[] 渲染为可读戏文 + 旁白；长列表虚拟化。
 */
import { useCallback, useEffect, useMemo, useRef, type CSSProperties } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { TimelineEntry, WorldState } from '@shared/api';
import { projectTimeline, type NarrativeBeat } from '@entities/timeline/model';
import { BeatInPattern } from '@ds/patterns/BeatIn';
import { RoleBadge } from '@ds/patterns/RoleBadge';
import { TtsButton } from '@features/tts';

/** 单行预估高（px）；按 kind 派生。 */
const ROW_ESTIMATE_SCENE = 56;
const ROW_ESTIMATE_DIALOG = 96;
const ROW_ESTIMATE_ACT = 80;
const ROW_ESTIMATE_SPEAK_AND_ACT = 110;
/** 行高下界（用于 calculateRange fallback）。 */
const ROW_MIN = 48;

/**
 * 万条虚拟化的 overscan：业务侧需要支持 50 000 条场景；视口 ~480px，
 * 估行高 ~96px → 同时可见 5 行；overscan=8 保证滚动时不出现\"白条闪烁\"。
 * 10000 条下 DOM 节点数稳定在 ~25-30。
 */
const OVERSCAN = 8;

/** Firefox 对 ResizeObserver 测高不稳定，退回 estimate。 */
const canMeasureVirtualRows =
  typeof window !== 'undefined' && !/Firefox/i.test(navigator.userAgent);

/**
 * 按 kind 派生单行预估高。
 */
function estimateRowSize(kind: NarrativeBeat['kind']): number {
  switch (kind) {
    case 'scene':
      return ROW_ESTIMATE_SCENE;
    case 'speak':
      return ROW_ESTIMATE_DIALOG;
    case 'act':
      return ROW_ESTIMATE_ACT;
    case 'speak_and_act':
      return ROW_ESTIMATE_SPEAK_AND_ACT;
  }
}

/**
 * 给 virtualizer 用的 estimateSize：按 index 取不同行高。
 */
function makeEstimateSize(beats: readonly NarrativeBeat[]): (index: number) => number {
  return (index: number): number => {
    const beat = beats[index];
    if (!beat) return ROW_ESTIMATE_DIALOG;
    return estimateRowSize(beat.kind);
  };
}

export interface NarrativeRailProps {
  /** 原始 timeline 列表（按 id 升序；最新在末尾）。 */
  readonly entries: readonly TimelineEntry[];
  /** 世界状态（用于解析 actor 名）。 */
  readonly world: WorldState | null;
  /** 自动跟随最新一条；默认 true。 */
  readonly autoFollow?: boolean;
  /** 高度；默认 '100%'。 */
  readonly height?: number | string;
  /** 选择条目时回调（用于 Scene / Stage 锚点）。 */
  readonly onSelect?: (entryId: string | number, beat: NarrativeBeat) => void;
  /** 当前选中的条目 id（高亮 / focus）。 */
  readonly selectedEntryId?: string | number | null;
  /** 测试用：自定义 className。 */
  readonly className?: string;
  /** 测试用：自定义 style。 */
  readonly style?: CSSProperties;
}

const KIND_LABEL: Record<NarrativeBeat['kind'], string> = {
  speak: '对白',
  act: '动作',
  speak_and_act: '言行',
  scene: '旁白',
};

const KIND_TONE: Record<NarrativeBeat['kind'], 'player' | 'npc' | 'scene' | 'lacquer'> = {
  speak: 'npc',
  act: 'player',
  speak_and_act: 'lacquer',
  scene: 'scene',
};

export function NarrativeRail({
  entries,
  world,
  autoFollow = true,
  height = '100%',
  onSelect,
  selectedEntryId,
  className,
  style,
}: NarrativeRailProps) {
  // 投影 TimelineEntry → NarrativeBeat
  const beats: readonly NarrativeBeat[] = useMemo(() => {
    const lookup = (id: string): string | null => {
      if (!world) return null;
      return world.entities[id]?.name ?? null;
    };
    return projectTimeline([...entries], lookup);
  }, [entries, world]);

  const scrollRef = useRef<HTMLDivElement | null>(null);

  // 按 kind 派生行高（scene 短，对白长）
  const estimateSize = useMemo(() => makeEstimateSize(beats), [beats]);

  const virtualizer = useVirtualizer({
    count: beats.length,
    getScrollElement: () => scrollRef.current,
    estimateSize,
    overscan: OVERSCAN,
    ...(canMeasureVirtualRows
      ? {
          measureElement: (element: Element) => element.getBoundingClientRect().height,
        }
      : {}),
  });

  const virtualItems = virtualizer.getVirtualItems();
  const totalSize = virtualizer.getTotalSize();

  // 万条虚拟化验证：DOM 节点数 / 总条目数 = 虚拟化率（越接近 0% 越好）
  const virtualizationRate = beats.length > 0 ? virtualItems.length / beats.length : 0;

  // autoFollow → 滚到底部（仅在 beats 增长时触发）
  const lastCountRef = useRef(beats.length);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (!autoFollow) return;
    if (beats.length > lastCountRef.current) {
      requestAnimationFrame(() => {
        if (!scrollRef.current) return;
        scrollRef.current.scrollTop = totalSize;
      });
    }
    lastCountRef.current = beats.length;
  }, [beats.length, autoFollow, totalSize]);

  const handleSelect = useCallback(
    (beat: NarrativeBeat) => {
      if (!onSelect) return;
      onSelect(beat.id, beat);
    },
    [onSelect],
  );

  const containerStyle: CSSProperties = {
    position: 'relative',
    width: '100%',
    height,
    overflow: 'hidden',
    background: 'var(--color-surface-0)',
    borderRadius: 'var(--radius-lg)',
    border: '1px solid var(--color-border-subtle)',
    fontFamily: 'var(--font-ui)',
    ...style,
  };

  const scrollStyle: CSSProperties = {
    position: 'absolute',
    inset: 0,
    overflowY: 'auto',
    overflowX: 'hidden',
    scrollbarWidth: 'thin',
  };

  return (
    <section
      aria-label="戏文时间线"
      aria-live={autoFollow ? 'polite' : 'off'}
      data-testid="narrative-rail"
      data-virtualized-count={beats.length}
      data-virtual-window={virtualItems.length}
      data-virtualization-rate={virtualizationRate}
      className={className}
      style={containerStyle}
    >
      <div ref={scrollRef} role="log" aria-relevant="additions" style={scrollStyle}>
        <div
          style={{
            position: 'relative',
            height: `${Math.max(ROW_MIN, totalSize)}px`,
            width: '100%',
          }}
        >
          {virtualItems.map((vItem) => {
            const beat = beats[vItem.index];
            if (!beat) return null;
            const isSelected = beat.id === selectedEntryId;
            return (
              <div
                key={beat.id}
                ref={virtualizer.measureElement}
                data-index={vItem.index}
                role="button"
                tabIndex={0}
                aria-label={`${KIND_LABEL[beat.kind]} — ${beat.actorName ?? '旁白'}：${beat.content}`}
                aria-current={isSelected ? 'true' : undefined}
                data-testid={`narrative-beat-${beat.id}`}
                data-kind={beat.kind}
                onClick={() => handleSelect(beat)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleSelect(beat);
                  }
                }}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  minHeight: `${ROW_MIN}px`,
                  transform: `translateY(${vItem.start}px)`,
                  padding: 'var(--size-spacing-2) var(--size-spacing-4)',
                }}
              >
                <BeatInPattern
                  kind={beat.kind}
                  index={Math.min(4, vItem.index % 5)}
                  as="div"
                  style={{
                    outline: isSelected ? '2px solid var(--color-lacquer)' : 'none',
                    outlineOffset: '2px',
                    borderRadius: 'var(--radius-sm)',
                    cursor: onSelect ? 'pointer' : 'default',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 'var(--size-spacing-3)',
                      minHeight: 0,
                    }}
                  >
                    <RoleBadge
                      name={beat.actorName ?? '旁白'}
                      tone={KIND_TONE[beat.kind]}
                      size="sm"
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'baseline',
                          gap: 'var(--size-spacing-2)',
                          marginBottom: 'var(--size-spacing-1)',
                          fontSize: 'var(--text-size-xs)',
                          color: 'var(--color-text-muted)',
                          fontWeight: 'var(--text-weight-medium)',
                        }}
                      >
                        <span>{KIND_LABEL[beat.kind]}</span>
                        {beat.createdAt ? (
                          <time
                            dateTime={beat.createdAt}
                            style={{ fontFamily: 'var(--font-mono)' }}
                          >
                            {formatTime(beat.createdAt)}
                          </time>
                        ) : null}
                        {beat.actorId &&
                        beat.content &&
                        (beat.kind === 'speak' || beat.kind === 'speak_and_act') ? (
                          <TtsButton text={beat.content} assistantRole={beat.actorId} size="sm" />
                        ) : null}
                      </div>
                      <div
                        style={{
                          fontFamily:
                            beat.kind === 'scene' ? 'var(--font-serif)' : 'var(--font-ui)',
                          fontSize: 'var(--text-size-base)',
                          lineHeight: 'var(--text-line-height-relaxed)',
                          color: 'var(--color-text-primary)',
                          whiteSpace: 'pre-wrap',
                          wordBreak: 'break-word',
                          overflowWrap: 'break-word',
                        }}
                      >
                        {beat.content}
                      </div>
                    </div>
                  </div>
                </BeatInPattern>
              </div>
            );
          })}
        </div>
        {beats.length === 0 ? (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 'var(--size-spacing-6)',
              color: 'var(--color-text-muted)',
              fontFamily: 'var(--font-serif)',
              fontSize: 'var(--text-size-base)',
              textAlign: 'center',
              pointerEvents: 'none',
            }}
            aria-hidden
          >
            戏未开场 · 等待第一轮…
          </div>
        ) : null}
      </div>
    </section>
  );
}

function formatTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

export default NarrativeRail;
