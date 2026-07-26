/**
 * StageSystems — PhaserRuntime 独占的 Phase 2 FX 编排器。
 *
 * 拥有并驱动：
 *  - Light2DPipeline（快照：ambient / lights / flicker）
 *  - PostFXPipeline（bloom / vignette / grading 快照）
 *  - Atmosphere（粒子 FSM → 容器内唯一粒子 canvas）
 *  - CameraDirector（运镜）
 *
 * 渲染落地（唯一 WebGL 路径，无 CSS filter / 背景色假光照）：
 *  - Light2D → Phaser 4 `camera.filters` + `BaseFilterShader`（CPU lightMap + 法线）
 *  - PostFX → Phaser 4 内置 Bloom（ParallelFilters）/ Vignette / ColorMatrix
 *  - Camera → `cameras.main` scroll / zoom；background 仅作 clear color
 *  - Atmosphere → 同容器粒子 canvas（不冒充 Light2D/PostFX）
 *
 * WebGL / filter 注册失败 → 抛错并由 PhaserRuntime 门闸；禁止静默降级。
 */

import type Phaser from 'phaser';
import type { WorldEntity, WorldState } from '@shared/api';
import {
  DEFAULT_TILE_SIZE,
  defaultMapCatalog,
  type MapSpec,
} from '@shared/stage/assets/mapsCatalog';
import type { CameraDirector } from '@shared/stage/camera';
import {
  cameraFollowTargetFromWorldState,
  createCameraDirector,
  FOCUS_DEFAULT_DURATION_MS,
} from '@shared/stage/camera';
import { projectCueAnchor, type ScreenPoint } from '@shared/stage/speech';
import type { Light2DPipeline } from '@shared/stage/lighting';
import {
  attachLight2DFilter,
  bakeLightMap,
  createLight2DPipeline,
  fillFlatNormalMap,
  isFlatNormalPlaceholder,
  LIGHT2D_FLAT_NORMAL_TEXTURE_KEY,
  LIGHT2D_LIGHTMAP_TEXTURE_KEY,
  readWorldEnvironmentFromSnapshot,
  type Light2DFilterController,
  type LightingLayerSpec,
  type LightingSnapshot,
} from '@shared/stage/lighting';
import type { Atmosphere } from '@shared/stage/particles';
import {
  createAtmosphere,
  DEFAULT_KIND_TUNING,
  type AtmosphereLayerSpec,
  type AtmosphereSnapshot,
} from '@shared/stage/particles';
import type { PostFXPipeline } from '@shared/stage/postfx';
import {
  attachPostFXFilters,
  createPostFXPipeline,
  type PostFXFilterHandles,
} from '@shared/stage/postfx';
import type { LogicalSize } from '@shared/stage/scale';
import type { StageRuntime } from './StageRuntime';

const TILE = DEFAULT_TILE_SIZE.w;

/** 原画质：相机 zoom 锁定为 1（禁止分数倍推近造成双线性发糊）。 */
const NATIVE_ZOOM = 1;

type PhaserNS = typeof Phaser;

export type StageContentInset = {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
};

const ZERO_INSET: StageContentInset = Object.freeze({
  left: 0,
  right: 0,
  top: 0,
  bottom: 0,
});

export type StageSystemsOptions = {
  readonly container: HTMLElement;
  readonly design?: LogicalSize;
  readonly tileSize?: number;
};

/**
 * 从 mapsCatalog 取 LightingLayerSpec（灯笼 + 窗户 + ambient）。
 */
export function lightingSpecFromMapCatalog(mapId: string): LightingLayerSpec | null {
  const map = findMapSpec(mapId);
  if (!map) return null;
  return Object.freeze({
    ambient: map.lighting.ambient,
    lights: Object.freeze([...map.lighting.lanterns, ...map.lighting.windows]),
  });
}

/**
 * 由 LightingLayerSpec 派生 Atmosphere emitters（灯笼锚点 + 地图尘埃）。
 */
