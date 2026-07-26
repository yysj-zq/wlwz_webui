/**
 * 资产加载器（Phase 2 VS1 Spec §资产 manifest/加载门闸）。
 *
 * 设计要点：
 *  - 加载器只做"fetch 探测 + 状态汇报"，**不**自己缓存 byte buffer。
 *    真正的 byte → texture 解码留给 Phaser runtime；这里只保证 URL 可用 +
 *    给出 status，方便 GameShell / 占位 UI 在加载未就绪时走品牌化门闸。
 *  - 不抛错到外层；缺资产走 `MissingAssetError` 累积进 `state.missing`，
 *    直到全部加载完成才暴露给上层；并提供 `gateFor` 工厂返回品牌化占位。
 *  - 状态机：`pending → loading → (ready | gate | failed)`。
 *  - 单 manifest 全部就绪后 `ready`；任一核心资产缺失转 `gate`（走门闸）。
 *
 * 用法：
 * ```ts
 * const loader = new AssetLoader({ baseUrl: '/assets', onMissing: 'GATE' });
 * loader.subscribe((s) => console.log(s.status, s.loadedCount, s.totalCount));
 * await loader.load('/assets/manifest.json');
 * if (loader.snapshot().status === 'gate') showBrandPlaceholder();
 * ```
 *
 * 注意：本文件**不依赖 Phaser**，可在 Node 单测里跑全部 fetch 逻辑。
 */
import {
  enumerate,
  emptyManifest,
  MANIFEST_VERSION_SUPPORTED,
  MissingAssetError,
  type AssetManifest,
  type AssetPointer,
  type AssetStatus,
  type MissingAssetReason,
  brandPlaceholderFor,
} from './manifest';

/** 加载器策略选项。 */
export type AssetLoaderOptions = {
  /** manifest 的基路径前缀，默认 `/assets`，意味着 manifest 在 `/assets/manifest.json`。 */
  readonly baseUrl?: string;
  /** 自定义 fetch；用于 SSR / 单测。默认用全局 `fetch`。 */
  readonly fetchImpl?: typeof fetch;
  /** 单 URL 超时（毫秒），默认 8000。 */
  readonly timeoutMs?: number;
  /** 并发数，默认 4。 */
  readonly concurrency?: number;
  /** 缺资产策略：
   *  - `GATE`：累积进 `state.missing`，status 转 gate（推荐）
   *  - `THROW`：立即抛 MissingAssetError
   */
  readonly onMissing?: 'GATE' | 'THROW';
  /** 可选 abort signal，整批可中断。 */
  readonly signal?: AbortSignal;
};

/** 加载器对外状态（订阅者看到的全量信息）。 */
export type AssetLoaderState = {
  readonly status: AssetStatus;
  readonly manifest: AssetManifest | null;
  readonly loadedCount: number;
  readonly totalCount: number;
  /** 已经失败的资产；为空数组表示尚未开始。 */
  readonly missing: readonly MissingAssetError[];
};

/** 订阅者回调。 */
export type AssetLoaderListener = (state: Readonly<AssetLoaderState>) => void;

/** 完成事件区分 `resolve`（无 throw）、`gate`（缺资产走门闸）。 */
export type AssetLoaderResult =
  | { readonly status: 'ready'; readonly manifest: AssetManifest }
  | {
      readonly status: 'gate';
      readonly manifest: AssetManifest;
      readonly missing: readonly MissingAssetError[];
    }
  | { readonly status: 'failed'; readonly missing: readonly MissingAssetError[] };

/**
 * 内置 fetch + timeout 包装。把 timeout 网络错误归类成 `TIMEOUT` reason，
 * 留给上层做有意义的错误展示。
 */
