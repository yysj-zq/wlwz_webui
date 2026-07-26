/**
 * Camera Director（Phase 2 VS7 Spec §相机导演）。
 *
 * 设计目标：
 *  - **运镜指令驱动**：UI 不直接操控相机；回合演出队列 enqueue 指令，
 *    CameraDirector 按优先级 / 时间推进。
 *  - **多模式并存**：
 *    - `free`：静止 / 等待输入
 *    - `follow`：跟随玩家 + 死区平滑（避免每帧抖动）
 *    - `focus`：推近说话者（回合演出）
 *    - `shake`：世界写入微震
 *    - `curtain`：场景进入的帘幕式揭示（y 平移 + alpha 隐藏 overlay）
 *  - **publicState 联动**：shake 幅度 / 死区 / focus zoom 可由 publicState
 *    覆盖（例：boss 战 → 死区放大）。
 *  - **不依赖 Phaser**：纯数据 + FSM；PhaserRuntime 通过订阅 snapshot
 *    调 camera.setScroll / setZoom。
 *  - **不破坏 StageRuntime 契约**：CameraDirector 只读 RuntimeSnapshot
 *    中 world.entities；不进 runtime 内部状态。
 */
import type { WorldEntity, WorldEntityPublicState, WorldState } from '@shared/api';
import type { RuntimeSnapshot, StageRuntime, StageRuntimeOptions } from '@shared/stage/runtime';

// ───────── types ─────────

export type CameraMode = 'free' | 'follow' | 'focus' | 'shake' | 'curtain';

/**
 * 摄像机位置（设计坐标系 / tile）。
 * 与 WorldEntity.position 同坐标系。
 */
export type CameraPosition = {
  readonly x: number;
  readonly y: number;
};

/**
 * 死区：在玩家周围 N×M tile 内不滚动（避免微小移动带动相机）。
 * `size.w/h` 单位是 tile；原点 = 玩家 position。
 */
export type Deadzone = {
  readonly w: number;
  readonly h: number;
};

/** focus 目标（说话者）。 */
export type FocusTarget = {
  readonly entityId: string;
  readonly position: CameraPosition;
};

/**
 * 运镜指令（§6 + §VS7）：
 *  - `follow`：默认指令；runtime 内部总会维持一条 follow，无显式 enqueue 也成立。
 *  - `focus`：回合演出；带 zoom 与 durationMs；过期回 follow。
 *  - `shake`：世界写入微震；幅度 + 持续时间。
 *  - `curtain`：场景进入；y 平移 + 持续时间。
 */
export type CameraDirective =
  | { readonly kind: 'follow'; readonly target: CameraPosition; readonly deadzone?: Deadzone }
  | {
      readonly kind: 'focus';
      readonly target: FocusTarget;
      readonly zoom: number;
      readonly durationMs: number;
    }
  | {
      readonly kind: 'shake';
      readonly amplitude: number;
      readonly durationMs: number;
      readonly frequencyHz?: number;
    }
  | {
      readonly kind: 'curtain';
      readonly fromY: number;
      readonly toY: number;
      readonly durationMs: number;
    };

/**
 * 摄像机公开快照 — 渲染层按它写 Phaser camera（scroll / zoom / shake）。
 */
export type CameraSnapshot = {
  readonly mode: CameraMode;
  readonly position: CameraPosition;
  readonly rawPosition: CameraPosition;
  readonly zoom: number;
  readonly deadzone: Deadzone;
  readonly shake: { readonly amplitude: number; readonly remainingMs: number } | null;
  readonly pendingCount: number;
  readonly followEntityId: string | null;
  readonly mapId: string | null;
};

/** 平滑插值参数（与 easing 无关，linear 即可）。 */
export type FollowEasing = 'linear' | 'easeOutCubic';

export type CameraDirectorOptions = {
  /** 起始 position；缺省 {0, 0}。 */
  readonly initialPosition?: CameraPosition;
  /** 起始 zoom；缺省 1。 */
  readonly initialZoom?: number;
  /** 默认 deadzone；缺省 {w:4, h:3}。 */
  readonly initialDeadzone?: Deadzone;
  /** follow 平滑系数 [0, 1]；缺省 0.18。越小越跟手。 */
  readonly followSmoothing?: number;
  /** focus / curtain 缓动模式。 */
  readonly easing?: FollowEasing;
};

