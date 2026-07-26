/**
 * Stage Runtime 接口（Phase 2 VS1 Spec §StageRuntime）。
 *
 * 设计目标：
 *  - **Phaser 无关**：所有命令以 plain data 表达，方便替换 / 单测 / mock。
 *  - **命令 / 快照 / 事件三件套**：
 *    - 命令（functions）：上层 GameShell 调
 *    - 快照（getSnapshot）：上层用以渲染 HUD / 占位 / 调试
 *    - 事件（on / off）：runtime 主动汇报（asset ready、patch applied、cue changed）
 *  - **可测可替换**：业务只依赖此接口，不直接 import Phaser。
 *
 * 实现：见 `PhaserRuntime.ts`（Phase 2 VS1 唯一官方实现）。
 *     不在 Phase 2 引入第二份实现；VS4–VS7 在此接口上扩展（camera focus、
 *     lighting、postfx 等通过事件 + 命令挂接，不破坏接口）。
 */

import type { AssetManifest, AssetStatus, MissingAssetError } from '@shared/stage/assets';
import type { WorldDiffPatch } from '@shared/stage/world';
import type { SpeechCue, ScreenPoint, ViewportSize } from '@shared/stage/speech';
import type { LogicalSize } from '@shared/stage/scale';

/** 运行时整盘状态快照。 */
export type RuntimeSnapshot = {
  readonly status: RuntimeStatus;
  readonly scene: RuntimeScene | null;
  readonly assets: RuntimeAssets;
  readonly world: RuntimeWorld;
  readonly speech: RuntimeSpeech;
  readonly viewport: ViewportSize;
  readonly lastError: RuntimeError | null;
};

export type RuntimeStatus =
  | 'idle' // 构造但未启动
  | 'booting' // 构造阶段：canvas + Phaser.Game 正在初始化
  | 'loading' // 资源加载中
  | 'gate' // 加载失败 + 走品牌化门闸
  | 'ready' // 可渲染（含 patch 循环）
  | 'destroyed';

/** 当前 scene 状态。 */
export type RuntimeScene = {
  readonly mapId: string;
  readonly manifestVersion: number;
  readonly entityIds: readonly string[];
};

/** 资产就绪情况（与 AssetLoader 对齐）。 */
export type RuntimeAssets = {
  readonly status: AssetStatus;
  readonly manifest: AssetManifest | null;
  readonly loadedCount: number;
  readonly totalCount: number;
  readonly missing: readonly MissingAssetError[];
};

export type RuntimeWorld = {
  readonly stateVersion: number;
  readonly mapId: string | null;
  readonly lastAppliedPatch: WorldDiffPatch | null;
};

/** 短气泡当前展示状态。 */
export type RuntimeSpeech = {
  readonly activeCue: SpeechCue | null;
  readonly activeAnchor: ScreenPoint | null;
  readonly queued: readonly SpeechCue[];
};

/** 错误统一载体。 */
export type RuntimeError = {
  readonly kind: 'ASSET' | 'PATCH' | 'INTERNAL';
  readonly message: string;
  readonly cause?: unknown;
};

/** 启动选项。 */
export type StageRuntimeOptions = {
  /** viewport，缺省用容器 clientWidth/Height（mount 后） */
  readonly viewport?: ViewportSize;
  /** 设计分辨率，缺省 640x480 */
  readonly design?: LogicalSize;
  /** 缩放模式，缺省 INTEGER_FIT */
  readonly scaleMode?: 'FIT' | 'INTEGER_FIT' | 'FILL' | 'ENVELOP';
  /** 资产 manifest URL；不传则 runtime 不等待资产 */
  readonly manifestUrl?: string;
  /** 容器元素；若已传 viewport 也优先读 client size */
  readonly container: HTMLElement;
  /** 资源是否走 `onMissing='GATE'` vs `THROW'`，默认 GATE */
  readonly onMissing?: 'GATE' | 'THROW';
  /** 加载并发，默认 4 */
  readonly concurrency?: number;
  /** 单 URL 超时 (ms)，默认 8000 */
  readonly timeoutMs?: number;
};

/**
 * runtime 主动发的事件。
 *
 * 注意：Phase 2 仅声明这些事件，Phaser 内部具体触发时机可在实现里细化。
 * 业务层只通过这些 tag 订阅，不依赖实现。
 */
export type RuntimeEvent =
  | 'boot' // 构造完成（DOM canvas attach 成功）
  | 'ready' // 首帧 ready
  | 'asset-loading' // 进度
  | 'asset-gate' // 缺资产触发
  | 'asset-ready'
  | 'asset-failed'
  | 'patch-applied'
  | 'cue-changed'
  | 'viewport-resized'
  | 'entity-interact' // 点击可交互 NPC / 物件
  | 'destroyed'
  | 'error';

