/**
 * StageViewport widget（Phase 2 VS8）。
 *
 * 把 StageRuntime（Phaser 4）封装到 React 生命周期：
 *  - mount 时 boot() + loadScene(mapId)
 *  - 监听 world patch 通过 diffWorldPatch 喂给 runtime
 *  - 监听 runtime 事件 → 暴露 status 给上层（loading / ready / gate / error）
 *  - unmount 时 destroy()
 *
 * 设计要点：
 *  - 不依赖 Phaser 类型 → 业务侧用 StageViewportHandle
 *  - 动态 import('phaser') 由 PhaserRuntime 自处理，本文件不感知
 *  - 通过 ref 暴露 imperative API（getSnapshot / playCue / clearCue / focusActor / getDirector）
 *  - a11y: aria-busy + aria-live 播报 runtime status；canvas 用 aria-label
 */
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import {
  PhaserRuntime,
  diffWorldPatch,
  type CameraDirector,
  type RuntimeSnapshot,
  type StageRuntime,
  type WorldDiffPatch,
} from '@shared/stage';
import type { WorldState } from '@shared/api';

export interface StageViewportHandle {
  /** 当前快照（同步）。 */
  getSnapshot(): Readonly<RuntimeSnapshot>;
  /** 推一条短气泡（同 actor 覆盖旧句）。 */
  playCue(args: Parameters<StageRuntime['playCue']>[0]): void;
  /** 用 timeline 投影的全量最新气泡替换（每角色一条）。 */
  setSpeechCues(cues: Parameters<StageRuntime['setSpeechCues']>[0]): void;
  /** 清掉某 actor 气泡（含排队中的）。 */
  clearCue(actorId: string): void;
  /** 推近说话者（NarrativeRail / 回合演出）。 */
  focusActor(entityId: string): void;
  /** CameraDirector（调试 / 高级编排；未 boot 时 null）。 */
  getDirector(): CameraDirector | null;
  /** 重置（unloadScene + 重新 loadScene）。 */
  reset(mapId?: string): Promise<void>;
}

export interface StageViewportProps {
  /** 当前 mapId；变化时 runtime 重新 loadScene。 */
  mapId: string | null;
  /** 当前世界状态（null 表示还没准备好）。 */
  world: WorldState | null;
  /** manifest URL（可选；不传则 runtime 不预加载）。 */
  manifestUrl?: string;
  /** 设计分辨率，默认 640×480。 */
  design?: { readonly width: number; readonly height: number };
  /** 缩放模式，默认 INTEGER_FIT。 */
  scaleMode?: 'FIT' | 'INTEGER_FIT' | 'FILL' | 'ENVELOP';
  /** patch 喂入后回调（用于调试 / 通知 GameShell reconcile）。 */
  onPatchApplied?: (patch: WorldDiffPatch) => void;
  /** 状态变化（idle / booting / loading / ready / gate / error）。 */
  onStatusChange?: (status: RuntimeSnapshot['status']) => void;
  /** 场景内点击可交互实体（NPC / interactable）。 */
  onEntityInteract?: (entityId: string) => void;
  /**
   * 可见区遮挡 inset（舞台像素）。例如侧栏打开时 `{ right: 360 }`，
   * 相机跟随中心会偏到未被遮挡区域。
   */
  contentInset?: {
    readonly left?: number;
    readonly right?: number;
    readonly top?: number;
    readonly bottom?: number;
  } | null;
  className?: string;
  style?: CSSProperties;
}

const containerBaseStyle: CSSProperties = {
  position: 'relative',
  width: '100%',
  height: '100%',
  overflow: 'hidden',
  background: 'var(--color-brand-ink)',
  borderRadius: 'var(--radius-lg)',
};