// ───────── defaults ─────────

export const DEFAULT_FOLLOW_DEADZONE: Deadzone = Object.freeze({ w: 4, h: 3 });
export const DEFAULT_FOLLOW_SMOOTHING = 0.18;
export const DEFAULT_ZOOM = 1.0;
export const DEFAULT_FOCUS_ZOOM = 1.0;
export const SHAKE_AMPLITUDE_DEFAULT = 4;
export const CURTAIN_DEFAULT_DURATION_MS = 600;
export const FOCUS_DEFAULT_DURATION_MS = 1800;
export const SHAKE_DEFAULT_DURATION_MS = 220;

// ───────── publicState 扩展 ─────────

/**
 * 从 publicState 读取"相机参数覆写"。全部可选；用于：
 *  - boss 战：放大 deadzone 让玩家更主动控制
 *  - 切景：强制 curtain
 *  - 地震 / 巨变：增大 shake amplitude
 */
export type CameraPublicStateOverride = {
  readonly deadzone?: Deadzone;
  readonly shakeAmplitude?: number;
  readonly focusZoom?: number;
};

export function readCameraOverride(
  publicState: WorldEntityPublicState | null | undefined,
): CameraPublicStateOverride | null {
  if (!publicState || typeof publicState !== 'object') return null;
  const cam = (publicState as { readonly camera?: unknown }).camera;
  if (!cam || typeof cam !== 'object') return null;
  let deadzone: Deadzone | undefined;
  let shakeAmplitude: number | undefined;
  let focusZoom: number | undefined;
  const dz = (cam as { readonly deadzone?: unknown }).deadzone;
  if (dz && typeof dz === 'object') {
    const w = (dz as { readonly w?: unknown }).w;
    const h = (dz as { readonly h?: unknown }).h;
    if (typeof w === 'number' && typeof h === 'number' && w >= 0 && h >= 0) {
      deadzone = Object.freeze({ w, h });
    }
  }
  const amp = (cam as { readonly shakeAmplitude?: unknown }).shakeAmplitude;
  if (typeof amp === 'number' && amp >= 0) shakeAmplitude = amp;
  const fz = (cam as { readonly focusZoom?: unknown }).focusZoom;
  if (typeof fz === 'number' && fz >= 0) focusZoom = fz;
  if (deadzone === undefined && shakeAmplitude === undefined && focusZoom === undefined) {
    return null;
  }
  return Object.freeze({
    ...(deadzone !== undefined ? { deadzone } : {}),
    ...(shakeAmplitude !== undefined ? { shakeAmplitude } : {}),
    ...(focusZoom !== undefined ? { focusZoom } : {}),
  });
}

// ───────── easing ─────────

export function applyEasing(easing: FollowEasing, t: number): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  if (easing === 'easeOutCubic') {
    const inv = 1 - t;
    return 1 - inv * inv * inv;
  }
  return t;
}

// ───────── director ─────────

export type CameraListener = (snapshot: Readonly<CameraSnapshot>) => void;

type ActiveDirective =
  | {
      readonly kind: 'focus';
      readonly target: FocusTarget;
      readonly zoom: number;
      readonly startedAt: number;
      readonly durationMs: number;
    }
  | {
      readonly kind: 'shake';
      readonly amplitude: number;
      readonly startedAt: number;
      readonly durationMs: number;
      readonly frequencyHz: number;
    }
  | {
      readonly kind: 'curtain';
      readonly fromY: number;
      readonly toY: number;
      readonly startedAt: number;
      readonly durationMs: number;
    };

/**
 * CameraDirector — 指令队列 + 平滑跟随 + 快照订阅。
 *
 * 协作模式：
 *  - 调用方在 `tick(deltaMs, now)` 推进（建议每帧 / RAF）。
 *  - 调用方 enqueue 运镜指令；focus / shake / curtain 会按 durationMs
 *    自动结束（结束 → 回 follow / free）。
 *  - 调用方可选 `bindRuntime(runtime)` 让 director 自动从 runtime
 *    抽取 follow target；不绑则调用方自己 enqueue('follow', ...)。
 *
 * 不修改 StageRuntime 接口。
 */
