/**
 * Phaser 4 Light2D WebGL Filter — Controller + BaseFilterShader 注册。
 *
 * 使用 `camera.filters` + `Phaser.Filters.Controller` +
 * `Phaser.Renderer.WebGL.RenderNodes.BaseFilterShader`（非 Phaser 3 PostFXPipeline）。
 */
import type Phaser from 'phaser';
import { LIGHT2D_FRAGMENT_SOURCE } from './shaders';

export const LIGHT2D_FILTER_NODE = 'FilterLight2D';

export const LIGHT2D_LIGHTMAP_TEXTURE_KEY = '__stage_light2d_lightmap';
export const LIGHT2D_FLAT_NORMAL_TEXTURE_KEY = '__stage_light2d_flat_normal';

export type Light2DFilterController = Phaser.Filters.Controller & {
  normalGlTexture: Phaser.Renderer.WebGL.Wrappers.WebGLTextureWrapper | null;
  lightMapGlTexture: Phaser.Renderer.WebGL.Wrappers.WebGLTextureWrapper | null;
  ambientColor: [number, number, number];
  ambientIntensity: number;
  lightScale: number;
  normalStrength: number;
  setNormalTexture: (texture: Phaser.Renderer.WebGL.Wrappers.WebGLTextureWrapper | null) => void;
  setLightMapTexture: (texture: Phaser.Renderer.WebGL.Wrappers.WebGLTextureWrapper | null) => void;
};

type PhaserNS = typeof Phaser;

function isWebGLRenderer(
  renderer: Phaser.Renderer.Canvas.CanvasRenderer | Phaser.Renderer.WebGL.WebGLRenderer,
): renderer is Phaser.Renderer.WebGL.WebGLRenderer {
  return (
    typeof renderer === 'object' &&
    renderer !== null &&
    'renderNodes' in renderer &&
    'gl' in renderer
  );
}

/**
 * 向 WebGL RenderNodeManager 注册 Light2D FilterShader（幂等）。
 * 失败时抛错 — 禁止静默降级到 CSS。
 */
export function registerLight2DFilterNode(
  PhaserNS: PhaserNS,
  renderer: Phaser.Renderer.Canvas.CanvasRenderer | Phaser.Renderer.WebGL.WebGLRenderer,
): void {
  if (!isWebGLRenderer(renderer)) {
    throw new Error('[lighting] Light2D requires WebGL renderer (got non-WebGL)');
  }
  const nodes = renderer.renderNodes;
  if (nodes.hasNode(LIGHT2D_FILTER_NODE)) return;

  class FilterLight2D extends PhaserNS.Renderer.WebGL.RenderNodes.BaseFilterShader {
    constructor(manager: Phaser.Renderer.WebGL.RenderNodes.RenderNodeManager) {
      super(LIGHT2D_FILTER_NODE, manager, undefined, LIGHT2D_FRAGMENT_SOURCE);
    }

    override setupTextures(
      controller: Phaser.Filters.Controller,
      textures: Phaser.Renderer.WebGL.Wrappers.WebGLTextureWrapper[],
      _drawingContext: Phaser.Renderer.WebGL.DrawingContext,
    ): void {
      void _drawingContext;
      const ctrl = controller as Light2DFilterController;
      const normal = ctrl.normalGlTexture;
      const lightMap = ctrl.lightMapGlTexture;
      if (!normal || !lightMap) {
        throw new Error('[lighting] Light2D textures not bound (normal/lightMap)');
      }
      textures[1] = normal;
      textures[2] = lightMap;
    }

    override setupUniforms(
      controller: Phaser.Filters.Controller,
      _drawingContext: Phaser.Renderer.WebGL.DrawingContext,
    ): void {
      void _drawingContext;
      const ctrl = controller as Light2DFilterController;
      const pm = this.programManager;
      pm.setUniform('u_normalMap', 1);
      pm.setUniform('u_lightMap', 2);
      pm.setUniform('u_ambientColor', ctrl.ambientColor);
      pm.setUniform('u_ambientIntensity', ctrl.ambientIntensity);
      pm.setUniform('u_lightScale', ctrl.lightScale);
      pm.setUniform('u_normalStrength', ctrl.normalStrength);
    }
  }

  nodes.addNodeConstructor(LIGHT2D_FILTER_NODE, FilterLight2D);
}

/**
 * 创建挂到指定 Camera 的 Light2D Controller，并加入 internal FilterList。
 */
export function attachLight2DFilter(
  PhaserNS: PhaserNS,
  camera: Phaser.Cameras.Scene2D.Camera,
): Light2DFilterController {
  const game = camera.scene.game;
  registerLight2DFilterNode(PhaserNS, game.renderer);

  class Light2DController extends PhaserNS.Filters.Controller {
    normalGlTexture: Phaser.Renderer.WebGL.Wrappers.WebGLTextureWrapper | null = null;
    lightMapGlTexture: Phaser.Renderer.WebGL.Wrappers.WebGLTextureWrapper | null = null;
    ambientColor: [number, number, number] = [1, 1, 1];
    ambientIntensity = 1;
    lightScale = 1;
    normalStrength = 0;

    constructor(cam: Phaser.Cameras.Scene2D.Camera) {
      super(cam, LIGHT2D_FILTER_NODE);
    }

    setNormalTexture(texture: Phaser.Renderer.WebGL.Wrappers.WebGLTextureWrapper | null): void {
      this.normalGlTexture = texture;
    }

    setLightMapTexture(texture: Phaser.Renderer.WebGL.Wrappers.WebGLTextureWrapper | null): void {
      this.lightMapGlTexture = texture;
    }
  }

  const controller = new Light2DController(camera) as Light2DFilterController;
  camera.filters.internal.add(controller);
  return controller;
}
