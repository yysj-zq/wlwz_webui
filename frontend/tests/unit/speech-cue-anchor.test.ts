import { describe, expect, it } from 'vitest';
import type { WorldEntity } from '@shared/api';
import {
  createStageCue,
  latestCuesByActor,
  makeCue,
  pickActiveCue,
  projectCueAnchor,
  pruneExpired,
} from '@shared/stage/speech';

function entityAt(id: string, x: number, y: number): WorldEntity {
  return {
    id,
    name: id,
    kind: 'npc',
    position: { x, y },
    assetKey: id,
    direction: 'south',
    interactable: true,
    publicState: {},
  };
}

describe('projectCueAnchor', () => {
  const camera = {
    scrollX: 2000,
    scrollY: 1000,
    zoom: 1,
    cssWidth: 800,
    cssHeight: 600,
    viewW: 800,
    viewH: 600,
  } as const;

  it('减去相机 scroll，气泡落在视口内', () => {
    const pt = projectCueAnchor(entityAt('baizhantang', 50, 27), camera, 48, -56);
    expect(pt.x).toBe(400);
    expect(pt.y).toBe(240);
  });

  it('缺实体时回落到视口中上方', () => {
    expect(projectCueAnchor(null, camera)).toEqual({ x: 400, y: 32 });
  });
});

describe('latestCuesByActor — 每角色常驻最新一句', () => {
  it('默认不过期（expiresAt=0）', () => {
    const cue = makeCue('a', '甲', '你好世界', 1000);
    expect(cue.expiresAt).toBe(0);
    expect(cue.excerpt.length).toBeGreaterThan(0);
  });

  it('同 actor 只保留最新；多 actor 同时返回', () => {
    const cues = [
      makeCue('a', '甲', '第一句', 100),
      makeCue('b', '乙', '乙在说', 200),
      makeCue('a', '甲', '第二句覆盖', 300),
    ];
    const active = latestCuesByActor(cues, 999_999);
    expect(active).toHaveLength(2);
    const byId = Object.fromEntries(active.map((c) => [c.actorId, c.excerpt]));
    expect(byId.a).toContain('第二句');
    expect(byId.b).toContain('乙在说');
  });

  it('限时 cue 过期后被丢掉；常驻 cue 保留', () => {
    const cues = [makeCue('a', '甲', '常驻', 100, 0), makeCue('b', '乙', '限时', 100, 1000)];
    expect(latestCuesByActor(cues, 500)).toHaveLength(2);
    expect(latestCuesByActor(cues, 1200)).toHaveLength(1);
    expect(latestCuesByActor(cues, 1200)[0]?.actorId).toBe('a');
  });

  it('pruneExpired 折叠为每 actor 最新', () => {
    const cues = [makeCue('a', '甲', '旧', 1), makeCue('a', '甲', '新', 2)];
    const pruned = pruneExpired(cues, 10);
    expect(pruned).toHaveLength(1);
    expect(pruned[0]?.excerpt).toContain('新');
  });

  it('createStageCue 默认常驻', () => {
    const cue = createStageCue({
      actor: entityAt('tongxiangyu', 1, 1),
      actorName: '佟湘玉',
      text: '欢迎光临',
      now: 42,
    });
    expect(cue.expiresAt).toBe(0);
  });

  it('pickActiveCue 仍返回全局最新一条（兼容）', () => {
    const cues = [makeCue('a', '甲', '早', 1), makeCue('b', '乙', '晚', 9)];
    expect(pickActiveCue(cues, 100)?.actorId).toBe('b');
  });
});