export class CameraDirector {
  #position: CameraPosition;
  #rawPosition: CameraPosition;
  #zoom: number;
  #deadzone: Deadzone;
  #followSmoothing: number;
  #easing: FollowEasing;
  #followTarget: CameraPosition | null = null;
  #followEntityId: string | null = null;
  #queue: ActiveDirective[] = [];
  #mode: CameraMode = 'free';
  #shakeAmp = 0;
  #shakeRemaining = 0;
  #shakePhase = 0;
  #mapId: string | null = null;
  #snapshot: CameraSnapshot;
  readonly #listeners: Set<CameraListener> = new Set();
  #destroyed = false;

  constructor(options: CameraDirectorOptions = {}) {
    this.#position = options.initialPosition ?? { x: 0, y: 0 };
    this.#rawPosition = this.#position;
    this.#zoom = options.initialZoom ?? DEFAULT_ZOOM;
    this.#deadzone = options.initialDeadzone ?? DEFAULT_FOLLOW_DEADZONE;
    this.#followSmoothing = options.followSmoothing ?? DEFAULT_FOLLOW_SMOOTHING;
    this.#easing = options.easing ?? 'easeOutCubic';
    this.#snapshot = this.#buildSnapshot();
  }

  snapshot(): Readonly<CameraSnapshot> {
    return this.#snapshot;
  }

  /** 当前 mode（业务层做断言 / 调试用）。 */
  mode(): CameraMode {
    return this.#mode;
  }

  /**
   * 入队一条指令。
   *
   * 语义：
   *  - `focus`：替换当前 focus；若已有 focus，新指令覆盖（避免叠加）
   *  - `shake`：若已有 shake，叠加 amplitude（取大）并重置剩余时间
   *  - `curtain`：替换当前 curtain；同 focus
   *  - `follow`：直接覆盖目标（下一 tick 起平滑跟随）
   */
  enqueue(directive: CameraDirective): void {
    if (this.#destroyed) return;
    switch (directive.kind) {
      case 'follow':
        this.#followTarget = directive.target;
        if (directive.deadzone) this.#deadzone = directive.deadzone;
        // follow 不进 queue；#mode 切回 follow（如非 focus/curtain 占用）
        if (this.#mode !== 'focus' && this.#mode !== 'curtain') {
          this.#mode = 'follow';
          this.#commit();
        }
        return;
      case 'focus': {
        const next: ActiveDirective = {
          kind: 'focus',
          target: directive.target,
          zoom: directive.zoom,
          startedAt: -1, // 由 tick 首次触发时填 now
          durationMs: directive.durationMs,
        };
        // 替换既有 focus
        this.#queue = this.#queue.filter((d) => d.kind !== 'focus');
        this.#queue.unshift(next);
        this.#mode = 'focus';
        this.#commit();
        return;
      }
      case 'shake': {
        const next: ActiveDirective = {
          kind: 'shake',
          amplitude: directive.amplitude,
          startedAt: -1,
          durationMs: directive.durationMs,
          frequencyHz: directive.frequencyHz ?? 30,
        };
        // 合并：同 kind 取 max amplitude + 重置 duration（不可变：用替换）
        const existingIdx = this.#queue.findIndex((d) => d.kind === 'shake');
        const existing = existingIdx >= 0 ? this.#queue[existingIdx] : undefined;
        if (existing && existing.kind === 'shake') {
          this.#queue[existingIdx] = {
            kind: 'shake',
            amplitude: Math.max(existing.amplitude, next.amplitude),
            startedAt: -1,
            durationMs: Math.max(existing.durationMs, next.durationMs),
            frequencyHz: existing.frequencyHz,
          };
        } else {
          this.#queue.push(next);
        }
        if (this.#mode === 'free' || this.#mode === 'follow') {
          this.#mode = 'shake';
          this.#commit();
        }
        return;
      }
      case 'curtain': {
        const next: ActiveDirective = {
          kind: 'curtain',
          fromY: directive.fromY,
          toY: directive.toY,
          startedAt: -1,
          durationMs: directive.durationMs,
        };
        this.#queue = this.#queue.filter((d) => d.kind !== 'curtain');
        this.#queue.unshift(next);
        this.#mode = 'curtain';
        this.#commit();
        return;
      }
      default: {
        // exhaustive：保持 strict
        const _exhaustive: never = directive;
        void _exhaustive;
      }
    }
  }

