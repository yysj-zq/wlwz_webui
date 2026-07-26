/**
 * Timeline 实体：kind→NarrativeBeat 投影，供 NarrativeRail 渲染（Phase 1 F1-2）。
 */
import type { TimelineEntry } from '@shared/api';

export type NarrativeBeat = {
  id: number | string;
  turnId: string;
  intraTurnSeq: number;
  actorId: string | null;
  actorName: string | null;
  kind: 'speak' | 'act' | 'speak_and_act' | 'scene';
  content: string;
  targetId: string | null;
  createdAt: string | null;
};

/**
 * TimelineEntry（含可选 field） → NarrativeBeat（必填渲染友好）。
 * actorName 由 worldState.name_lookup() 二次注入。
 */
export function projectTimeline(
  entries: TimelineEntry[],
  nameLookup: (id: string) => string | null,
): NarrativeBeat[] {
  return entries
    .filter((e) => e.turnId.length > 0)
    .map((e) => {
      const kind: NarrativeBeat['kind'] =
        e.kind ??
        (e.actorId === null || e.actorId === undefined
          ? 'scene'
          : e.speak && e.actPatch && e.actPatch.length > 0
            ? 'speak_and_act'
            : e.actPatch && e.actPatch.length > 0
              ? 'act'
              : 'speak');
      const content =
        e.speak ??
        e.narration ??
        (e.actPatch && e.actPatch.length > 0
          ? `[动作] ${e.actPatch.map((p) => p.entityId).join(', ')}`
          : '');
      return {
        id: e.id ?? `${e.turnId}-${e.intraTurnSeq ?? -1}`,
        turnId: e.turnId,
        intraTurnSeq: e.intraTurnSeq ?? -1,
        actorId: e.actorId ?? null,
        actorName: e.actorId ? (nameLookup(e.actorId) ?? null) : null,
        kind,
        content,
        targetId: e.targetId ?? null,
        createdAt: e.createdAt ?? null,
      };
    });
}