export type RuntimeEventPayload = {
  boot: { container: HTMLElement };
  ready: { snapshot: RuntimeSnapshot };
  'asset-loading': { loaded: number; total: number };
  'asset-gate': { missing: readonly MissingAssetError[] };
  'asset-ready': { manifest: AssetManifest };
  'asset-failed': { missing: readonly MissingAssetError[] };
  'patch-applied': { patch: WorldDiffPatch; snapshot: RuntimeSnapshot };
  'cue-changed': { active: SpeechCue | null; queued: readonly SpeechCue[] };
  'viewport-resized': { viewport: ViewportSize; scale: number };
  'entity-interact': { entityId: string };
  destroyed: { ok: boolean };
  error: { message: string; kind: RuntimeError['kind']; cause?: unknown };
};

/** 事件 listener 类型（泛型），订阅时静态保证 payload 形状。 */
export type RuntimeEventListener<E extends RuntimeEvent> = (
  payload: RuntimeEventPayload[E],
) => void;

/**
 * StageRuntime 接口：业务唯一依赖。
 *
 * 所有"破坏性"操作（destroy / focusOn）显式列出；其余"非破坏性"
 * （applyWorldPatch / playCue / clearCue）幂等。
 */
export interface StageRuntime {
  /** 启动 runtime；返回 Promise，资源 ready 或 gate 时 resolve。 */
  boot(): Promise<void>;

  /** 当前完整快照（业务 / HUD 读取）。 */
  getSnapshot(): Readonly<RuntimeSnapshot>;

  /** 切换/加载 scene（map）。已加载则幂等。 */
  loadScene(sceneId: string, opts?: { readonly manifestUrl?: string }): Promise<void>;

  /** 卸载当前 scene。 */
  unloadScene(): Promise<void>;

  /** 应用一次 World diff（来自 diffRenderer.diffWorldPatch）。 */
  applyWorldPatch(patch: WorldDiffPatch): void;

  /** 推一条 cue 到队列；不立即展示，由 getSnapshot.activeCue 决定显示。 */
  playCue(cue: SpeechCue): void;

  /** 清除某个 actor 的 cue（含排队中的）。 */
  clearCue(actorId: string): void;

  /** 直接覆盖整个 cue 列表（主要用于 reconcile）。 */
  setSpeechCues(cues: readonly SpeechCue[]): void;

  /** 设置 viewport，重算整数倍 scale。 */
  resize(viewport: ViewportSize): void;

  /** 销毁 runtime；后续调用全部 no-op。 */
  destroy(): Promise<void>;

  /** 订阅事件。返回反订阅函数。 */
  on<E extends RuntimeEvent>(event: E, listener: RuntimeEventListener<E>): () => void;

  /** 取消订阅（event+listener 二元组）。 */
  off<E extends RuntimeEvent>(event: E, listener: RuntimeEventListener<E>): void;
}

/**
 * StageRuntime 工厂签名（业务用）。
 *
 * 业务代码（例如 GameShell）按"工厂"取实现，避免直接 import Phaser。
 * 单测可注入纯 fake runtime。
 */
export type StageRuntimeFactory = (opts: StageRuntimeOptions) => StageRuntime;

/** 初始空快照工具。 */
export function makeInitialSnapshot(viewport: ViewportSize): RuntimeSnapshot {
  return Object.freeze({
    status: 'idle',
    scene: null,
    assets: Object.freeze({
      status: 'pending',
      manifest: null,
      loadedCount: 0,
      totalCount: 0,
      missing: [],
    }),
    world: Object.freeze({
      stateVersion: 0,
      mapId: null,
      lastAppliedPatch: null,
    }),
    speech: Object.freeze({
      activeCue: null,
      activeAnchor: null,
      queued: [],
    }),
    viewport,
    lastError: null,
  });
}

/**
 * BaseStageRuntime：核心状态机 + 事件 + 快照。
 *
 * 设计：
 *  - 不依赖 Phaser，提供公共 emit/snapshot/setStatus 供子类复用。
 *  - 把所有"事件 / 状态修改"统一起来，避免子类散开实现导致不一致。
 *  - 简单的内存 storage；性能足够 Phase 2 门禁（≤2 NPC / ≤30 entities）。
 *
 * 不暴露给业务层；业务层走 StageRuntime 接口。
 */
export class BaseStageRuntime implements StageRuntime {
  readonly #listeners: Map<RuntimeEvent, Set<RuntimeEventListener<RuntimeEvent>>> = new Map();
  protected snapshot: RuntimeSnapshot;
  protected destroyed = false;

  constructor(initialViewport: ViewportSize) {
    this.snapshot = makeInitialSnapshot(initialViewport);
  }

  /** 子类 / 业务读取快照。 */
  getSnapshot(): Readonly<RuntimeSnapshot> {
    return this.snapshot;
  }

  boot(): Promise<void> {
    if (this.destroyed) return Promise.resolve();
    this.setStatus('ready');
    this.emit('ready', { snapshot: this.snapshot });
    return Promise.resolve();
  }