export function atmosphereSpecFromLighting(
  mapId: string,
  lighting: LightingLayerSpec,
  mapSize?: { readonly cols: number; readonly rows: number },
): AtmosphereLayerSpec {
  const cols = mapSize?.cols ?? 57;
  const rows = mapSize?.rows ?? 31;
  const dustColor = DEFAULT_KIND_TUNING.dust.color;
  const fireflyColor = DEFAULT_KIND_TUNING.firefly.color;
  const lanterns = lighting.lights.filter((l) => l.kind === 'lantern');
  const emitters = [
    Object.freeze({
      kind: 'dust' as const,
      area: Object.freeze({
        x: 1,
        y: 1,
        w: Math.max(1, cols - 2),
        h: Math.max(1, rows - 2),
      }),
      count: 28,
      color: dustColor,
    }),
    ...lanterns.map((lantern) =>
      Object.freeze({
        kind: 'firefly' as const,
        area: Object.freeze({ x: lantern.position.x, y: lantern.position.y, w: 1, h: 1 }),
        count: 4,
        color: fireflyColor,
        anchor: Object.freeze({ x: lantern.position.x, y: lantern.position.y }),
      }),
    ),
  ];
  return Object.freeze({
    mapId,
    emitters: Object.freeze(emitters),
  });
}

/**
 * 由地图 lighting 灯笼锚点 + 地图范围派生 Atmosphere emitters。
 */
export function atmosphereSpecFromMapCatalog(mapId: string): AtmosphereLayerSpec | null {
  const map = findMapSpec(mapId);
  if (!map) return null;
  const lighting = lightingSpecFromMapCatalog(mapId);
  if (!lighting) return null;
  return atmosphereSpecFromLighting(mapId, lighting, map.size);
}

function findMapSpec(mapId: string): MapSpec | undefined {
  return defaultMapCatalog().find((m) => m.mapId === mapId);
}

export class StageSystems {
  readonly lighting: Light2DPipeline;
  readonly postfx: PostFXPipeline;
  readonly atmosphere: Atmosphere;
  readonly camera: CameraDirector;

  readonly #container: HTMLElement;
  readonly #tileSize: number;
  readonly #design: LogicalSize;
  #particleCanvas: HTMLCanvasElement | null = null;
  #particleCtx: CanvasRenderingContext2D | null = null;
  #unbindRuntime: (() => void) | null = null;
  #unsubLighting: (() => void) | null = null;
  #unsubPostfx: (() => void) | null = null;
  #unsubAtmosphere: (() => void) | null = null;
  #lastLighting: Readonly<LightingSnapshot> | null = null;
  #lastAtmosphere: Readonly<AtmosphereSnapshot> | null = null;
  #destroyed = false;

  #scene: Phaser.Scene | null = null;
  #light2d: Light2DFilterController | null = null;
  #postfxHandles: PostFXFilterHandles | null = null;
  #lightMapCanvas: HTMLCanvasElement | null = null;
  #lightMapCtx: CanvasRenderingContext2D | null = null;
  #lightMapBuffer: Uint8ClampedArray | null = null;
  #filtersAttached = false;
  #normalStrength = 0;
  #bakedSpecVersion = -1;
  #bakedCameraKey = '';
  /** 当前地图世界像素尺寸（imagelayer）；用于 scroll clamp。 */
  #mapBounds: { readonly width: number; readonly height: number } | null = null;
  /** 侧栏等遮挡后的可见区 inset（像素）；跟随中心落在可见区而非整 canvas。 */
  #contentInset: StageContentInset = ZERO_INSET;