  /**
   * 把 director 绑到 StageRuntime。
   *
   * 设计：
   *  - 不订阅 'patch-applied' 来"自动设 follow target" — 因为 patch
   *    可能没有"玩家"实体；调用方传 `followEntityId` 即可（默认 'player'）。
   *  - 调用方在每帧：
   *    `director.followEntity(entity.position, 'player')`
   *    `director.tick(deltaMs, now)`
   *  - 这里仅提供一个轻便 helper：fromWorldState(...) 用于从
   *    RuntimeSnapshot.world 抽出玩家 position（兼容 WorldEntity）。
   */
  followEntity(position: CameraPosition, entityId: string | null = null): void {
    if (this.#destroyed) return;
    this.#followTarget = position;
    this.#followEntityId = entityId;
    if (this.#mode !== 'focus' && this.#mode !== 'curtain') {
      this.#mode = 'follow';
    }
    this.#commit();
  }

  /**
   * 应用 publicState 覆写（deadzone / shakeAmplitude / focusZoom）。
   * 仅覆盖存在的字段；幂等。
   */
  applyPublicState(publicState: WorldEntityPublicState | null | undefined): void {
    if (this.#destroyed) return;
    const override = readCameraOverride(publicState);
    if (!override) return;
    let changed = false;
    if (override.deadzone && !deadzoneEqual(override.deadzone, this.#deadzone)) {
      this.#deadzone = override.deadzone;
      changed = true;
    }
    if (override.shakeAmplitude !== undefined && override.shakeAmplitude !== this.#shakeAmp) {
      this.#shakeAmp = override.shakeAmplitude;
      changed = true;
    }
    if (override.focusZoom !== undefined && override.focusZoom !== this.#zoom) {
      // focus zoom 仅在 mode=focus 时生效；这里只缓存，影响下次 focus
      this.#zoom = override.focusZoom;
      changed = true;
    }
    if (changed) this.#commit();
  }

  /**
   * 从 RuntimeSnapshot.world.lastAppliedPatch 中找玩家 entity。
   * 返回 `{ id, position }` 或 `null`。
   *
   * 约定：`playerActorId` 缺省回退到 `'player'`。
   */
  resolveFollowTargetFromRuntime(
    snapshot: Readonly<RuntimeSnapshot>,
    playerActorId: string = 'player',
  ): { id: string; position: CameraPosition } | null {
    const world = snapshot.world;
    if (!world.lastAppliedPatch) return null;
    const all = [...world.lastAppliedPatch.added, ...world.lastAppliedPatch.changed];
    for (const p of all) {
      if (!p.entity) continue;
      if (p.entity.id === playerActorId) {
        if (p.entity.position) {
          return {
            id: p.entity.id,
            position: { x: p.entity.position.x, y: p.entity.position.y },
          };
        }
      }
    }
    return null;
  }

  /**
   * 推进相机。
   *
   *  - 推进 active directive（focus / shake / curtain）剩余时间
   *  - 若无 active，按 follow 平滑插值到 #followTarget
   *  - shake 在剩余时间内叠加位置偏移（rawPosition 不变，position 偏移）
   */
  tick(deltaMs: number, now: number): void {
    if (this.#destroyed) return;
    if (!Number.isFinite(deltaMs) || deltaMs < 0) return;
    let dirty = false;

    // 1) 推进 active directives
    const remaining: ActiveDirective[] = [];
    for (const d of this.#queue) {
      if (d.startedAt < 0) {
        const startedAt = now;
        if (d.kind === 'focus') {
          this.#rawPosition = { x: d.target.position.x, y: d.target.position.y };
          this.#position = this.#rawPosition;
          this.#zoom = d.zoom;
          dirty = true;
          remaining.push({ ...d, startedAt });
          continue;
        }
        if (d.kind === 'curtain') {
          // x 锚定 follow 目标（切景 spawn / 玩家）；y 做帘幕平移
          const anchorX = this.#followTarget?.x ?? this.#position.x;
          this.#rawPosition = { x: anchorX, y: d.fromY };
          this.#position = this.#rawPosition;
          dirty = true;
          remaining.push({ ...d, startedAt });
          continue;
        }
        if (d.kind === 'shake') {
          this.#shakeAmp = Math.max(this.#shakeAmp, d.amplitude);
          this.#shakeRemaining = d.durationMs;
          this.#shakePhase = 0;
          dirty = true;
          remaining.push({ ...d, startedAt });
          continue;
        }
      }
      const elapsed = now - d.startedAt;
      if (elapsed >= d.durationMs) {
        // 结束：focus → 回到 follow；curtain → 终态（toY）
        if (d.kind === 'focus') {
          this.#zoom = DEFAULT_ZOOM;
          if (this.#followTarget) this.#mode = 'follow';
          else this.#mode = 'free';
        }
        if (d.kind === 'curtain') {
          this.#rawPosition = { ...this.#rawPosition, y: d.toY };
          this.#position = this.#rawPosition;
          if (this.#followTarget) this.#mode = 'follow';
          else this.#mode = 'free';
        }
        if (d.kind === 'shake') {
          this.#shakeAmp = 0;
          this.#shakeRemaining = 0;
          if (this.#followTarget) this.#mode = 'follow';
          else this.#mode = 'free';
        }
        dirty = true;
        continue;
      }
      // 进行中
      const t = elapsed / d.durationMs;
      if (d.kind === 'focus') {
        // 平滑插值到 target（zoom 按 easing）
        const k = applyEasing(this.#easing, t);
        const tx = d.target.position.x;
        const ty = d.target.position.y;
        const tz = d.zoom;
        this.#rawPosition = {
          x: lerp(this.#rawPosition.x, tx, k),
          y: lerp(this.#rawPosition.y, ty, k),
        };
        this.#zoom = lerp(this.#zoom, tz, k);
        dirty = true;
        remaining.push(d);
        continue;
      }
      if (d.kind === 'curtain') {
        const k = applyEasing(this.#easing, t);
        const targetY = lerp(d.fromY, d.toY, k);
        const anchorX = this.#followTarget?.x ?? this.#rawPosition.x;
        this.#rawPosition = { x: anchorX, y: targetY };
        dirty = true;
        remaining.push(d);
        continue;
      }
      if (d.kind === 'shake') {
        this.#shakeRemaining = d.durationMs - elapsed;
        this.#shakePhase += (deltaMs * (d.frequencyHz * Math.PI * 2)) / 1000;
        dirty = true;
        remaining.push(d);
        continue;
      }
    }
    this.#queue = remaining;

    // 2) follow 平滑
    if (
      this.#followTarget &&
      (this.#mode === 'follow' || this.#mode === 'free' || this.#mode === 'shake')
    ) {
      const target = this.#followTarget;
      // 死区：若 target 在死区内则 #rawPosition 不动；否则 #rawPosition 平滑趋向 target
      const dx = target.x - this.#rawPosition.x;
      const dy = target.y - this.#rawPosition.y;
      const halfW = this.#deadzone.w / 2;
      const halfH = this.#deadzone.h / 2;
      const clampedX = Math.abs(dx) > halfW ? dx - Math.sign(dx) * halfW : 0;
      const clampedY = Math.abs(dy) > halfH ? dy - Math.sign(dy) * halfH : 0;
      const k = 1 - Math.pow(1 - this.#followSmoothing, deltaMs / 16);
      if (clampedX !== 0 || clampedY !== 0) {
        this.#rawPosition = {
          x: this.#rawPosition.x + clampedX * k,
          y: this.#rawPosition.y + clampedY * k,
        };
        dirty = true;
      }
      if (this.#mode === 'free') this.#mode = 'follow';
    }

    // 3) shake 偏移
    if (this.#shakeAmp > 0 && this.#shakeRemaining > 0) {
      const offsetX = Math.sin(this.#shakePhase) * this.#shakeAmp;
      const offsetY = Math.cos(this.#shakePhase * 0.83) * this.#shakeAmp;
      this.#position = {
        x: this.#rawPosition.x + offsetX,
        y: this.#rawPosition.y + offsetY,
      };
      dirty = true;
    } else {
      this.#position = this.#rawPosition;
    }

    if (dirty) this.#commit();
  }

  subscribe(listener: CameraListener): () => void {
    this.#listeners.add(listener);
    listener(this.#snapshot);
    return () => {
      this.#listeners.delete(listener);
    };
  }

  /** 由 GameShell 在 loadScene 时调一次。 */
  setMapId(mapId: string | null): void {
    if (this.#destroyed) return;
    if (this.#mapId === mapId) return;
    this.#mapId = mapId;
    this.#commit();
  }

  destroy(): void {
    if (this.#destroyed) return;
    this.#destroyed = true;
    this.#listeners.clear();
    this.#queue = [];
    this.#followTarget = null;
    this.#followEntityId = null;
  }

  // ───────── internals ─────────

  #buildSnapshot(): CameraSnapshot {
    return Object.freeze({
      mode: this.#mode,
      position: this.#position,
      rawPosition: this.#rawPosition,
      zoom: this.#zoom,
      deadzone: this.#deadzone,
      shake:
        this.#shakeAmp > 0 && this.#shakeRemaining > 0
          ? Object.freeze({
              amplitude: this.#shakeAmp,
              remainingMs: this.#shakeRemaining,
            })
          : null,
      pendingCount: this.#queue.length,
      followEntityId: this.#followEntityId,
      mapId: this.#mapId,
    });
  }

  #commit(): void {
    this.#snapshot = this.#buildSnapshot();
    for (const listener of this.#listeners) {
      try {
        listener(this.#snapshot);
      } catch {
        // 吞 listener 错误
      }
    }
  }
}

/** 工厂。 */
export function createCameraDirector(options?: CameraDirectorOptions): CameraDirector {
  return new CameraDirector(options);
}

// ───────── helpers ─────────

function lerp(a: number, b: number, k: number): number {
  return a + (b - a) * k;
}

function deadzoneEqual(a: Deadzone, b: Deadzone): boolean {
  return a.w === b.w && a.h === b.h;
}

// ───────── integration: bind to StageRuntime ─────────

/**
 * 一个开箱即用的辅助：在 `patch-applied` 事件里自动把玩家位置喂给 director。
 *
 * 调用：
 * ```ts
 * const off = bindCameraDirectorToRuntime(director, runtime);
 * // ... 卸载时 off()
 * ```
 *
 * 注意：本函数**仅**绑定 patch-applied 事件，不改 StageRuntime 接口；
 * 不需要 director.enqueue('follow', ...) 也能跟随玩家。
 */
export function bindCameraDirectorToRuntime(
  director: CameraDirector,
  runtime: StageRuntime,
  playerActorId: string = 'player',
): () => void {
  return runtime.on('patch-applied', (payload) => {
    const target = director.resolveFollowTargetFromRuntime(payload.snapshot, playerActorId);
    if (target) {
      director.followEntity(target.position, target.id);
      director.setMapId(payload.snapshot.world.mapId);
    }
  });
}

/**
 * 把 RuntimeSnapshot.world.lastAppliedPatch + cue → director 指令。
 *
 * 建议在 `cue-changed` 事件里调一次：
 *   - 玩家说话 → director.enqueue({ kind:'focus', ... })
 *   - world 写入 → director.enqueue({ kind:'shake', amplitude: 2, ... })
 *
 * 这里提供一个**纯函数**版本，避免隐式副作用：
 *   `directivesFromRuntimeSnapshot(snapshot, ...)` 返回待入队指令数组。
 */
export function directivesFromRuntimeSnapshot(
  snapshot: Readonly<RuntimeSnapshot>,
  opts?: {
    readonly focusZoom?: number;
    readonly shakeAmplitude?: number;
    readonly focusDurationMs?: number;
    readonly shakeDurationMs?: number;
  },
): CameraDirective[] {
  const patch = snapshot.world.lastAppliedPatch;
  const out: CameraDirective[] = [];
  if (!patch) return out;
  const focusZoom = opts?.focusZoom ?? DEFAULT_FOCUS_ZOOM;
  const shakeAmp = opts?.shakeAmplitude ?? SHAKE_AMPLITUDE_DEFAULT;
  const focusDur = opts?.focusDurationMs ?? FOCUS_DEFAULT_DURATION_MS;
  const shakeDur = opts?.shakeDurationMs ?? SHAKE_DEFAULT_DURATION_MS;

  // 有 changed：世界写入 → shake
  if (patch.changed.length > 0) {
    out.push({ kind: 'shake', amplitude: shakeAmp, durationMs: shakeDur });
  }

  // 当前 speaking actor → focus
  const active = snapshot.speech.activeCue;
  if (active) {
    const all = [...patch.added, ...patch.changed];
    for (const p of all) {
      if (p.entity && p.entity.id === active.actorId && p.entity.position) {
        out.push({
          kind: 'focus',
          target: {
            entityId: p.entity.id,
            position: { x: p.entity.position.x, y: p.entity.position.y },
          },
          zoom: focusZoom,
          durationMs: focusDur,
        });
        break;
      }
    }
  }

  return out;
}

/**
 * 工厂：在 `cue-changed` / `patch-applied` 时自动 enqueue 指令。
 * 返回反订阅函数。
 *
 * 注意：本函数只是把 `directivesFromRuntimeSnapshot` 的产物入队，
 * 不会替代 GameShell 的回合演出决策。
 */
export function autoEnqueueFromRuntime(
  director: CameraDirector,
  runtime: StageRuntime,
  playerActorId: string = 'player',
  options?: Parameters<typeof directivesFromRuntimeSnapshot>[1],
): () => void {
  const off1 = runtime.on('cue-changed', (payload) => {
    const snap = runtime.getSnapshot();
    const patch = snap.world.lastAppliedPatch;
    if (!patch) return;
    const active = payload.active;
    if (!active) return;
    for (const p of [...patch.added, ...patch.changed]) {
      if (p.entity && p.entity.id === active.actorId && p.entity.position) {
        director.enqueue({
          kind: 'focus',
          target: {
            entityId: p.entity.id,
            position: { x: p.entity.position.x, y: p.entity.position.y },
          },
          zoom: options?.focusZoom ?? DEFAULT_FOCUS_ZOOM,
          durationMs: options?.focusDurationMs ?? FOCUS_DEFAULT_DURATION_MS,
        });
        break;
      }
    }
  });
  const off2 = bindCameraDirectorToRuntime(director, runtime, playerActorId);
  return () => {
    off1();
    off2();
  };
}

/**
 * 一个 demo 用 helper：把 WorldState（API）→ 与 RuntimeSnapshot.world 兼容的最小视图。
 * 主要在测试 / 不绑定 runtime 的场景里使用。
 */
export function cameraFollowTargetFromWorldState(
  world: WorldState | null | undefined,
  playerActorId: string = 'player',
): { entityId: string; position: CameraPosition } | null {
  if (!world || !world.entities) return null;
  const id = world.playerActorId ?? playerActorId;
  const ent: WorldEntity | undefined = world.entities[id];
  if (!ent || !ent.position) return null;
  return {
    entityId: ent.id,
    position: { x: ent.position.x, y: ent.position.y },
  };
}

// ───────── StageRuntime contract 工具：避免 StageRuntimeOptions 误用 ─────────

/**
 * 在 strict TS 下，StageRuntimeOptions 是从 StageRuntime 模块导出；
 * 这里 re-export 一个空类型别名，仅做"防止被遗漏 import"的占位。
 */
export type { StageRuntime, StageRuntimeOptions };