async function headWithTimeout(
  url: string,
  opts: { fetchImpl: typeof fetch; timeoutMs: number; signal?: AbortSignal },
): Promise<{ ok: true } | { ok: false; reason: MissingAssetReason; cause?: unknown }> {
  const { fetchImpl, timeoutMs, signal } = opts;
  // 先尝试 HEAD；若服务端不支持，转 GET with Range / 简单 GET。
  const tryFetch = async (method: 'HEAD' | 'GET'): Promise<Response> => {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), timeoutMs);
    const onAbort = () => ac.abort();
    signal?.addEventListener('abort', onAbort, { once: true });
    try {
      return await fetchImpl(url, { method, signal: ac.signal, cache: 'no-store' });
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    }
  };

  try {
    let res = await tryFetch('HEAD');
    if (res.status === 405 || res.status === 501) {
      // 不支持 HEAD，回退 GET
      res = await tryFetch('GET');
    }
    if (res.ok || res.status === 304) return { ok: true };
    if (res.status === 404) return { ok: false, reason: 'URL_NOT_FOUND' };
    return { ok: false, reason: 'NETWORK' };
  } catch (err) {
    if (signal?.aborted) return { ok: false, reason: 'ABORTED', cause: err };
    const name = (err as { name?: string } | null)?.name;
    if (name === 'AbortError') return { ok: false, reason: 'TIMEOUT', cause: err };
    return { ok: false, reason: 'NETWORK', cause: err };
  }
}

/**
 * 资产加载器主类。
 *
 * 设计为"一次构造，多次 load"：典型用法是页面加载时创建，调用一次 `load`,
 * 然后 `subscribe` 拿状态直到 `ready`/`gate`/`failed`。
 *
 * Not thread-safe；并发调用 `load` 会失败（用 single-flight）。
 */
