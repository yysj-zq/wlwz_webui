// 同福客栈场景。
// - 资源策略：tilemap json 优先（drawTilemap），加载失败时回退到 drawMap 程序
//   化绘制，保证缺资源时仍能开发联调。
// - 移动为本地乐观：onLocalMove 上报落点，提交与防抖在 GameView 统一处理。
import Phaser from 'phaser';
import { GAME_ASSETS, TILE_SIZE, entityAssetPath } from '../assets';

const TILEMAP_KEY = 'tongfu_inn_map';
const TILESET_IMAGE_KEY = 'tongfu_inn_tileset';

const worldToPixel = (position) => ({
  x: position.x * TILE_SIZE + TILE_SIZE / 2,
  y: position.y * TILE_SIZE + TILE_SIZE / 2,
});

export default class TongfuInnScene extends Phaser.Scene {
  constructor({ getWorldState, onInteract, onLocalMove, isMoveLocked } = {}) {
    super('TongfuInnScene');
    this.getWorldState = getWorldState;
    this.onInteract = onInteract;
    this.onLocalMove = onLocalMove;
    this.isMoveLocked = isMoveLocked || (() => false);
    this.entitySprites = new Map();
    this.entityLabels = new Map();
  }

  preload() {
    this.load.image(TILESET_IMAGE_KEY, GAME_ASSETS.map.tileset);
    this.load.tilemapTiledJSON(TILEMAP_KEY, GAME_ASSETS.map.json);
    Object.entries(GAME_ASSETS.characters).forEach(([key, path]) => this.load.image(`character:${key}`, path));
    Object.entries(GAME_ASSETS.objects).forEach(([key, path]) => this.load.image(`object:${key}`, path));
  }

  create() {
    this.cameras.main.setBackgroundColor('#201813');
    this.cursors = this.input.keyboard.createCursorKeys();
    if (!this.tryDrawTilemap()) {
      this.drawMap();
    }
    this.applyWorldState(this.getWorldState?.());
  }

  update() {
    if (!this.cursors) return;
    if (this.isMoveLocked()) return;  // 交互框打开时锁移动
    const player = this.getWorldState?.()?.entities?.player;
    if (!player) return;

    const delta = { x: 0, y: 0 };
    let direction = player.direction || 'south';
    if (Phaser.Input.Keyboard.JustDown(this.cursors.left)) {
      delta.x = -1;
      direction = 'west';
    } else if (Phaser.Input.Keyboard.JustDown(this.cursors.right)) {
      delta.x = 1;
      direction = 'east';
    } else if (Phaser.Input.Keyboard.JustDown(this.cursors.up)) {
      delta.y = -1;
      direction = 'north';
    } else if (Phaser.Input.Keyboard.JustDown(this.cursors.down)) {
      delta.y = 1;
      direction = 'south';
    }

    if (delta.x || delta.y) {
      const nextPosition = {
        x: Math.max(1, Math.min(16, player.position.x + delta.x)),
        y: Math.max(1, Math.min(10, player.position.y + delta.y)),
      };
      // 本地乐观：上报落点，由 GameView 即时更新本地 world_state 并防抖提交。
      this.onLocalMove?.({ position: nextPosition, direction });
    }
  }

  drawMap() {
    const graphics = this.add.graphics();
    graphics.fillStyle(0x7e4d2a, 1);
    graphics.fillRect(0, 0, 18 * TILE_SIZE, 12 * TILE_SIZE);
    graphics.lineStyle(1, 0x2d1f1a, 0.35);
    for (let x = 0; x <= 18; x += 1) {
      graphics.moveTo(x * TILE_SIZE, 0);
      graphics.lineTo(x * TILE_SIZE, 12 * TILE_SIZE);
    }
    for (let y = 0; y <= 12; y += 1) {
      graphics.moveTo(0, y * TILE_SIZE);
      graphics.lineTo(18 * TILE_SIZE, y * TILE_SIZE);
    }
    graphics.strokePath();
  }

  tryDrawTilemap() {
    if (!this.cache.tilemap.exists(TILEMAP_KEY)) return false;
    try {
      const tilemap = this.make.tilemap({ key: TILEMAP_KEY });
      const tilesetName = tilemap.tilesets[0]?.name || 'tongfu_inn_tileset';
      const tileset = tilemap.addTilesetImage(tilesetName, TILESET_IMAGE_KEY);
      if (!tileset) return false;
      tilemap.layers.forEach((layerData) => {
        tilemap.createLayer(layerData.name, tileset, 0, 0);
      });
      return true;
    } catch (error) {
      console.warn('Tilemap render failed, falling back to graphics map', error);
      return false;
    }
  }

  applyWorldState(worldState) {
    if (!worldState?.entities) return;
    Object.values(worldState.entities).forEach((entity) => this.renderEntity(entity));
  }

  renderEntity(entity) {
    const key = this.textureKeyForEntity(entity);
    const { x, y } = worldToPixel(entity.position);
    let sprite = this.entitySprites.get(entity.id);
    const shouldUseTexture = key && this.textures.exists(key);

    if (sprite?.getData?.('fallback') && shouldUseTexture) {
      sprite.destroy();
      this.entitySprites.delete(entity.id);
      sprite = null;
    }

    if (!sprite) {
      if (shouldUseTexture) {
        sprite = this.add.image(x, y, key);
        sprite.setDisplaySize(entity.kind === 'object' ? 42 : 48, entity.kind === 'object' ? 42 : 48);
      } else {
        sprite = this.add.circle(x, y, entity.kind === 'player' ? 15 : 18, this.colorForEntity(entity));
        sprite.setData('fallback', true);
      }
      sprite.setDepth(entity.position.y * 10 + (entity.kind === 'object' ? 0 : 5));
      sprite.setInteractive({ useHandCursor: entity.interactable || entity.kind === 'npc' });
      sprite.on('pointerdown', () => {
        if (entity.interactable || entity.kind === 'npc') {
          this.onInteract?.(entity);
        }
      });
      this.entitySprites.set(entity.id, sprite);

      const label = this.add.text(x, y + 25, entity.name, {
        fontSize: '12px',
        color: '#fff1c9',
        backgroundColor: 'rgba(0,0,0,0.45)',
        padding: { left: 4, right: 4, top: 2, bottom: 2 },
      });
      label.setOrigin(0.5, 0);
      label.setDepth(999);
      this.entityLabels.set(entity.id, label);
    }

    sprite.setPosition(x, y);
    sprite.setDepth(entity.position.y * 10 + (entity.kind === 'object' ? 0 : 5));
    const label = this.entityLabels.get(entity.id);
    label?.setPosition(x, y + 25);
  }

  textureKeyForEntity(entity) {
    const assetPath = entityAssetPath(entity);
    if (!assetPath) return null;
    if (entity.kind === 'player' || entity.kind === 'npc') return `character:${entity.asset_key || entity.id}`;
    if (entity.kind === 'object') return `object:${entity.asset_key || entity.id}`;
    return null;
  }

  colorForEntity(entity) {
    if (entity.kind === 'player') return 0x66b6ff;
    if (entity.kind === 'npc') return 0xd8a24c;
    return 0x8b6a4a;
  }
}