  constructor(options: StageSystemsOptions) {
    this.#container = options.container;
    this.#tileSize = options.tileSize ?? TILE;
    this.#design = options.design ?? { width: 640, height: 480 };
    this.lighting = createLight2DPipeline();
    this.postfx = createPostFXPipeline();
    this.atmosphere = createAtmosphere();
    this.camera = createCameraDirector({ initialZoom: NATIVE_ZOOM });

    this.#ensureParticleCanvas();
    this.#unsubLighting = this.lighting.subscribe((s) => {
      this.#lastLighting = s;
    });
    this.#unsubPostfx = this.postfx.subscribe(() => {
      // 局部原画质：关闭 Bloom/暗角，避免发糊
      this.#disableOverviewPostFX();
    });
    this.#unsubAtmosphere = this.atmosphere.subscribe((s) => {
      this.#lastAtmosphere = s;
    });
  }

  /**
   * 绑定 StageRuntime（保留句柄；跟随目标由 syncFollowFromWorld 喂入）。
   */
  bindRuntime(runtime: StageRuntime): void {
    if (this.#destroyed) return;
    this.#unbindRuntime?.();
    this.#unbindRuntime = null;
    void runtime;
  }

  /**
   * 在 scene 就绪后挂载 WebGL filters（Light2D + PostFX）。
   * 必须在 boot / loadScene 后调用；失败抛错。
   */
  attachSceneFilters(PhaserNS: PhaserNS, scene: Phaser.Scene): void {
    if (this.#destroyed) return;
    if (this.#filtersAttached && this.#scene === scene) return;

    const cam = scene.cameras?.main;
    if (!cam) {
      throw new Error('[stage] attachSceneFilters: cameras.main missing');
    }

    this.#scene = scene;
    this.#ensureLightMapTextures(scene);
    this.#light2d = attachLight2DFilter(PhaserNS, cam);
    this.#bindDefaultNormal(scene);
    this.#postfxHandles = attachPostFXFilters(PhaserNS, cam);
    this.#disableOverviewPostFX();
    this.#filtersAttached = true;
    this.#bakedSpecVersion = -1;
    this.#syncLightingToFilter(true);
  }

  /**
   * 绑定角色图集法线纹理（若已加载）。
   * 平占位或缺失 → `normalStrength=0`，filter 仍保持启用。
   */
  bindNormalMapFromTextureKey(textureKey: string | null): void {
    if (this.#destroyed || !this.#scene || !this.#light2d) return;
    if (!textureKey || !this.#scene.textures.exists(textureKey)) {
      this.#bindDefaultNormal(this.#scene);
      return;
    }
    const frame = this.#scene.textures.getFrame(textureKey);
    const glTex = frame?.glTexture ?? null;
    if (!glTex) {
      this.#bindDefaultNormal(this.#scene);
      return;
    }
    // 若能读到 canvas source，检测平法线占位
    const tex = this.#scene.textures.get(textureKey);
    const src = tex?.getSourceImage() as HTMLImageElement | HTMLCanvasElement | null | undefined;
    let flat = false;
    if (src && 'width' in src && src.width > 0 && src.height > 0) {
      try {
        const c = document.createElement('canvas');
        c.width = Math.min(8, src.width);
        c.height = Math.min(8, src.height);
        const ctx = c.getContext('2d');
        if (ctx) {
          ctx.drawImage(src, 0, 0, c.width, c.height);
          const img = ctx.getImageData(0, 0, c.width, c.height);
          flat = isFlatNormalPlaceholder(img.data, c.width, c.height);
        }
      } catch {
        flat = false;
      }
    }
    this.#light2d.setNormalTexture(glTex);
    this.#normalStrength = flat ? 0 : 1;
    this.#light2d.normalStrength = this.#normalStrength;
  }

  /**
   * 设置地图世界像素 bounds；相机 zoom=1 跟随，scroll 钳在地图内。
   */
  setMapBounds(width: number, height: number): void {
    if (this.#destroyed) return;
    if (width <= 0 || height <= 0) return;
    this.#mapBounds = Object.freeze({ width, height });
    this.#bakedCameraKey = '';
    const scene = this.#scene;
    const cam = scene?.cameras?.main;
    if (cam && typeof cam.setBounds === 'function') {
      cam.setBounds(0, 0, width, height);
    }
  }

  /**
   * 侧栏等遮挡 inset（舞台像素）。打开右侧栏时把跟随中心偏到可见区。
   */
  setContentInset(inset: Partial<StageContentInset> | null | undefined): void {
    if (this.#destroyed) return;
    const next: StageContentInset = Object.freeze({
      left: Math.max(0, inset?.left ?? 0),
      right: Math.max(0, inset?.right ?? 0),
      top: Math.max(0, inset?.top ?? 0),
      bottom: Math.max(0, inset?.bottom ?? 0),
    });
    if (
      next.left === this.#contentInset.left &&
      next.right === this.#contentInset.right &&
      next.top === this.#contentInset.top &&
      next.bottom === this.#contentInset.bottom
    ) {
      return;
    }
    this.#contentInset = next;
    this.#bakedCameraKey = '';
  }

  /** 视口尺寸变化后强制重烘 lightMap。 */
  invalidateLightingBake(): void {
    if (this.#destroyed) return;
    this.#bakedCameraKey = '';
    this.#bakedSpecVersion = -1;
  }

  /** 场景加载：注入地图灯光 / 氛围。 */
  loadMap(mapId: string): void {
    if (this.#destroyed) return;
    const lighting = lightingSpecFromMapCatalog(mapId);
    this.lighting.setLightingSpec(lighting, mapId);
    const atmosphere = atmosphereSpecFromMapCatalog(mapId);
    this.atmosphere.setSpec(atmosphere);
    this.camera.setMapId(mapId);
    this.#bakedSpecVersion = -1;
    this.#bakedCameraKey = '';
  }

  /**
   * 用已加载的 lighting.json 覆盖 catalog 兜底（地图切景后由 PhaserRuntime 调用）。
   */
  applyLightingLayer(mapId: string, lighting: LightingLayerSpec): void {
    if (this.#destroyed) return;
    this.lighting.setLightingSpec(lighting, mapId);
    const map = findMapSpec(mapId);
    this.atmosphere.setSpec(atmosphereSpecFromLighting(mapId, lighting, map?.size));
    this.#bakedSpecVersion = -1;
    this.#bakedCameraKey = '';
  }

  /** 从 world publicState 驱动灯光 / PostFX / 氛围。 */
  applyWorldEnvironment(world: WorldState | null): void {
    if (this.#destroyed || !world) return;
    const env = readWorldEnvironmentFromSnapshot(
      world as unknown as { readonly publicState?: null } & Record<string, unknown>,
    );
    this.lighting.applyPublicState(env);
    this.postfx.applyPublicState(env);
    this.atmosphere.applyPublicState(env);
    this.camera.applyPublicState(env);
  }

  /**
   * 按当前扮演角色位置更新跟随目标（含初次 load / 切扮演）。
   */
  syncFollowFromWorld(world: WorldState | null): void {
    if (this.#destroyed || !world) return;
    const target = cameraFollowTargetFromWorldState(world);
    if (!target) return;
    this.camera.followEntity(target.position, target.entityId);
    this.camera.setMapId(world.mapId);
  }

  /**
   * 推近说话者：原画质下仅平移居中（zoom 锁定 1），不分数倍放大。
   */
  focusActor(
    entityId: string,
    position: { readonly x: number; readonly y: number },
    opts?: { readonly zoom?: number; readonly durationMs?: number },
  ): void {
    if (this.#destroyed) return;
    void opts?.zoom;
    this.camera.enqueue({
      kind: 'focus',
      target: { entityId, position: { x: position.x, y: position.y } },
      zoom: NATIVE_ZOOM,
      durationMs: opts?.durationMs ?? FOCUS_DEFAULT_DURATION_MS,
    });
  }

  /**
   * 把实体 tile 坐标投影到舞台容器 CSS 像素（SpeechCue 气泡锚点）。
   * 与粒子 canvas 同源：世界像素 − 相机 scroll × zoom × CSS/game 比。
   */
  projectEntityCueAnchor(entity: WorldEntity): ScreenPoint {
    const rect = this.#container.getBoundingClientRect();
    const cssWidth = Math.max(
      1,
      Math.floor(rect.width || this.#container.clientWidth || this.#design.width),
    );
    const cssHeight = Math.max(
      1,
      Math.floor(rect.height || this.#container.clientHeight || this.#design.height),
    );
    const view = this.#cameraViewTransform();
    return projectCueAnchor(
      entity,
      {
        scrollX: view.scrollX,
        scrollY: view.scrollY,
        zoom: view.zoom,
        cssWidth,
        cssHeight,
        viewW: view.viewW,
        viewH: view.viewH,
      },
      this.#tileSize,
    );
  }

  /**
   * 每帧推进 FSM，并把相机 / Light2D / PostFX / 粒子落到 WebGL + 粒子 canvas。
   */
  tick(deltaMs: number, now: number, scene: Phaser.Scene | null): void {
    if (this.#destroyed) return;
    this.lighting.tick(now);
    this.atmosphere.tick(deltaMs, now);
    this.camera.tick(deltaMs, now);
    this.#applyCamera(scene);
    this.#applyClearColor(scene);
    this.#syncLightingToFilter(false);
    this.#paintParticles();
  }

  destroy(): void {
    if (this.#destroyed) return;
    this.#destroyed = true;
    this.#unbindRuntime?.();
    this.#unbindRuntime = null;
    this.#unsubLighting?.();
    this.#unsubPostfx?.();
    this.#unsubAtmosphere?.();
    this.#unsubLighting = null;
    this.#unsubPostfx = null;
    this.#unsubAtmosphere = null;
    this.lighting.destroy();
    this.postfx.destroy();
    this.atmosphere.destroy();
    this.camera.destroy();
    if (this.#particleCanvas?.parentElement) {
      this.#particleCanvas.parentElement.removeChild(this.#particleCanvas);
    }
    this.#particleCanvas = null;
    this.#particleCtx = null;
    this.#light2d = null;
    this.#postfxHandles = null;
    this.#scene = null;
    this.#lightMapCanvas = null;
    this.#lightMapCtx = null;
    this.#lightMapBuffer = null;
    this.#filtersAttached = false;
  }

  // ───────── private ─────────

  #ensureParticleCanvas(): void {
    if (this.#particleCanvas) return;
    const canvas = document.createElement('canvas');
    canvas.dataset.stageAtmosphere = 'true';
    canvas.style.position = 'absolute';
    canvas.style.inset = '0';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.pointerEvents = 'none';
    canvas.style.zIndex = '3';
    this.#container.appendChild(canvas);
    this.#particleCanvas = canvas;
    this.#particleCtx = canvas.getContext('2d');
  }

  #ensureLightMapTextures(scene: Phaser.Scene): void {
    const w = Math.max(1, Math.floor(this.#design.width));
    const h = Math.max(1, Math.floor(this.#design.height));

    if (!scene.textures.exists(LIGHT2D_LIGHTMAP_TEXTURE_KEY)) {
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        throw new Error('[lighting] failed to create lightMap 2d context');
      }
      this.#lightMapCanvas = canvas;
      this.#lightMapCtx = ctx;
      this.#lightMapBuffer = new Uint8ClampedArray(w * h * 4);
      scene.textures.addCanvas(LIGHT2D_LIGHTMAP_TEXTURE_KEY, canvas);
    } else {
      const tex = scene.textures.get(LIGHT2D_LIGHTMAP_TEXTURE_KEY) as Phaser.Textures.CanvasTexture;
      this.#lightMapCanvas = tex.getCanvas();
      this.#lightMapCtx = tex.getContext();
      this.#lightMapBuffer = new Uint8ClampedArray(w * h * 4);
    }

    if (!scene.textures.exists(LIGHT2D_FLAT_NORMAL_TEXTURE_KEY)) {
      const canvas = document.createElement('canvas');
      canvas.width = 4;
      canvas.height = 4;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        throw new Error('[lighting] failed to create flat normal 2d context');
      }
      const flat = fillFlatNormalMap(4, 4);
      const img = new ImageData(flat, 4, 4);
      ctx.putImageData(img, 0, 0);
      scene.textures.addCanvas(LIGHT2D_FLAT_NORMAL_TEXTURE_KEY, canvas);
    }
  }

  #bindDefaultNormal(scene: Phaser.Scene): void {
    if (!this.#light2d) return;
    const frame = scene.textures.getFrame(LIGHT2D_FLAT_NORMAL_TEXTURE_KEY);
    const glTex = frame?.glTexture ?? null;
    if (!glTex) {
      throw new Error('[lighting] flat normal texture missing glTexture');
    }
    this.#light2d.setNormalTexture(glTex);
    this.#normalStrength = 0;
    this.#light2d.normalStrength = 0;
  }

  #syncLightingToFilter(force: boolean): void {
    const lighting = this.#lastLighting;
    const ctrl = this.#light2d;
    const scene = this.#scene;
    if (!lighting || !ctrl || !scene || !this.#filtersAttached) return;

    // 局部原画质：环境光用地图 ambient，避免把画面乘暗；灯笼作叠加
    ctrl.ambientColor = [lighting.ambient.r, lighting.ambient.g, lighting.ambient.b];
    ctrl.ambientIntensity = Math.min(1, Math.max(0.35, lighting.ambient.intensity));
    ctrl.lightScale = 0.55;
    ctrl.normalStrength = this.#normalStrength;

    const camKey = this.#cameraBakeKey();
    const hasFlicker = lighting.lights.some((l) => !!l.flicker && l.flicker.amplitude > 0);
    const shouldBake =
      force ||
      lighting.specVersion !== this.#bakedSpecVersion ||
      camKey !== this.#bakedCameraKey ||
      hasFlicker;
    if (shouldBake) {
      this.#bakeAndUploadLightMap(lighting);
      this.#bakedSpecVersion = lighting.specVersion;
      this.#bakedCameraKey = camKey;
    }
    this.#bindLightMapGl(scene, ctrl);
  }

  #disableOverviewPostFX(): void {
    const handles = this.#postfxHandles;
    if (!handles) return;
    handles.bloom.setActive(false);
    handles.vignette.setActive(false);
    handles.colorMatrix.setActive(false);
  }

  #cameraViewTransform(scene: Phaser.Scene | null = this.#scene): {
    readonly scrollX: number;
    readonly scrollY: number;
    readonly zoom: number;
    readonly viewW: number;
    readonly viewH: number;
  } {
    const cam = scene?.cameras?.main;
    const viewW = cam?.width && cam.width > 0 ? cam.width : this.#design.width;
    const viewH = cam?.height && cam.height > 0 ? cam.height : this.#design.height;
    const zoom = NATIVE_ZOOM;
    // 地图 bounds 未就绪时不跟角色滚动，避免对准空白区只剩清屏色
    if (!this.#mapBounds) {
      return { scrollX: 0, scrollY: 0, zoom, viewW, viewH };
    }
    const mapW = this.#mapBounds.width;
    const mapH = this.#mapBounds.height;
    const inset = this.#contentInset;
    const visibleW = Math.max(1, viewW - inset.left - inset.right);
    const visibleH = Math.max(1, viewH - inset.top - inset.bottom);

    const snap = this.camera.snapshot();
    const focusX = snap.position.x * this.#tileSize;
    const focusY = snap.position.y * this.#tileSize;

    // 可见区中心对齐跟随点（侧栏打开时向左偏）
    let scrollX = focusX - (inset.left + visibleW / 2) / zoom;
    let scrollY = focusY - (inset.top + visibleH / 2) / zoom;

    const maxScrollX = Math.max(0, mapW - viewW / zoom);
    const maxScrollY = Math.max(0, mapH - viewH / zoom);
    if (mapW * zoom <= viewW) {
      scrollX = (mapW - viewW / zoom) / 2;
    } else {
      scrollX = Math.min(maxScrollX, Math.max(0, scrollX));
    }
    if (mapH * zoom <= viewH) {
      scrollY = (mapH - viewH / zoom) / 2;
    } else {
      scrollY = Math.min(maxScrollY, Math.max(0, scrollY));
    }

    return {
      scrollX,
      scrollY,
      zoom,
      viewW,
      viewH,
    };
  }

  #cameraBakeKey(): string {
    const t = this.#cameraViewTransform();
    const b = this.#mapBounds;
    const i = this.#contentInset;
    return `${t.scrollX.toFixed(2)},${t.scrollY.toFixed(2)},${t.zoom},${t.viewW}x${t.viewH},${b?.width ?? 0}x${b?.height ?? 0},inset:${i.left},${i.right},${i.top},${i.bottom}`;
  }

  #bakeAndUploadLightMap(lighting: Readonly<LightingSnapshot>): void {
    const canvas = this.#lightMapCanvas;
    const ctx = this.#lightMapCtx;
    if (!canvas || !ctx) {
      throw new Error('[lighting] lightMap canvas not initialized');
    }
    const w = canvas.width;
    const h = canvas.height;
    const buf = this.#lightMapBuffer ?? new Uint8ClampedArray(w * h * 4);
    this.#lightMapBuffer = buf;
    const view = this.#cameraViewTransform();
    bakeLightMap({
      width: w,
      height: h,
      tileSize: this.#tileSize,
      lights: lighting.lights,
      flickerOffsets: lighting.flickerOffsets,
      target: buf,
      scrollX: view.scrollX,
      scrollY: view.scrollY,
      zoom: view.zoom,
      viewWidth: view.viewW,
      viewHeight: view.viewH,
    });
    const imageData = new ImageData(buf, w, h);
    ctx.putImageData(imageData, 0, 0);
    const scene = this.#scene;
    if (!scene) return;
    const tex = scene.textures.get(LIGHT2D_LIGHTMAP_TEXTURE_KEY) as Phaser.Textures.CanvasTexture;
    if (typeof tex.refresh === 'function') {
      tex.refresh();
    }
  }

  #bindLightMapGl(scene: Phaser.Scene, ctrl: Light2DFilterController): void {
    const frame = scene.textures.getFrame(LIGHT2D_LIGHTMAP_TEXTURE_KEY);
    const glTex = frame?.glTexture ?? null;
    if (!glTex) {
      throw new Error('[lighting] lightMap glTexture missing');
    }
    ctrl.setLightMapTexture(glTex);
  }

  #applyCamera(scene: Phaser.Scene | null): void {
    if (!scene) return;
    const cam = scene.cameras?.main;
    if (!cam) return;
    const view = this.#cameraViewTransform(scene);
    cam.setScroll(view.scrollX, view.scrollY);
    if (typeof cam.setZoom === 'function') {
      cam.setZoom(view.zoom);
    }
  }

  /** clear color：固定墨色。不用 ambient 米色，避免地图未入镜时整屏「白屏」。 */
  #applyClearColor(scene: Phaser.Scene | null): void {
    const hex = 0x1a0e0a;
    if (scene?.cameras?.main && typeof scene.cameras.main.setBackgroundColor === 'function') {
      scene.cameras.main.setBackgroundColor(hex);
    }
  }

  #paintParticles(): void {
    const canvas = this.#particleCanvas;
    const ctx = this.#particleCtx;
    const snap = this.#lastAtmosphere;
    if (!canvas || !ctx || !snap) return;

    const rect = this.#container.getBoundingClientRect();
    const cssW = Math.max(1, Math.floor(rect.width));
    const cssH = Math.max(1, Math.floor(rect.height));
    if (canvas.width !== cssW || canvas.height !== cssH) {
      canvas.width = cssW;
      canvas.height = cssH;
    }
    ctx.clearRect(0, 0, cssW, cssH);
    if (snap.particles.length === 0 || snap.visibility <= 0) return;

    const view = this.#cameraViewTransform();
    const scaleX = cssW / (view.viewW || 1);
    const scaleY = cssH / (view.viewH || 1);
    const vis = snap.visibility;

    for (const p of snap.particles) {
      const worldX = p.position.x * this.#tileSize;
      const worldY = p.position.y * this.#tileSize;
      const x = (worldX - view.scrollX) * view.zoom * scaleX;
      const y = (worldY - view.scrollY) * view.zoom * scaleY;
      if (x < -8 || y < -8 || x > cssW + 8 || y > cssH + 8) continue;
      const a = p.color.a * vis;
      if (a <= 0.01) continue;
      const radius =
        (p.kind === 'dust' ? 1.2 : p.kind === 'firefly' || p.kind === 'spark' ? 2.2 : 1.8) *
        view.zoom *
        Math.min(scaleX, scaleY);
      ctx.beginPath();
      ctx.fillStyle = `rgba(${Math.round(p.color.r * 255)},${Math.round(p.color.g * 255)},${Math.round(p.color.b * 255)},${a})`;
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

export function createStageSystems(options: StageSystemsOptions): StageSystems {
  return new StageSystems(options);
}
