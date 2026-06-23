import { applyEntityPatches, applyTimelineDelta } from './worldState';

test('applyEntityPatches merges entity position and public_state', () => {
  const worldState = {
    state_version: 1,
    entities: {
      baizhantang: {
        id: 'baizhantang',
        position: { x: 1, y: 2 },
        public_state: { mood: 'alert' },
      },
    },
  };

  const next = applyEntityPatches(worldState, [
    {
      entity_id: 'baizhantang',
      position: { x: 3, y: 4 },
      public_state: { mood: 'friendly' },
    },
  ]);

  expect(next.entities.baizhantang.position).toEqual({ x: 3, y: 4 });
  expect(next.entities.baizhantang.public_state).toEqual({ mood: 'friendly' });
});

test('applyTimelineDelta folds multiple act_patch entries into worldState', () => {
  const worldState = {
    state_version: 1,
    entities: {
      player: { id: 'player', position: { x: 5, y: 6 }, public_state: {} },
      baizhantang: { id: 'baizhantang', position: { x: 8, y: 5 }, public_state: { mood: 'alert' } },
    },
  };
  const delta = [
    { kind: 'act', actor_id: 'player', act_patch: [{ entity_id: 'player', position: { x: 6, y: 6 } }] },
    { kind: 'speak_and_act', actor_id: 'baizhantang', speak: '客官请讲。', act_patch: [{ entity_id: 'baizhantang', public_state: { mood: 'warm' } }] },
    { kind: 'speak', actor_id: 'tongxiangyu', speak: '额滴神啊。' },
  ];
  const next = applyTimelineDelta(worldState, delta);
  expect(next.entities.player.position).toEqual({ x: 6, y: 6 });
  expect(next.entities.baizhantang.public_state.mood).toBe('warm');
});