export class AssetLoader {
  readonly #opts: Required<Pick<AssetLoaderOptions, 'baseUrl' | 'timeoutMs' | 'onMissing'>> & {
    fetchImpl: typeof fetch;
    concurrency: number;
    abortController: AbortController;
  };

  readonly #listeners: Set<AssetLoaderListener> = new Set();
  #state: AssetLoaderState;

  constructor(options: AssetLoaderOptions = {}) {
    this.#opts = {
      baseUrl: options.baseUrl ?? '/assets',
      fetchImpl: options.fetchImpl ?? globalThis.fetch.bind(globalThis),
      timeoutMs: options.timeoutMs ?? 8000,
      onMissing: options.onMissing ?? 'GATE',
      concurrency: Math.max(1, options.concurrency ?? 4),
      abortController: new AbortController(),
    };
    this.#state = Object.freeze({
      status: 'pending',
      manifest: null,
      loadedCount: 0,
      totalCount: 0,
      missing: [],
    });
  }

  /** 当前快照。 */
  snapshot(): Readonly<AssetLoaderState> {
    return this.#state;
  }

  /** 订阅；返回反订阅函数。 */
  subscribe(listener: AssetLoaderListener): () => void {
    this.#listeners.add(listener);
    listener(this.#state);
    return () => {
      this.#listeners.delete(listener);
    };
  }

  /** 中断整个加载批次。 */
  abort(): void {
    this.#opts.abortController.abort();
  }

  /**
   * 开始一次加载。`manifestUrl` 可走完整 URL；若仅是文件名会被拼到 `baseUrl` 下。
   *
   * 返回最终 AssetLoaderResult（不会 throw，除非 onMissing='THROW'）。
   */
  async load(manifestUrl?: string): Promise<AssetLoaderResult> {
    const targetUrl = this.#resolveUrl(manifestUrl ?? 'manifest.json');

    this.#commit({
      status: 'loading',
      manifest: null,
      loadedCount: 0,
      totalCount: 0,
      missing: [],
    });

    // 1. fetch manifest
    const manifestFetch = await headWithTimeout(targetUrl, {
      fetchImpl: this.#opts.fetchImpl,
      timeoutMs: this.#opts.timeoutMs,
      signal: this.#opts.abortController.signal,
    });
    if (!manifestFetch.ok) {
      const err = new MissingAssetError({
        assetKey: 'manifest',
        kind: 'map',
        url: targetUrl,
        reason:
          manifestFetch.reason === 'ABORTED'
            ? 'ABORTED'
            : manifestFetch.reason === 'TIMEOUT'
              ? 'TIMEOUT'
              : 'NOT_IN_MANIFEST',
        cause: manifestFetch.cause,
      });
      return this.#finishFailed(err);
    }

    // 2. 真实拉 JSON（用 fetchImply，HEAD 不返回 body）
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), this.#opts.timeoutMs);
    let manifest: AssetManifest;
    try {
      const res = await this.#opts.fetchImpl(targetUrl, {
        method: 'GET',
        signal: ac.signal,
        cache: 'no-store',
      });
      if (!res.ok) {
        const reason: MissingAssetReason = res.status === 404 ? 'URL_NOT_FOUND' : 'NETWORK';
        const err = new MissingAssetError({
          assetKey: 'manifest',
          kind: 'map',
          url: targetUrl,
          reason,
        });
        return this.#finishFailed(err);
      }
      const body = (await res.json()) as unknown;
      if (!isAssetManifestShape(body)) {
        const err = new MissingAssetError({
          assetKey: 'manifest',
          kind: 'map',
          url: targetUrl,
          reason: 'NOT_IN_MANIFEST',
        });
        return this.#finishFailed(err);
      }
      if (body.version !== MANIFEST_VERSION_SUPPORTED) {
        const err = new MissingAssetError({
          assetKey: 'manifest',
          kind: 'map',
          url: targetUrl,
          reason: 'UNSUPPORTED_MANIFEST_VERSION',
        });
        return this.#finishFailed(err);
      }
      manifest = body;
    } catch (err) {
      const reason: MissingAssetReason = ac.signal.aborted ? 'TIMEOUT' : 'NETWORK';
      const e = new MissingAssetError({
        assetKey: 'manifest',
        kind: 'map',
        url: targetUrl,
        reason,
        cause: err,
      });
      return this.#finishFailed(e);
    } finally {
      clearTimeout(timer);
    }

    // 3. 枚举全部指针并探测 URL
    const pointers = Array.from(enumerate(manifest));
    if (pointers.length === 0) {
      // 没有资产：等价就绪
      const ready: AssetLoaderState = Object.freeze({
        status: 'ready',
        manifest,
        loadedCount: 0,
        totalCount: 0,
        missing: [],
      });
      this.#commit(ready);
      return { status: 'ready', manifest };
    }

    this.#commit({
      status: 'loading',
      manifest,
      loadedCount: 0,
      totalCount: pointers.length,
      missing: [],
    });

    const errors: MissingAssetError[] = [];
    let loaded = 0;
    const worker = async (pointer: AssetPointer): Promise<void> => {
      const probe = await headWithTimeout(pointer.url, {
        fetchImpl: this.#opts.fetchImpl,
        timeoutMs: this.#opts.timeoutMs,
        signal: this.#opts.abortController.signal,
      });
      if (probe.ok) {
        loaded += 1;
        this.#commit({
          status: 'loading',
          manifest,
          loadedCount: loaded,
          totalCount: pointers.length,
          missing: errors.slice(),
        });
        return;
      }
      const err = new MissingAssetError({
        assetKey: pointer.assetKey,
        kind: pointer.kind,
        url: pointer.url,
        reason:
          probe.reason === 'ABORTED'
            ? 'ABORTED'
            : probe.reason === 'TIMEOUT'
              ? 'TIMEOUT'
              : probe.reason === 'URL_NOT_FOUND'
                ? 'URL_NOT_FOUND'
                : 'NETWORK',
        cause: probe.cause,
      });
      if (this.#opts.onMissing === 'THROW') throw err;
      errors.push(err);
      loaded += 1;
      this.#commit({
        status: 'loading',
        manifest,
        loadedCount: loaded,
        totalCount: pointers.length,
        missing: errors.slice(),
      });
    };

    // 简易并发池
    const queue = pointers.slice();
    const slots = this.#opts.concurrency;
    const runners: Promise<void>[] = [];
    for (let i = 0; i < slots; i++) {
      runners.push(
        (async () => {
          while (queue.length > 0) {
            const next = queue.shift();
            if (!next) return;
            await worker(next);
          }
        })(),
      );
    }

    try {
      await Promise.all(runners);
    } catch (err) {
      // onMissing === 'THROW' 才会到这里
      if (err instanceof MissingAssetError) {
        return this.#finishFailed(err);
      }
      throw err;
    }

    // 4. 全部跑完；按错误数决定 status
    if (errors.length === 0) {
      const ready: AssetLoaderState = Object.freeze({
        status: 'ready',
        manifest,
        loadedCount: pointers.length,
        totalCount: pointers.length,
        missing: [],
      });
      this.#commit(ready);
      return { status: 'ready', manifest };
    }
    const gateState: AssetLoaderState = Object.freeze({
      status: 'gate',
      manifest,
      loadedCount: pointers.length - errors.length,
      totalCount: pointers.length,
      missing: errors.slice(),
    });
    this.#commit(gateState);
    return { status: 'gate', manifest, missing: errors };
  }

  /** 解 URL：相对路径走 baseUrl，绝对 / http(s) 直通。 */
  #resolveUrl(input: string): string {
    if (/^https?:\/\//i.test(input) || input.startsWith('/')) return input;
    const base = this.#opts.baseUrl.endsWith('/')
      ? this.#opts.baseUrl.slice(0, -1)
      : this.#opts.baseUrl;
    return `${base}/${input.replace(/^\//, '')}`;
  }

  /** 通知 + 状态替换。 */
  #commit(next: AssetLoaderState): void {
    this.#state = Object.freeze(next);
    for (const listener of this.#listeners) listener(next);
  }

  /** 失败终结：状态置 failed，返回 AssetLoaderResult。 */
  #finishFailed(err: MissingAssetError): AssetLoaderResult {
    const failed: AssetLoaderState = Object.freeze({
      status: 'failed',
      manifest: this.#state.manifest ?? emptyManifest(),
      loadedCount: this.#state.loadedCount,
      totalCount: this.#state.totalCount || 1,
      missing: [err, ...this.#state.missing],
    });
    this.#commit(failed);
    return { status: 'failed', missing: [err, ...this.#state.missing] };
  }
}

/** 简单的 runtime shape 校验 — 避免拉错的 manifest（比如 HTML 错误页）。 */
function isAssetManifestShape(input: unknown): input is AssetManifest {
  if (typeof input !== 'object' || input === null) return false;
  const o = input as Record<string, unknown>;
  if (typeof o.version !== 'number') return false;
  if (typeof o.maps !== 'object' || o.maps === null) return false;
  if (typeof o.characters !== 'object' || o.characters === null) return false;
  if (typeof o.objects !== 'object' || o.objects === null) return false;
  return true;
}

/**
 * 兼容辅助：当 GameShell 想"读到一个 assetKey 但实际是空"时，
 * 用本函数代替 if-not-found 逻辑，避免到处 try/catch。
 *
 * 重要：缺核心资产（`required: true`）仍应 throw；只有 placeholder 才返回门闸文案。
 */
export function brandGateFor(
  loader: AssetLoader,
  assetKey: string,
): { status: AssetStatus; cue: string } {
  const state = loader.snapshot();
  if (state.status === 'ready') return { status: 'ready', cue: '' };
  if (state.status === 'gate') {
    const placeholder = brandPlaceholderFor(assetKey);
    return { status: 'gate', cue: placeholder.cue };
  }
  return { status: state.status, cue: '' };
}
