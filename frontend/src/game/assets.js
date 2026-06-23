export const TILE_SIZE = 32;

export const GAME_ASSETS = {
  map: {
    id: 'tongfu_inn',
    json: '/assets/game/maps/tongfu_inn_map.json',
    tileset: '/assets/game/maps/tongfu_inn_tileset.png',
  },
  ui: {
    dialogPanel: '/assets/game/ui/dialog_panel.png',
    actionPrompt: '/assets/game/ui/action_prompt.png',
  },
  characters: {
    player: '/assets/game/placeholders/player.png',
    baizhantang: '/assets/characters/baizhantang_south.png',
    guofurong: '/assets/characters/guofurong_south.png',
    tongxiangyu: '/assets/characters/tongxiangyu_south.png',
  },
  objects: {
    abacus: '/assets/objects/abacus.png',
    chair: '/assets/objects/chair.png',
    counter: '/assets/objects/counter.png',
    ledger: '/assets/objects/ledger.png',
    stairs: '/assets/objects/stairs.png',
    table: '/assets/objects/table.png',
  },
};

export const entityAssetPath = (entity) => {
  if (!entity) return null;
  if (entity.kind === 'player' || entity.kind === 'npc') return GAME_ASSETS.characters[entity.asset_key || entity.id] || null;
  if (entity.kind === 'object') return GAME_ASSETS.objects[entity.asset_key || entity.id] || null;
  return null;
};
