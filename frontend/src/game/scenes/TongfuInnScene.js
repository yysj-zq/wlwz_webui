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

const BUBBLE_MAX_WIDTH = 160;
const BUBBLE_PADDING_X = 10;
const BUBBLE_PADDING_Y = 8;
const BUBBLE_ICON_SIZE = 14;
const BUBBLE_GAP = 36;
const BUBBLE_DEPTH = 2000;
const BUBBLE_FONT_SIZE = '13px';
const BUBBLE_MAX_CHARS = 72;

export default class TongfuInnScene extends Phaser.Scene {
  constructor({ getWorldState, onInteract, onLocalMove, isMoveLocked, onSpeakTTS, canSpeak } = {}) {
    super('TongfuInnScene');
    this.getWorldState = getWorldState;
    this.onInteract = onInteract;
    this.onLocalMove = onLocalMove;
    this.isMoveLocked = isMoveLocked || (() => false);
    this.onSpeakTTS = onSpeakTTS;
    // 遵循配置：无 speaker 的实体气泡不渲染 TTS 图标。默认关闭，未接线时不误显。
    this.canSpeak = canSpeak || (() => false);
    this.entitySprites = new Map();
    this.entityLabels = new Map();
    // slug → { container, text }：常驻漫画气泡，随实体位置移动，下次发言才替换内容。
    this.entityBubbles = new Map();
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
    const worldState = this.getWorldState?.();
    // 受控实体 = 会话级 player_actor_id（注册表 slug；缺省时用 "player" 作 slug fallback）。
    const pid = worldState?.player_actor_id || 'player';
    const player = worldState?.entities?.[pid];
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
    // 清理已从世界移除的实体（精灵 / 名字标签 / 气泡），避免残留与内存泄漏。
    const present = new Set(Object.keys(worldState.entities));
    Array.from(this.entitySprites.keys()).forEach((id) => {
      if (present.has(id)) return;
      this.entitySprites.get(id)?.destroy();
      this.entitySprites.delete(id);
      this.entityLabels.get(id)?.destroy();
      this.entityLabels.delete(id);
      const bubble = this.entityBubbles.get(id);
      if (bubble) {
        bubble.container.destroy();
        this.entityBubbles.delete(id);
      }
    });
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
    // 气泡随实体移动：常驻到该实体下次发言才由 applyDialogueLines 替换内容。
    const bubble = this.entityBubbles.get(entity.id);
    bubble?.container.setPosition(x, y - BUBBLE_GAP);
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

  // 应用"每实体最近一句"：以本会话映射为权威。
  // 不在映射中的气泡一律清掉（切会话时空映射会清空全部）。
  applyDialogueLines(mapSlugToText) {
    const map = mapSlugToText || {};
    const keep = new Set(
      Object.entries(map).flatMap(([slug, text]) => (text ? [slug] : [])),
    );
    Array.from(this.entityBubbles.keys()).forEach((slug) => {
      if (keep.has(slug)) return;
      this.entityBubbles.get(slug)?.container.destroy();
      this.entityBubbles.delete(slug);
    });
    const entities = this.getWorldState?.()?.entities || {};
    keep.forEach((slug) => {
      const entity = entities[slug];
      if (!entity) return;
      this.upsertBubble(slug, map[slug], entity);
    });
  }

  upsertBubble(slug, text, entity) {
    const { x, y } = worldToPixel(entity.position);
    const anchorY = y - BUBBLE_GAP;
    const existing = this.entityBubbles.get(slug);
    if (existing) {
      if (existing.text === text) {
        existing.container.setPosition(x, anchorY);
        return;
      }
      existing.container.destroy();
      this.entityBubbles.delete(slug);
    }
    const bubble = this.createBubble(slug, text, x, anchorY);
    this.entityBubbles.set(slug, bubble);
  }

  // 高对比圆角气泡；过长台词截断以保证可读。有 speaker 时右下角显示 TTS 按钮。
  createBubble(slug, text, x, y) {
    const speakable = this.canSpeak(slug);
    const displayText = text.length > BUBBLE_MAX_CHARS
      ? `${text.slice(0, BUBBLE_MAX_CHARS - 1)}…`
      : text;
    const textObj = this.add.text(0, 0, displayText, {
      fontSize: BUBBLE_FONT_SIZE,
      color: '#1c140c',
      fontFamily: '"Noto Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif',
      fontStyle: '500',
      wordWrap: { width: BUBBLE_MAX_WIDTH },
      lineSpacing: 4,
      align: 'left',
    });
    textObj.setOrigin(0, 0);

    const contentWidth = Math.min(Math.max(textObj.width, 36), BUBBLE_MAX_WIDTH);
    const boxWidth = contentWidth + BUBBLE_PADDING_X * 2;
    const boxHeight = textObj.height + BUBBLE_PADDING_Y * 2 + (speakable ? BUBBLE_ICON_SIZE + 4 : 0);

    const bg = this.add.graphics();
    bg.fillStyle(0xfff8e8, 0.96);
    bg.lineStyle(1.5, 0x5c4018, 0.85);
    bg.fillRoundedRect(-boxWidth / 2, -boxHeight, boxWidth, boxHeight, 8);
    bg.strokeRoundedRect(-boxWidth / 2, -boxHeight, boxWidth, boxHeight, 8);
    bg.fillStyle(0xfff8e8, 0.96);
    bg.fillTriangle(-6, -1, 6, -1, 0, 8);
    bg.lineStyle(1.5, 0x5c4018, 0.85);
    bg.beginPath();
    bg.moveTo(-6, -1);
    bg.lineTo(0, 8);
    bg.lineTo(6, -1);
    bg.strokePath();

    textObj.setPosition(-boxWidth / 2 + BUBBLE_PADDING_X, -boxHeight + BUBBLE_PADDING_Y);

    const children = [bg, textObj];
    if (speakable) {
      const ttsHit = this.add.rectangle(
        boxWidth / 2 - BUBBLE_PADDING_X - BUBBLE_ICON_SIZE / 2,
        -BUBBLE_PADDING_Y - BUBBLE_ICON_SIZE / 2,
        BUBBLE_ICON_SIZE + 4,
        BUBBLE_ICON_SIZE + 4,
        0x5c4018,
        0.12,
      );
      ttsHit.setStrokeStyle(1, 0x5c4018, 0.35);
      ttsHit.setInteractive({ useHandCursor: true });
      const ttsIcon = this.add.text(
        boxWidth / 2 - BUBBLE_PADDING_X - BUBBLE_ICON_SIZE,
        -BUBBLE_PADDING_Y - BUBBLE_ICON_SIZE,
        '▶',
        { fontSize: '11px', color: '#5c4018', fontStyle: 'bold' },
      );
      ttsIcon.setOrigin(0, 0);
      ttsHit.on('pointerdown', (pointer, localX, localY, event) => {
        event?.stopPropagation?.();
        this.onSpeakTTS?.(slug, text);
      });
      children.push(ttsHit, ttsIcon);
    }

    const container = this.add.container(x, y, children);
    container.setDepth(BUBBLE_DEPTH);
    return { container, text };
  }
}
