/**
 * Phaser 4 实现的 StageRuntime（Phase 2 VS1 Spec §PhaserRuntime）。
 *
 * 设计要点：
 *  - **动态 import('phaser')**：避免在模块顶部拉 Phaser 大体积依赖。
 *  - **零上游 Phaser 依赖**：仅本文件 import Phaser，符合 §Phase 2 §多 Agent
 *    编排 §VS1 文件级独占。
 *  - **场景单一**：本类内部用单一 main scene（`StageScene`）。多 scene
 *    / camera director 由 Phase 2 VS7 实现。
 *  - **patch 应用**：内部维护 `Map<entityId, Phaser.GameObjects.Container>`，
 *    enter / mutate / leave 直接走 Phaser API，禁止 `scene.children.removeAll()`。
 *  - **cue 显示**：内部 DOM `<div>` overlay（不走 Phaser Text），跟 §VS3
 *    一致，便于 CSS 主题切换 + a11y 控制。
 *
 * 使用方式（GameShell）：
 * ```ts
 * const runtime = new PhaserRuntime({ container: div });
 * await runtime.boot();
 * await runtime.loadScene('tongfu_inn', { manifestUrl: '/assets/manifest.json' });
 * runtime.applyWorldPatch(patch);
 * runtime.playCue(cue);
 * ```
 */

import type Phaser from 'phaser';

import {
  AssetLoader,
  brandPlaceholderFor,
  emptyManifest,
  makeFrameKey,
  MissingAssetError,
  parseAtlasJson,
  resolveCharacterSlug,
  resolveMapBackground,
  type Animation as AtlasAnimation,
  type AssetManifest,
  type AtlasFrameMeta,
  type Direction as AtlasDirection,
  type MissingAssetError as MissingAssetErrorT,
  type TiledMapJson,
} from '@shared/stage/assets';
import { DEFAULT_TILE_SIZE } from '@shared/stage/assets/mapsCatalog';
import { parseLightingJson } from '@shared/stage/lighting';
import {
  computeIntegerScale,
  DEFAULT_DESIGN_SIZE,
  type LogicalSize,
  type ScaleMode,
  type ScaleResult,
} from '@shared/stage/scale';
import {
  createStageCue,
  latestCuesByActor,
  pruneExpired,
  projectCueAnchor,
  type ScreenPoint,
  type SpeechCue,
  type ViewportSize,
} from '@shared/stage/speech';
import { diffWorldPatch, type EntityPatch, type WorldDiffPatch } from '@shared/stage/world';
import type { WorldEntity, WorldState } from '@shared/api';

import { BaseStageRuntime } from './StageRuntime';
import type {
  RuntimeEvent,
  RuntimeSnapshot,
  StageRuntime,
  StageRuntimeOptions,
} from './StageRuntime';
import type { StageSystems } from './StageSystems';
import { createStageSystems } from './StageSystems';
import type { CameraDirector } from '@shared/stage/camera';

const TILE_PX = DEFAULT_TILE_SIZE.w;
/** 每格行走补间时长（ms）；略短于键重复，连走时会持续重定向 tween。 */
const WALK_MS_PER_TILE = 140;
/** walk 帧切换间隔（ms）。 */
const WALK_FRAME_MS = 80;

type StageSprite = Phaser.GameObjects.Image | Phaser.GameObjects.Rectangle;

type SpriteWalkState = {
  direction: AtlasDirection;
  frameIndex: number;
};

/**
 * Phaser 运行时内部状态（私有）。
 */
type PhaserInternals = {
  container: HTMLElement;
  canvasEl: HTMLCanvasElement | null;
  game: Phaser.Game | null;
  sprites: Map<string, StageSprite>;
  lastApplied: Map<string, { x: number; y: number; direction: string | undefined }>;
  /** 行走帧状态（仅 atlas Image）。 */
  walkById: Map<string, SpriteWalkState>;
  currentState: WorldState | null;
  scale: ScaleResult;
  cues: SpeechCue[];
  /** 每 actor 一个气泡 DOM（常驻最新一句）。 */
  cueEls: Map<string, HTMLDivElement>;
  systems: StageSystems | null;
  lastTickAt: number;
  /** Tiled imagelayer 整图背景（reload 时销毁重建）。 */
  background: Phaser.GameObjects.Image | null;
  /** 已解析并注册到 Phaser textures 的角色 atlas meta。 */
  atlasMetaBySlug: Map<string, AtlasFrameMeta>;
  /** spawn 世代号：异步 atlas 加载完成前若 despawn/respawn，丢弃过期结果。 */
  spawnEpochById: Map<string, number>;
};

/**
 * Phase 2 VS1 唯一官方实现：Phaser 4 StageRuntime。
 */