export const StageViewport = forwardRef<StageViewportHandle, StageViewportProps>(
  function StageViewport(
    {
      mapId,
      world,
      manifestUrl,
      design,
      scaleMode = 'INTEGER_FIT',
      onPatchApplied,
      onStatusChange,
      onEntityInteract,
      contentInset = null,
      className,
      style,
    },
    forwardedRef,
  ) {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const runtimeRef = useRef<PhaserRuntime | null>(null);
    const prevWorldRef = useRef<WorldState | null>(null);
    const onEntityInteractRef = useRef(onEntityInteract);
    onEntityInteractRef.current = onEntityInteract;
    const [status, setStatus] = useState<RuntimeSnapshot['status']>('idle');
    // 防止 setState 在 unmount 后触发
    const mountedRef = useRef(true);

    // mount runtime（一次性）；StrictMode 会 cleanup→setup，status 需重置以免残留 ready
    useEffect(() => {
      mountedRef.current = true;
      setStatus('idle');
      const container = containerRef.current;
      if (!container) return;

      const runtime = new PhaserRuntime({
        container,
        ...(manifestUrl !== undefined ? { manifestUrl } : {}),
        ...(design !== undefined ? { design } : {}),
        scaleMode,
      });
      runtimeRef.current = runtime;

      const offReady = runtime.on('ready', (p) => {
        if (!mountedRef.current) return;
        setStatus(p.snapshot.status);
        onStatusChange?.(p.snapshot.status);
      });
      const offBoot = runtime.on('boot', () => {
        if (!mountedRef.current) return;
        setStatus(runtime.getSnapshot().status);
        onStatusChange?.(runtime.getSnapshot().status);
      });
      const offAssetLoading = runtime.on('asset-loading', () => {
        if (!mountedRef.current) return;
        setStatus(runtime.getSnapshot().status);
        onStatusChange?.(runtime.getSnapshot().status);
      });
      const offAssetGate = runtime.on('asset-gate', () => {
        if (!mountedRef.current) return;
        setStatus(runtime.getSnapshot().status);
        onStatusChange?.(runtime.getSnapshot().status);
      });
      const offError = runtime.on('error', () => {
        if (!mountedRef.current) return;
        setStatus(runtime.getSnapshot().status);
        onStatusChange?.(runtime.getSnapshot().status);
      });
      const offPatch = runtime.on('patch-applied', (p) => {
        onPatchApplied?.(p.patch);
      });
      const offInteract = runtime.on('entity-interact', (p) => {
        onEntityInteractRef.current?.(p.entityId);
      });

      void runtime.boot();

      return () => {
        mountedRef.current = false;
        offReady();
        offBoot();
        offAssetLoading();
        offAssetGate();
        offError();
        offPatch();
        offInteract();
        void runtime.destroy();
        if (runtimeRef.current === runtime) {
          runtimeRef.current = null;
        }
        prevWorldRef.current = null;
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [manifestUrl, design?.width, design?.height, scaleMode]);

    // mapId 变化 → loadScene
    useEffect(() => {
      const runtime = runtimeRef.current;
      if (!runtime || !mapId) return;
      void runtime.loadScene(mapId);
    }, [mapId]);

    // world 变化 → diff + applyWorldPatch（不重建 sprite）
    useEffect(() => {
      const runtime = runtimeRef.current;
      if (!runtime || !world) return;
      const patch = diffWorldPatch(prevWorldRef.current, world);
      prevWorldRef.current = world;
      runtime.syncWorldMeta(world);
      if (patch.added.length === 0 && patch.changed.length === 0 && patch.removed.length === 0) {
        return;
      }
      runtime.applyWorldPatch(patch);
    }, [world]);

    // 侧栏等遮挡 → 相机跟随中心偏到可见区
    useEffect(() => {
      runtimeRef.current?.setContentInset(contentInset ?? null);
    }, [contentInset]);

    const reset = useCallback(async (nextMapId?: string) => {
      const runtime = runtimeRef.current;
      if (!runtime) return;
      await runtime.unloadScene();
      if (nextMapId) {
        await runtime.loadScene(nextMapId);
      }
    }, []);

    useImperativeHandle(
      forwardedRef,
      (): StageViewportHandle => ({
        getSnapshot() {
          const r = runtimeRef.current;
          if (!r) {
            return {
              status: 'idle',
              scene: null,
              assets: {
                status: 'pending',
                manifest: null,
                loadedCount: 0,
                totalCount: 0,
                missing: [],
              },
              world: { stateVersion: 0, mapId: null, lastAppliedPatch: null },
              speech: { activeCue: null, activeAnchor: null, queued: [] },
              viewport: { width: 0, height: 0 },
              lastError: null,
            };
          }
          return r.getSnapshot();
        },
        playCue(args) {
          runtimeRef.current?.playCue(args);
        },
        setSpeechCues(cues) {
          runtimeRef.current?.setSpeechCues(cues);
        },
        clearCue(actorId) {
          runtimeRef.current?.clearCue(actorId);
        },
        focusActor(entityId) {
          runtimeRef.current?.focusActor(entityId);
        },
        getDirector() {
          return runtimeRef.current?.getDirector() ?? null;
        },
        reset,
      }),
      [reset],
    );

    const ariaLabel = `舞台视口 (${status})`;
    const isBusy = status === 'booting' || status === 'loading';
    const ariaLive = status === 'gate' ? 'assertive' : 'polite';
    const isGate = status === 'gate';

    return (
      <div
        ref={containerRef}
        role="application"
        aria-label={ariaLabel}
        aria-busy={isBusy}
        data-stage-status={status}
        data-testid="stage-viewport"
        className={className}
        style={{ ...containerBaseStyle, ...style }}
      >
        <span
          aria-live={ariaLive}
          role="status"
          style={{
            position: 'absolute',
            width: 1,
            height: 1,
            padding: 0,
            margin: -1,
            overflow: 'hidden',
            clip: 'rect(0,0,0,0)',
            whiteSpace: 'nowrap',
          }}
        >
          {isGate ? '戏未开场' : `舞台状态：${status}`}
        </span>
        {isGate ? (
          <div
            role="status"
            data-testid="stage-asset-gate"
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              pointerEvents: 'none',
              background: 'color-mix(in srgb, var(--color-brand-ink) 72%, transparent)',
              color: 'var(--color-text-inverse)',
              fontFamily: 'var(--font-serif)',
              fontSize: 'var(--text-size-lg)',
              letterSpacing: '0.08em',
              zIndex: 1,
            }}
          >
            戏未开场
          </div>
        ) : null}
      </div>
    );
  },
);

export default StageViewport;
