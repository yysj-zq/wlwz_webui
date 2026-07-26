import { describe, expect, it } from 'vitest';
import type { WorldEntity, WorldState } from '@shared/api';
import { diffWorldPatch } from '@shared/stage/world/diffRenderer';

function entity(id: string, kind: WorldEntity['kind'], interactable: boolean): WorldEntity {
  return {
    id,
    name: id,
    kind,
    interactable,
    position: { x: 1, y: 1 },
    direction: 'south',
    assetKey: null,
  };
}

describe('diffWorldPatch kind / interactable', () => {
  it('marks played-role flip as changed so sprites can rebind click', () => {
    const prev: WorldState = {
      mapId: 'tongfu_inn',
      stateVersion: 1,
      playerActorId: 'player',
      entities: {
        player: entity('player', 'player', false),
        baizhantang: entity('baizhantang', 'npc', true),
      },
    };
    const next: WorldState = {
      mapId: 'tongfu_inn',
      stateVersion: 2,
      playerActorId: 'baizhantang',
      entities: {
        player: entity('player', 'npc', true),
        baizhantang: entity('baizhantang', 'player', false),
      },
    };

    const patch = diffWorldPatch(prev, next);
    const changedIds = [...patch.changed.map((p) => p.entityId)].sort();

    expect(changedIds).toEqual(['baizhantang', 'player']);
    expect(patch.unchangedCount).toBe(0);
  });
});