export class PhaserRuntime extends BaseStageRuntime implements StageRuntime {
  readonly #opts: {
    container: HTMLElement;
    design: LogicalSize;
    scaleMode: ScaleMode;
    onMissing: 'GATE' | 'THROW';
    concurrency: number;
    timeoutMs: number;
  };
  #manifestUrl: string | undefined;
  readonly #loader: AssetLoader;
  readonly #internals: PhaserInternals;
  #bootPromise: Promise<void> | null = null;
  #destroyPromise: Promise<void> | null = null;
  #resizeObserver: ResizeObserver | null = null;
  #rafHandle: number | null = null;

  constructor(options: StageRuntimeOptions) {
    super(options.viewport ?? readViewport(options.container));
    const viewport = options.viewport ?? readViewport(options.container);
    this.#opts = {
      container: options.container,
      design: options.design ?? DEFAULT_DESIGN_SIZE,
      scaleMode: options.scaleMode ?? 'INTEGER_FIT',
      onMissing: options.onMissing ?? 'GATE',
      concurrency: options.concurrency ?? 4,
      timeoutMs: options.timeoutMs ?? 8000,
    };
    if (options.manifestUrl !== undefined) this.#manifestUrl = options.manifestUrl;
    this.#loader = new AssetLoader({
      baseUrl: deriveBaseUrl(this.#manifestUrl),
      onMissing: this.#opts.onMissing,
      concurrency: this.#opts.concurrency,
      timeoutMs: this.#opts.timeoutMs,
    });
    this.#internals = {
      container: options.container,
      canvasEl: null,
      game: null,
      sprites: new Map(),
      lastApplied: new Map(),
      walkById: new Map(),
      currentState: null,
      scale: computeIntegerScale(viewport, this.#opts.design, this.#opts.scaleMode),
      cues: [],
      cueEls: new Map(),
      systems: null,
      lastTickAt: 0,
      background: null,
      atlasMetaBySlug: new Map(),
      spawnEpochById: new Map(),
    };
    this.#snapshotViewport(viewport);
  }

  /** Phase 2 FX 编排器（boot 后可用）。 */
  getStageSystems(): StageSystems | null {
    return this.#internals.systems;
  }

  /** CameraDirector 句柄（GameShell / StageViewport imperative API）。 */
  getDirector(): CameraDirector | null {
    return this.#internals.systems?.camera ?? null;
  }

  /**
   * 推近说话者：从当前 world 取 entity 位置后入队 focus。
   * 无实体 / 无坐标时 no-op。
   */
  focusActor(entityId: string): void {
    const systems = this.#internals.systems;
    if (!systems) return;
    const entity = this.#internals.currentState?.entities[entityId];
    if (!entity?.position) return;
    systems.focusActor(entityId, {
      x: entity.position.x,
      y: entity.position.y,
    });
  }

  override async boot(): Promise<void> {
    if (this.destroyed) return;
    if (this.#bootPromise) return this.#bootPromise;
    this.setStatus('booting');
    this.#bootPromise = this.#doBoot();
    return this.#bootPromise;
  }

  async #doBoot(): Promise<void> {
    const phaserNS = await importPhaser();
    if (this.destroyed) return;
    const viewport = readViewport(this.#internals.container);
    // 整图模式：Phaser 分辨率 = 容器像素，CSS 1:1，避免非等比拉伸变形
    const gameW = Math.max(1, Math.floor(viewport.width));
    const gameH = Math.max(1, Math.floor(viewport.height));
    this.#internals.scale = computeIntegerScale(viewport, this.#opts.design, this.#opts.scaleMode);

    const canvas = document.createElement('canvas');
    canvas.dataset.stageOwner = 'phaser-runtime';
    canvas.style.display = 'block';
    // 整数 zoom + NEAREST：避免浏览器再给 canvas 做一次平滑缩放
    canvas.style.imageRendering = 'pixelated';
    canvas.width = gameW;
    canvas.height = gameH;
    canvas.style.width = `${gameW}px`;
    canvas.style.height = `${gameH}px`;
    if (this.destroyed) return;
    this.#internals.container.appendChild(canvas);
    this.#internals.canvasEl = canvas;

    // 唯一 WebGL 路径：强制 WEBGL（Light2D / PostFX Filters）；失败则门闸，禁止 CSS 降级
    const config: Phaser.Types.Core.GameConfig = {
      type: phaserNS.WEBGL,
      canvas,
      width: gameW,
      height: gameH,
      backgroundColor: '#1a0e0a',
      scale: {
        mode: phaserNS.Scale.NONE,
        width: gameW,
        height: gameH,
      },
      render: {
        // 整数世界 zoom 下用 nearest，地图/角色边缘不糊、白边不易被线性滤波放大
        pixelArt: true,
        antialias: false,
        roundPixels: true,
      },
      scene: [],
      fps: {
        target: 60,
        smoothStep: true,
      },
      disableContextMenu: true,
    };

    let game: Phaser.Game;
    try {
      game = new phaserNS.Game(config);
    } catch (err) {
      this.#setError({
        kind: 'INTERNAL',
        message: err instanceof Error ? err.message : 'WebGL Game bootstrap failed',
        cause: err,
      });
      this.setStatus('gate');
      throw err;
    }
    if (this.destroyed) {
      try {
        game.destroy(true);
      } catch {
        /* ignore */
      }
      return;
    }
    this.#internals.game = game;

    if (!isWebGLRenderer(game.renderer)) {
      const message = 'Phaser WebGL renderer required for Light2D/PostFX (no CSS fallback)';
      this.#setError({ kind: 'INTERNAL', message });
      this.setStatus('gate');
      throw new Error(message);
    }

    const systems = createStageSystems({
      container: this.#internals.container,
      design: this.#opts.design,
    });
    systems.bindRuntime(this);
    this.#internals.systems = systems;
    this.#internals.lastTickAt = performance.now();

    const StageScene = createStageSceneClass(phaserNS, this.#internals, (error) => {
      this.#setError({
        kind: 'INTERNAL',
        message: error.message,
        cause: error,
      });
      this.setStatus('gate');
    });
    game.scene.add('stage', StageScene, true);

    this.#loader.subscribe((state) => {
      this.#snapshotAssets(
        state.status,
        state.manifest,
        state.loadedCount,
        state.totalCount,
        state.missing,
      );
      switch (state.status) {
        case 'loading':
          this.emit('asset-loading', { loaded: state.loadedCount, total: state.totalCount });
          break;
        case 'ready':
          if (state.manifest) this.emit('asset-ready', { manifest: state.manifest });
          break;
        case 'gate':
          this.emit('asset-gate', { missing: state.missing });
          break;
        case 'failed':
          this.emit('asset-failed', { missing: state.missing });
          break;
        default:
          break;
      }
    });

    if (this.#manifestUrl) {
      try {
        const result = await this.#loader.load(this.#manifestUrl);
        if (this.destroyed) return;
        if (result.status === 'failed') {
          this.#setError({ kind: 'ASSET', message: 'Asset load failed' });
        }
      } catch (err) {
        if (this.destroyed) return;
        if (err instanceof MissingAssetError) {
          this.#setError({ kind: 'ASSET', message: err.message, cause: err });
        } else {
          this.#setError({
            kind: 'ASSET',
            message: err instanceof Error ? err.message : String(err),
            cause: err,
          });
        }
      }
    }

    if (this.destroyed) return;

    this.#resizeObserver = new ResizeObserver(() =>
      this.resize(readViewport(this.#internals.container)),
    );
    this.#resizeObserver.observe(this.#internals.container);

    this.#rafHandle = requestAnimationFrame(() => this.#tickCue());

    this.emit('boot', { container: this.#internals.container });
    // 资产门闸优先：缺资时保持 gate，避免 boot 末尾把品牌化状态冲掉。
    const assetsStatus = this.snapshot.assets.status;
    if (assetsStatus === 'gate' || assetsStatus === 'failed') {
      this.setStatus('gate');
    } else {
      this.setStatus('ready');
    }
    this.emit('ready', { snapshot: this.getSnapshot() });
  }

  override async loadScene(
    sceneId: string,
    opts?: { readonly manifestUrl?: string },
  ): Promise<void> {
    await this.boot();
    if (this.destroyed) return;
    const url = opts?.manifestUrl ?? this.#manifestUrl;
    let manifestLoad: Awaited<ReturnType<AssetLoader['load']>> | null = null;
    if (url) {
      try {
        manifestLoad = await this.#loader.load(url);
        if (this.destroyed) return;
        if (manifestLoad.status === 'failed') {
          this.#setError({ kind: 'ASSET', message: 'Scene asset load failed' });
          this.setStatus('gate');
          return;
        }
        if (
          manifestLoad.status === 'gate' &&
          manifestMissingBlocksScene(sceneId, manifestLoad.missing)
        ) {
          this.setStatus('gate');
          return;
        }
      } catch (err) {
        if (this.destroyed) return;
        this.#setError({
          kind: 'ASSET',
          message: err instanceof Error ? err.message : String(err),
          cause: err,
        });
        this.setStatus('gate');
        return;
      }
    }
    if (this.destroyed) return;
    this.snapshot = Object.freeze({
      ...this.snapshot,
      scene: Object.freeze({
        mapId: sceneId,
        manifestVersion: this.snapshot.assets.manifest?.version ?? 1,
        entityIds: this.#internals.currentState
          ? Object.keys(this.#internals.currentState.entities)
          : [],
      }),
    });
    this.#internals.systems?.loadMap(sceneId);
    const bgOk = await this.#loadMapBackground(sceneId);
    if (this.destroyed) return;
    if (!bgOk) return;
    await this.#loadMapLighting(sceneId);
    if (this.destroyed) return;
    if (manifestLoad?.status === 'gate') {
      this.setStatus('gate');
      return;
    }
    this.setStatus('ready');
    if (this.#internals.currentState) {
      this.#internals.systems?.applyWorldEnvironment(this.#internals.currentState);
      // world 可能在 scene 就绪前就到了：此处按当前状态全量补精灵
      this.#resyncSpritesFromCurrentState();
      this.#internals.systems?.syncFollowFromWorld(this.#internals.currentState);
    }
  }

  override unloadScene(): Promise<void> {
    if (this.destroyed) return Promise.resolve();
    for (const sprite of this.#internals.sprites.values()) {
      try {
        sprite.destroy();
      } catch {
        // 忽略单个 destroy 错误
      }
    }
    this.#internals.sprites.clear();
    this.#internals.lastApplied.clear();
    this.#internals.walkById.clear();
    this.#internals.spawnEpochById.clear();
    this.#destroyBackground();
    this.#internals.currentState = null;
    this.snapshot = Object.freeze({ ...this.snapshot, scene: null });
    return Promise.resolve();
  }

  override applyWorldPatch(patch: WorldDiffPatch): void {
    super.applyWorldPatch(patch);
    const game = this.#internals.game;
    const scene = game?.scene.getScene('stage');
    if (!scene) return;

    for (const p of patch.added) void this.#spawnSprite(scene, p);
    for (const p of patch.changed) this.#updateSprite(scene, p);
    for (const p of patch.removed) this.#despawnSprite(scene, p);

    const prev = this.#internals.currentState;
    this.#internals.currentState = {
      mapId: patch.mapId,
      stateVersion: patch.stateVersion,
      entities: mergeEntitiesFromPatch(prev?.entities ?? {}, patch),
      ...(prev?.playerActorId ? { playerActorId: prev.playerActorId } : {}),
    };
    this.#internals.systems?.applyWorldEnvironment(this.#internals.currentState);
    this.#internals.systems?.syncFollowFromWorld(this.#internals.currentState);
  }

  /**
   * 同步完整 WorldState（含 playerActorId / entities），供点击交互查实体与相机跟随。
   * StageViewport 在 applyWorldPatch 之前调用；必须采用传入的 entities，
   * 否则扮演切换后 kind 翻转会被旧缓存盖掉。
   */
  syncWorldMeta(world: WorldState): void {
    if (this.destroyed) return;
    this.#internals.currentState = world;
    this.#internals.systems?.applyWorldEnvironment(this.#internals.currentState);
    this.#internals.systems?.syncFollowFromWorld(this.#internals.currentState);
  }

  /** 侧栏等遮挡时把跟随中心偏到可见区。 */
  setContentInset(
    inset: {
      readonly left?: number;
      readonly right?: number;
      readonly top?: number;
      readonly bottom?: number;
    } | null,
  ): void {
    if (this.destroyed) return;
    this.#internals.systems?.setContentInset(inset);
  }

  override playCue(cue: SpeechCue): void {
    super.playCue(cue);
    this.#internals.cues = [...this.snapshot.speech.queued];
  }

  override clearCue(actorId: string): void {
    super.clearCue(actorId);
    this.#internals.cues = [...this.snapshot.speech.queued];
  }

  override setSpeechCues(cues: readonly SpeechCue[]): void {
    super.setSpeechCues(cues);
    this.#internals.cues = [...cues];
  }

  override resize(viewport: ViewportSize): void {
    super.resize(viewport);
    this.#snapshotViewport(viewport);
    this.#internals.scale = computeIntegerScale(viewport, this.#opts.design, this.#opts.scaleMode);
    const gameW = Math.max(1, Math.floor(viewport.width));
    const gameH = Math.max(1, Math.floor(viewport.height));
    if (this.#internals.canvasEl) {
      this.#internals.canvasEl.width = gameW;
      this.#internals.canvasEl.height = gameH;
      this.#internals.canvasEl.style.width = `${gameW}px`;
      this.#internals.canvasEl.style.height = `${gameH}px`;
    }
    const game = this.#internals.game;
    const scaleManager = game?.scale;
    if (scaleManager) {
      scaleManager.setGameSize(gameW, gameH);
    }
    // lightMap 按设计分辨率烘焙，视口尺寸变化后需重烘
    this.#internals.systems?.invalidateLightingBake();
    this.emit('viewport-resized', {
      viewport,
      scale: this.#internals.scale.scale,
    });
  }

  override async destroy(): Promise<void> {
    if (this.#destroyPromise) return this.#destroyPromise;
    this.destroyed = true;
    this.#destroyPromise = this.#doDestroy();
    return this.#destroyPromise;
  }

  async #doDestroy(): Promise<void> {
    this.#loader.abort();
    // StrictMode：effect cleanup 可能在 boot 的 await 间隙触发；
    // 必须等 boot 落定后再清 DOM，否则晚到的 appendChild 会留下黑屏僵尸 canvas。
    if (this.#bootPromise) {
      try {
        await this.#bootPromise;
      } catch {
        /* boot 失败也继续清理 */
      }
    }
    if (this.#resizeObserver) {
      this.#resizeObserver.disconnect();
      this.#resizeObserver = null;
    }
    if (this.#rafHandle !== null) {
      cancelAnimationFrame(this.#rafHandle);
      this.#rafHandle = null;
    }
    if (this.#internals.systems) {
      this.#internals.systems.destroy();
      this.#internals.systems = null;
    }
    this.#destroyBackground();
    this.#internals.atlasMetaBySlug.clear();
    this.#internals.walkById.clear();
    this.#internals.spawnEpochById.clear();
    if (this.#internals.cueEls.size > 0) {
      for (const el of this.#internals.cueEls.values()) {
        el.parentElement?.removeChild(el);
      }
      this.#internals.cueEls.clear();
    }
    // 只拆本实例节点。禁止 querySelectorAll 清容器：StrictMode 下旧 destroy
    // 与新 boot 共用同一 container，扫荡会误删新 runtime 的 canvas → 间歇白屏。
    const ownedCanvas = this.#internals.canvasEl;
    this.#internals.canvasEl = null;
    if (ownedCanvas?.parentElement) {
      ownedCanvas.parentElement.removeChild(ownedCanvas);
    }
    if (this.#internals.game) {
      try {
        this.#internals.game.destroy(true);
      } catch {
        // 忽略
      }
      this.#internals.game = null;
    }
    await super.destroy();
    this.emit('destroyed', { ok: true });
  }

  /** 暴露 diffWorldPatch 工厂（同 world/diffRenderer）。 */
  diff(prev: WorldState | null, next: WorldState): WorldDiffPatch {
    return diffWorldPatch(prev, next);
  }

  /** 暴露 cue 工厂。 */
  cue(args: {
    readonly actor: WorldEntity;
    readonly actorName: string;
    readonly text: string;
    readonly now: number;
    readonly durationMs?: number;
  }): SpeechCue {
    return createStageCue(args);
  }

  /** 品牌化门闸占位文案。 */
  brandGate(key: string): string {
    return brandPlaceholderFor(key).cue;
  }

  /** 静态 fallback：返回支持的 manifest 版本号。 */
  static emptyManifestVersion(): number {
    return emptyManifest().version;
  }

  // ───── private ─────

  #snapshotViewport(viewport: ViewportSize): void {
    this.snapshot = Object.freeze({ ...this.snapshot, viewport });
  }

  #snapshotAssets(
    status: RuntimeSnapshot['assets']['status'],
    manifest: AssetManifest | null,
    loadedCount: number,
    totalCount: number,
    missing: readonly MissingAssetErrorT[],
  ): void {
    const nextAssets: RuntimeSnapshot['assets'] = Object.freeze({
      status,
      manifest,
      loadedCount,
      totalCount,
      missing: missing.slice(),
    });
    const nextStatus: RuntimeSnapshot['status'] =
      status === 'gate'
        ? 'gate'
        : this.snapshot.status === 'booting'
          ? 'loading'
          : this.snapshot.status;
    this.snapshot = Object.freeze({ ...this.snapshot, assets: nextAssets, status: nextStatus });
  }

  #setError(err: RuntimeSnapshot['lastError']): void {
    if (!err) return;
    this.snapshot = Object.freeze({ ...this.snapshot, lastError: err });
    this.emit('error', { message: err.message, kind: err.kind, cause: err.cause });
  }

  #destroyBackground(): void {
    const bg = this.#internals.background;
    if (!bg) return;
    try {
      bg.destroy();
    } catch {
      // ignore
    }
    this.#internals.background = null;
  }

  /**
   * 从 manifest → map.json → imagelayer 加载整图背景。
   * 缺 map / 缺 imagelayer / 图加载失败 → 门闸；不造 CSS 假地图。
   * @returns 是否成功挂上背景
   */
  async #loadMapBackground(sceneId: string): Promise<boolean> {
    const game = this.#internals.game;
    const scene = game?.scene.getScene('stage');
    if (!scene) {
      this.#setError({
        kind: 'INTERNAL',
        message: 'Stage scene not ready for map background',
      });
      this.setStatus('gate');
      return false;
    }

    this.#destroyBackground();

    const manifest = this.#loader.snapshot().manifest ?? this.snapshot.assets.manifest;
    const mapEntry = manifest?.maps[sceneId];
    if (!mapEntry?.json) {
      this.#setError({
        kind: 'ASSET',
        message: `Map not in manifest: ${sceneId}`,
      });
      this.setStatus('gate');
      return false;
    }

    let mapJson: TiledMapJson;
    try {
      const res = await fetch(mapEntry.json, { cache: 'no-store' });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status} for ${mapEntry.json}`);
      }
      mapJson = (await res.json()) as TiledMapJson;
    } catch (err) {
      this.#setError({
        kind: 'ASSET',
        message: `Failed to fetch map.json for ${sceneId}`,
        cause: err,
      });
      this.setStatus('gate');
      return false;
    }

    const spec = resolveMapBackground(mapJson, mapEntry.json, sceneId);
    if (!spec) {
      this.#setError({
        kind: 'ASSET',
        message: `No imagelayer background in map: ${sceneId}`,
      });
      this.setStatus('gate');
      return false;
    }

    const loaded = await ensurePhaserTexture(scene, spec.textureKey, spec.imageUrl);
    if (!loaded || this.destroyed) {
      if (!this.destroyed) {
        this.#setError({
          kind: 'ASSET',
          message: `Failed to load map background: ${spec.imageUrl}`,
        });
        this.setStatus('gate');
      }
      return false;
    }

    const frame = scene.textures.getFrame(spec.textureKey);
    if (!frame || frame.width <= 0 || frame.height <= 0) {
      this.#setError({
        kind: 'ASSET',
        message: `Map background texture invalid: ${spec.imageUrl}`,
      });
      this.setStatus('gate');
      return false;
    }

    const image = scene.add.image(0, 0, spec.textureKey).setOrigin(0, 0).setDepth(-100);
    this.#internals.background = image;
    scene.cameras.main.setBounds(0, 0, spec.boundsWidth, spec.boundsHeight);
    this.#internals.systems?.setMapBounds(spec.boundsWidth, spec.boundsHeight);
    return true;
  }

  /**
   * 用 currentState 全量重建/补齐精灵（解决 world 早于 loadScene 就绪导致的丢补丁）。
   */
  #resyncSpritesFromCurrentState(): void {
    const state = this.#internals.currentState;
    if (!state?.entities) return;
    const asWorld: WorldState = {
      mapId: state.mapId,
      stateVersion: state.stateVersion,
      entities: state.entities,
      ...(state.playerActorId ? { playerActorId: state.playerActorId } : {}),
    };
    const patch = diffWorldPatch(null, asWorld);
    this.applyWorldPatch(patch);
  }

  /**
   * 加载 lighting.json 覆盖 catalog 兜底灯光。失败时保留 catalog，不门闸。
   */
  async #loadMapLighting(sceneId: string): Promise<void> {
    const systems = this.#internals.systems;
    if (!systems) return;
    const manifest = this.#loader.snapshot().manifest ?? this.snapshot.assets.manifest;
    const url = manifest?.maps[sceneId]?.lighting;
    if (!url) return;
    try {
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) return;
      const data: unknown = await res.json();
      const spec = parseLightingJson(data);
      if (!spec) return;
      systems.applyLightingLayer(sceneId, spec);
    } catch {
      // catalog 兜底已注入；lighting.json 失败不阻断场景
    }
  }

  async #ensureCharacterAtlas(scene: Phaser.Scene, slug: string): Promise<AtlasFrameMeta | null> {
    const textureKey = characterAtlasTextureKey(slug);
    const cached = this.#internals.atlasMetaBySlug.get(slug);
    if (cached && scene.textures.exists(textureKey)) return cached;

    const manifest = this.#loader.snapshot().manifest ?? this.snapshot.assets.manifest;
    const entry = manifest?.characters[slug];
    if (!entry?.atlas || !entry.meta) return null;

    let meta: AtlasFrameMeta | null = null;
    try {
      const res = await fetch(entry.meta, { cache: 'no-store' });
      if (!res.ok) return null;
      meta = parseAtlasJson(await res.json(), entry.atlas);
    } catch {
      return null;
    }
    if (!meta) return null;

    const loaded = await ensurePhaserTexture(scene, textureKey, entry.atlas, { defringe: true });
    if (!loaded) return null;

    const tex = scene.textures.get(textureKey);
    for (const [frameKey, frame] of Object.entries(meta.frames)) {
      if (!tex.has(frameKey)) {
        tex.add(frameKey, 0, frame.x, frame.y, frame.w, frame.h);
      }
    }
    this.#internals.atlasMetaBySlug.set(slug, meta);
    return meta;
  }

  async #spawnSprite(scene: Phaser.Scene, p: EntityPatch): Promise<void> {
    if (!p.entity) return;
    const id = p.entityId;
    if (this.#internals.sprites.has(id)) {
      this.#updateSprite(scene, p);
      return;
    }

    const epoch = (this.#internals.spawnEpochById.get(id) ?? 0) + 1;
    this.#internals.spawnEpochById.set(id, epoch);

    const manifest = this.#loader.snapshot().manifest ?? this.snapshot.assets.manifest;
    const slug = manifest ? resolveCharacterSlug(manifest, p.entity.assetKey ?? p.entity.id) : null;

    if (slug) {
      const meta = await this.#ensureCharacterAtlas(scene, slug);
      if (this.destroyed || this.#internals.spawnEpochById.get(id) !== epoch) return;
      if (this.#internals.sprites.has(id)) {
        this.#updateSprite(scene, p);
        return;
      }
      if (meta) {
        this.#createAtlasSprite(scene, p, slug, meta);
        return;
      }
    }

    if (this.destroyed || this.#internals.spawnEpochById.get(id) !== epoch) return;
    if (this.#internals.sprites.has(id)) return;
    this.#createRectSprite(scene, p);
  }

  #createAtlasSprite(
    scene: Phaser.Scene,
    p: EntityPatch,
    slug: string,
    meta: AtlasFrameMeta,
  ): void {
    if (!p.entity) return;
    const id = p.entityId;
    const entity = this.#internals.currentState?.entities[id] ?? p.entity;
    const px = (entity.position?.x ?? 0) * TILE_PX;
    const py = (entity.position?.y ?? 0) * TILE_PX;
    const direction = toAtlasDirection(entity.direction);
    const frameKey = animFrameKey(meta, direction, 'idle', 0);
    const textureKey = characterAtlasTextureKey(slug);

    const image = scene.add.image(px, py, textureKey, frameKey);
    image.setName(id);
    image.setData('entityId', id);
    image.setData('characterSlug', slug);
    image.setOrigin(0.5, 1);
    image.setDepth(py);

    this.#syncSpriteInteractive(image, id, entity);

    this.#internals.sprites.set(id, image);
    this.#internals.walkById.set(id, { direction, frameIndex: 0 });
    this.#internals.lastApplied.set(id, {
      x: px,
      y: py,
      direction: entity.direction ?? undefined,
    });
  }

  #createRectSprite(scene: Phaser.Scene, p: EntityPatch): void {
    if (!p.entity) return;
    const id = p.entityId;
    const px = (p.entity.position?.x ?? 0) * TILE_PX;
    const py = (p.entity.position?.y ?? 0) * TILE_PX;
    const rect = scene.add.rectangle(px, py, 32, 48, rectColorForKind(p.entity.kind));
    rect.setName(id);
    rect.setData('entityId', id);
    rect.setOrigin(0.5, 1);
    rect.setDepth(py);
    this.#syncSpriteInteractive(rect, id, p.entity);
    this.#internals.sprites.set(id, rect);
    this.#internals.lastApplied.set(id, {
      x: px,
      y: py,
      direction: p.entity.direction ?? undefined,
    });
  }

  /**
   * 按 entity.kind / interactable 启停点击。
   * 扮演切换会把旧玩家翻成 NPC：必须在 mutate 路径同步，否则要整页刷新才可点。
   */
  #syncSpriteInteractive(sprite: StageSprite, entityId: string, entity: WorldEntity): void {
    const want = Boolean(entity.interactable) || entity.kind === 'npc';
    const bound = Boolean(sprite.getData('interactBound'));
    if (want) {
      if (!bound) {
        sprite.setInteractive({ useHandCursor: true });
        sprite.on('pointerdown', () => {
          this.emit('entity-interact', { entityId });
        });
        sprite.setData('interactBound', true);
      } else if (sprite.input && !sprite.input.enabled) {
        sprite.setInteractive({ useHandCursor: true });
      }
      return;
    }
    if (sprite.input?.enabled) {
      sprite.disableInteractive();
    }
  }

  /**
   * 位移 → walk 补间 + 切帧；仅朝向变化 → idle 站姿。
   */
  #updateSprite(scene: Phaser.Scene, p: EntityPatch): void {
    if (!p.entity) return;
    const id = p.entityId;
    const sprite = this.#internals.sprites.get(id);
    if (!sprite) return;
    const lastApplied = this.#internals.lastApplied.get(id);
    const px = (p.entity.position?.x ?? 0) * TILE_PX;
    const py = (p.entity.position?.y ?? 0) * TILE_PX;
    const moved = !lastApplied || lastApplied.x !== px || lastApplied.y !== py;
    const nextDirection = p.entity.direction ?? undefined;
    const dir = toAtlasDirection(nextDirection);

    if (isPhaserImage(sprite)) {
      const slug = sprite.getData('characterSlug') as string | undefined;
      const meta = slug ? this.#internals.atlasMetaBySlug.get(slug) : undefined;
      if (meta && moved) {
        this.#tweenWalk(scene, sprite, id, meta, dir, px, py);
      } else if (meta) {
        this.#stopWalkTween(scene, sprite);
        sprite.setFrame(animFrameKey(meta, dir, 'idle', 0));
        this.#internals.walkById.set(id, { direction: dir, frameIndex: 0 });
        sprite.setDepth(py);
      }
    } else {
      this.#stopWalkTween(scene, sprite);
      if (moved) {
        sprite.x = px;
        sprite.y = py;
      }
      if (typeof sprite.setFillStyle === 'function') {
        sprite.setFillStyle(rectColorForKind(p.entity.kind));
      }
      sprite.setDepth(py);
    }

    this.#syncSpriteInteractive(sprite, id, p.entity);

    this.#internals.lastApplied.set(id, {
      x: px,
      y: py,
      direction: nextDirection,
    });
  }

  #tweenWalk(
    scene: Phaser.Scene,
    sprite: Phaser.GameObjects.Image,
    entityId: string,
    meta: AtlasFrameMeta,
    direction: AtlasDirection,
    toX: number,
    toY: number,
  ): void {
    this.#stopWalkTween(scene, sprite);

    const fromX = sprite.x;
    const fromY = sprite.y;
    const dist = Math.hypot(toX - fromX, toY - fromY);
    const duration = Math.max(60, (dist / TILE_PX) * WALK_MS_PER_TILE);
    const walkFrames = countAnimFrames(meta, direction, 'walk');
    const useWalk = walkFrames > 0;
    const frameCount = useWalk ? walkFrames : Math.max(1, countAnimFrames(meta, direction, 'idle'));
    const anim: AtlasAnimation = useWalk ? 'walk' : 'idle';

    const walk: SpriteWalkState = {
      direction,
      frameIndex: this.#internals.walkById.get(entityId)?.frameIndex ?? 0,
    };
    this.#internals.walkById.set(entityId, walk);
    sprite.setFrame(animFrameKey(meta, direction, anim, walk.frameIndex % frameCount));

    const tweens = scene.tweens;
    if (!tweens || typeof tweens.add !== 'function') {
      sprite.x = toX;
      sprite.y = toY;
      sprite.setDepth(toY);
      sprite.setFrame(animFrameKey(meta, direction, 'idle', 0));
      walk.frameIndex = 0;
      return;
    }

    const startedAt = performance.now();
    tweens.add({
      targets: sprite,
      x: toX,
      y: toY,
      duration,
      ease: 'Linear',
      onUpdate: () => {
        if (this.destroyed) return;
        const idx = Math.floor((performance.now() - startedAt) / WALK_FRAME_MS) % frameCount;
        if (idx !== walk.frameIndex || walk.direction !== direction) {
          walk.frameIndex = idx;
          walk.direction = direction;
          sprite.setFrame(animFrameKey(meta, direction, anim, idx));
        }
        sprite.setDepth(sprite.y);
      },
      onComplete: () => {
        if (this.destroyed) return;
        // 若中途又开了新 tween，本回调可能仍触发；仅在已到目标附近时回 idle
        if (Math.hypot(sprite.x - toX, sprite.y - toY) > 1) return;
        walk.frameIndex = 0;
        sprite.setFrame(animFrameKey(meta, direction, 'idle', 0));
        sprite.setDepth(toY);
      },
    });
  }

  #stopWalkTween(scene: Phaser.Scene, sprite: StageSprite): void {
    const tweens = scene.tweens;
    if (tweens && typeof tweens.killTweensOf === 'function') {
      tweens.killTweensOf(sprite);
    }
  }

  #despawnSprite(scene: Phaser.Scene, p: EntityPatch): void {
    const id = p.entityId;
    const epoch = (this.#internals.spawnEpochById.get(id) ?? 0) + 1;
    this.#internals.spawnEpochById.set(id, epoch);
    const sprite = this.#internals.sprites.get(id);
    if (!sprite) return;
    this.#stopWalkTween(scene, sprite);
    sprite.destroy();
    this.#internals.sprites.delete(id);
    this.#internals.lastApplied.delete(id);
    this.#internals.walkById.delete(id);
  }

  #tickCue(): void {
    if (this.destroyed) return;
    const now = performance.now();
    const last = this.#internals.lastTickAt || now;
    const deltaMs = Math.min(64, Math.max(0, now - last));
    this.#internals.lastTickAt = now;

    const systems = this.#internals.systems;
    const game = this.#internals.game;
    const scene = game?.scene.getScene('stage') ?? null;
    systems?.tick(deltaMs, now, scene);

    const pruned = pruneExpired(this.#internals.cues, now);
    if (pruned.length !== this.#internals.cues.length) {
      this.#internals.cues = [...pruned];
    }
    const active = latestCuesByActor(this.#internals.cues, now);
    this.#renderCueOverlays(active);
    this.#rafHandle = requestAnimationFrame(() => this.#tickCue());
  }

  #ensureCueEl(actorId: string): HTMLDivElement {
    const existing = this.#internals.cueEls.get(actorId);
    if (existing) return existing;
    const el = document.createElement('div');
    el.dataset.stageCue = actorId;
    el.style.position = 'absolute';
    el.style.pointerEvents = 'none';
    el.style.padding = '4px 10px';
    el.style.borderRadius = '6px';
    el.style.background = 'rgba(0,0,0,0.72)';
    el.style.color = '#f4e4c1';
    el.style.fontFamily = 'var(--font-narrative, serif)';
    el.style.fontSize = '14px';
    el.style.whiteSpace = 'nowrap';
    el.style.transform = 'translateX(-50%)';
    el.style.transition = 'opacity 200ms, left 80ms, top 80ms';
    el.style.zIndex = '6';
    el.style.opacity = '0';
    this.#internals.container.appendChild(el);
    this.#internals.cueEls.set(actorId, el);
    return el;
  }

  #renderCueOverlays(active: readonly SpeechCue[]): void {
    const alive = new Set(active.map((c) => c.actorId));
    for (const [actorId, el] of this.#internals.cueEls) {
      if (!alive.has(actorId)) {
        el.parentElement?.removeChild(el);
        this.#internals.cueEls.delete(actorId);
      }
    }

    const cssW = this.snapshot.viewport.width || 800;
    const cssH = this.snapshot.viewport.height || 600;
    const margin = 24;

    for (const cue of active) {
      const el = this.#ensureCueEl(cue.actorId);
      const anchor = this.#resolveCueAnchor(cue);
      // 完全在视口外则隐藏，避免多角色气泡堆在边缘
      const offscreen =
        anchor.x < -margin ||
        anchor.x > cssW + margin ||
        anchor.y < -margin ||
        anchor.y > cssH + margin;
      if (offscreen) {
        el.style.opacity = '0';
        continue;
      }
      const x = Math.min(cssW - 8, Math.max(8, anchor.x));
      const y = Math.min(cssH - 8, Math.max(8, anchor.y));
      el.style.left = `${x}px`;
      el.style.top = `${y}px`;
      el.style.opacity = '1';
      el.textContent = `${cue.actorName}：${cue.excerpt}`;
    }
  }

  #resolveCueAnchor(active: SpeechCue): ScreenPoint {
    const fallback: ScreenPoint = {
      x: this.snapshot.viewport.width / 2,
      y: 32,
    };
    const state = this.#internals.currentState;
    const entity: WorldEntity | null = state?.entities[active.actorId] ?? null;
    if (!entity) return fallback;

    const systems = this.#internals.systems;
    if (systems) {
      return systems.projectEntityCueAnchor(entity);
    }

    return projectCueAnchor(entity, {
      scrollX: 0,
      scrollY: 0,
      zoom: 1,
      cssWidth: this.snapshot.viewport.width,
      cssHeight: this.snapshot.viewport.height,
      viewW: this.snapshot.viewport.width,
      viewH: this.snapshot.viewport.height,
    });
  }
}

// ───────── helper functions ─────────

function readViewport(container: HTMLElement): ViewportSize {
  const rect = container.getBoundingClientRect();
  return {
    width: Math.max(1, Math.floor(rect.width || container.clientWidth || 800)),
    height: Math.max(1, Math.floor(rect.height || container.clientHeight || 600)),
  };
}

function deriveBaseUrl(manifestUrl: string | undefined): string {
  if (!manifestUrl) return '/assets';
  if (/^https?:\/\//i.test(manifestUrl)) return new URL(manifestUrl).origin;
  const lastSlash = manifestUrl.lastIndexOf('/');
  return lastSlash > 0 ? manifestUrl.slice(0, lastSlash) : '';
}

function mergeEntitiesFromPatch(
  prev: Record<string, WorldEntity>,
  patch: WorldDiffPatch,
): Record<string, WorldEntity> {
  const out: Record<string, WorldEntity> = { ...prev };
  for (const p of patch.added) {
    if (p.entity) out[p.entityId] = p.entity;
  }
  for (const p of patch.changed) {
    if (p.entity) out[p.entityId] = p.entity;
  }
  for (const p of patch.removed) {
    delete out[p.entityId];
  }
  return out;
}

function characterAtlasTextureKey(slug: string): string {
  return `char-atlas:${slug}`;
}

function toAtlasDirection(raw: string | null | undefined): AtlasDirection {
  if (raw === 'east' || raw === 'north' || raw === 'west' || raw === 'south') return raw;
  return 'south';
}

function countAnimFrames(
  meta: AtlasFrameMeta,
  direction: AtlasDirection,
  animation: AtlasAnimation,
): number {
  let n = 0;
  while (meta.frames[makeFrameKey(direction, animation, n)]) n += 1;
  return n;
}

/** 优先精确帧；缺失时回退 idle/0。 */
function animFrameKey(
  meta: AtlasFrameMeta,
  direction: AtlasDirection,
  animation: AtlasAnimation,
  frameIndex: number,
): string {
  const preferred = makeFrameKey(direction, animation, frameIndex);
  if (meta.frames[preferred]) return preferred;
  const idle0 = makeFrameKey(direction, 'idle', 0);
  if (meta.frames[idle0]) return idle0;
  const south = makeFrameKey('south', 'idle', 0);
  if (meta.frames[south]) return south;
  const first = Object.keys(meta.frames)[0];
  return first ?? preferred;
}

function isPhaserImage(obj: StageSprite): obj is Phaser.GameObjects.Image {
  return typeof (obj as Phaser.GameObjects.Image).setFrame === 'function';
}

function rectColorForKind(kind: WorldEntity['kind']): number {
  if (kind === 'player') return 0x8b1a1a;
  if (kind === 'npc') return 0xd8a24c;
  return 0x3a2418;
}

function textureFrameReady(scene: Phaser.Scene, key: string): boolean {
  if (!scene.textures.exists(key)) return false;
  const frame = scene.textures.getFrame(key);
  return !!frame && frame.width > 0 && frame.height > 0;
}

/** 当前 scene 的 map 核心资产缺失时，不应继续 loadMapBackground。 */
function manifestMissingBlocksScene(
  sceneId: string,
  missing: readonly MissingAssetErrorT[],
): boolean {
  if (missing.length === 0) return false;
  const mapPrefix = `maps:${sceneId}`;
  return missing.some(
    (err) =>
      err.assetKey === 'manifest' ||
      err.assetKey === mapPrefix ||
      err.assetKey.startsWith(`${mapPrefix}/`),
  );
}

/**
 * 将远程图片装入 Phaser texture（若不存在）。
 * 不用 scene.load 队列，避免与 runtime 异步路径争用。
 *
 * @param defringe 去白边：把半透明/透明邻域的 RGB 换成邻近不透明色，保留 alpha。
 *                 角色图集常带白底 fringe，线性/缩放时会冒出白边。
 */
async function ensurePhaserTexture(
  scene: Phaser.Scene,
  key: string,
  url: string,
  opts?: { readonly defringe?: boolean },
): Promise<boolean> {
  if (textureFrameReady(scene, key)) return true;
  if (scene.textures.exists(key)) {
    scene.textures.remove(key);
  }

  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      void (async () => {
        try {
          if (typeof img.decode === 'function') {
            await img.decode();
          }
          const source: HTMLImageElement | HTMLCanvasElement = opts?.defringe
            ? defringeAlphaEdges(img)
            : img;
          if (!textureFrameReady(scene, key)) {
            if (source instanceof HTMLCanvasElement) {
              scene.textures.addCanvas(key, source);
            } else {
              scene.textures.addImage(key, source);
            }
          }
          const tex = scene.textures.get(key) as Phaser.Textures.Texture & {
            refresh?: () => void;
          };
          // Game config pixelArt:true → 默认 NEAREST；勿再 setFilter(LINEAR)
          tex?.refresh?.();
          resolve(textureFrameReady(scene, key));
        } catch {
          resolve(false);
        }
      })();
    };
    img.onerror = () => resolve(false);
    img.src = url;
  });
}

/**
 * 去白边 fringe：对 alpha 不足的像素，用邻近不透明像素的 RGB 重写（保留原 alpha）。
 * 透明像素旁的「白 RGB」是 PNG 直通 alpha 常见瑕疵，缩放时会渗出白边。
 */
function defringeAlphaEdges(source: HTMLImageElement): HTMLCanvasElement {
  const w = source.naturalWidth || source.width;
  const h = source.naturalHeight || source.height;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx || w <= 0 || h <= 0) {
    return canvas;
  }
  ctx.drawImage(source, 0, 0);
  const image = ctx.getImageData(0, 0, w, h);
  const src = image.data;
  const out = new Uint8ClampedArray(src);
  const opaqueThreshold = 200;
  const softThreshold = 250;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const a = src[i + 3] ?? 0;
      if (a >= softThreshold) continue;

      let rSum = 0;
      let gSum = 0;
      let bSum = 0;
      let n = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const j = (ny * w + nx) * 4;
          if ((src[j + 3] ?? 0) < opaqueThreshold) continue;
          rSum += src[j] ?? 0;
          gSum += src[j + 1] ?? 0;
          bSum += src[j + 2] ?? 0;
          n++;
        }
      }
      if (n === 0) continue;
      out[i] = Math.round(rSum / n);
      out[i + 1] = Math.round(gSum / n);
      out[i + 2] = Math.round(bSum / n);
    }
  }

  image.data.set(out);
  ctx.putImageData(image, 0, 0);
  return canvas;
}

async function importPhaser(): Promise<typeof Phaser> {
  if (typeof window === 'undefined') {
    throw new Error('PhaserRuntime.boot requires browser environment (no window)');
  }
  const mod = (await import('phaser')) as { default?: typeof Phaser } & typeof Phaser;
  const ns = (mod as { default?: typeof Phaser }).default ?? mod;
  if (!ns || typeof ns.Game !== 'function') {
    throw new Error('Phaser runtime failed to load (no Game constructor)');
  }
  return ns;
}

/**
 * 工厂：返回一个 Phaser.Scene 子类。
 * create 时挂载 Light2D / PostFX WebGL filters。
 */
function createStageSceneClass(
  PhaserNS: typeof Phaser,
  internals: PhaserInternals,
  onFilterError: (error: Error) => void,
): new () => Phaser.Scene {
  class StageScene extends PhaserNS.Scene {
    create(): void {
      try {
        internals.systems?.attachSceneFilters(PhaserNS, this);
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        onFilterError(error);
      }
    }

    override update(_time: number, _delta: number): void {
      // FX tick 由 PhaserRuntime RAF（#tickCue）统一驱动，避免双时钟。
      void internals;
      void _time;
      void _delta;
    }
  }
  return StageScene;
}

function isWebGLRenderer(
  renderer: Phaser.Renderer.Canvas.CanvasRenderer | Phaser.Renderer.WebGL.WebGLRenderer | null,
): renderer is Phaser.Renderer.WebGL.WebGLRenderer {
  return (
    !!renderer && typeof renderer === 'object' && 'renderNodes' in renderer && 'gl' in renderer
  );
}

// Avoid unused import TS6133 — RuntimeEvent 仅用于泛型锚定，不需要运行时使用
void (null as unknown as RuntimeEvent);