  loadScene(_sceneId: string): Promise<void> {
    if (this.destroyed) return Promise.resolve();
    return Promise.resolve();
  }

  unloadScene(): Promise<void> {
    if (this.destroyed) return Promise.resolve();
    this.snapshot = Object.freeze({ ...this.snapshot, scene: null });
    return Promise.resolve();
  }

  applyWorldPatch(patch: WorldDiffPatch): void {
    if (this.destroyed) return;
    const ids = [...patch.added.map((p) => p.entityId), ...patch.changed.map((p) => p.entityId)];
    this.snapshot = Object.freeze({
      ...this.snapshot,
      world: Object.freeze({
        stateVersion: patch.stateVersion,
        mapId: patch.mapId,
        lastAppliedPatch: patch,
      }),
      scene: Object.freeze({
        mapId: patch.mapId,
        manifestVersion: this.snapshot.scene?.manifestVersion ?? 1,
        entityIds: ids,
      }),
    });
    this.emit('patch-applied', { patch, snapshot: this.snapshot });
  }

  playCue(cue: SpeechCue): void {
    if (this.destroyed) return;
    // 同 actor 新发言覆盖旧句；多角色各自保留最新一条
    const queued = [...this.snapshot.speech.queued.filter((c) => c.actorId !== cue.actorId), cue];
    const active = queued.reduce<SpeechCue | null>((best, c) => {
      if (!best || c.startedAt >= best.startedAt) return c;
      return best;
    }, null);
    this.snapshot = Object.freeze({
      ...this.snapshot,
      speech: Object.freeze({
        activeCue: active,
        activeAnchor: active ? { x: 0, y: 0 } : null,
        queued,
      }),
    });
    this.emit('cue-changed', { active, queued });
  }

  clearCue(actorId: string): void {
    if (this.destroyed) return;
    const queued = this.snapshot.speech.queued.filter((c) => c.actorId !== actorId);
    const active = queued.reduce<SpeechCue | null>((best, c) => {
      if (!best || c.startedAt >= best.startedAt) return c;
      return best;
    }, null);
    this.snapshot = Object.freeze({
      ...this.snapshot,
      speech: Object.freeze({ activeCue: active, activeAnchor: null, queued }),
    });
    this.emit('cue-changed', { active, queued });
  }

  setSpeechCues(cues: readonly SpeechCue[]): void {
    if (this.destroyed) return;
    // 输入可能含同 actor 多条；折叠为每 actor 最新
    const byActor = new Map<string, SpeechCue>();
    for (const cue of cues) {
      if (cue.excerpt.length === 0) continue;
      const prev = byActor.get(cue.actorId);
      if (!prev || cue.startedAt >= prev.startedAt) {
        byActor.set(cue.actorId, cue);
      }
    }
    const queued = Object.freeze([...byActor.values()]);
    const active = queued.reduce<SpeechCue | null>((best, c) => {
      if (!best || c.startedAt >= best.startedAt) return c;
      return best;
    }, null);
    this.snapshot = Object.freeze({
      ...this.snapshot,
      speech: Object.freeze({
        activeCue: active,
        activeAnchor: null,
        queued,
      }),
    });
    this.emit('cue-changed', { active, queued });
  }

  resize(viewport: ViewportSize): void {
    if (this.destroyed) return;
    this.snapshot = Object.freeze({ ...this.snapshot, viewport });
    this.emit('viewport-resized', { viewport, scale: 1 });
  }

  destroy(): Promise<void> {
    if (this.destroyed) return Promise.resolve();
    this.destroyed = true;
    this.setStatus('destroyed');
    this.emit('destroyed', { ok: true });
    return Promise.resolve();
  }

  on<E extends RuntimeEvent>(event: E, listener: RuntimeEventListener<E>): () => void {
    const set = this.#listeners.get(event) ?? new Set();
    set.add(listener as RuntimeEventListener<RuntimeEvent>);
    this.#listeners.set(event, set);
    return () => this.off(event, listener);
  }

  off<E extends RuntimeEvent>(event: E, listener: RuntimeEventListener<E>): void {
    const set = this.#listeners.get(event);
    if (!set) return;
    set.delete(listener as RuntimeEventListener<RuntimeEvent>);
  }

  /** 公共 emit（protected 由 TS 标记；逻辑子类也可调）。 */
  protected emit<E extends RuntimeEvent>(event: E, payload: RuntimeEventPayload[E]): void {
    const set = this.#listeners.get(event);
    if (!set) return;
    for (const l of set) {
      try {
        (l as RuntimeEventListener<E>)(payload);
      } catch {
        // listener 错误被吞掉，避免阻塞 runtime 主循环
      }
    }
  }

  /** 公共 setStatus（protected）。 */
  protected setStatus(status: RuntimeSnapshot['status']): void {
    this.snapshot = Object.freeze({ ...this.snapshot, status });
  }
}
