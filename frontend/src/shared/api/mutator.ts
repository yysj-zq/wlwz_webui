/**
 * 自定义 fetch mutator：把 orval 生成的相对 path 统一封装为
 *  - 注入 baseURL（VITE_API_BASE_URL，仅 origin，例如 http://localhost:8081）
 *  - 注入 Authorization header（从 localStorage 读 token）
 *  - JSON 序列化
 *  - 错误统一抛 ApiError（401 清 token + 派发 auth:unauthorized）
 *
 * OpenAPI paths 已带 `/api` 前缀（如 `/api/auth/login`），因此
 * `VITE_API_BASE_URL` 不要再带 `/api`，否则会变成 `/api/api/...`。
 */

function resolveApiBaseUrl(): string {
  const raw = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim();
  const base = raw && raw.length > 0 ? raw : 'http://localhost:8081';
  return base.replace(/\/+$/, '');
}

const API_BASE_URL = resolveApiBaseUrl();

const TOKEN_STORAGE_KEY = 'webui2.auth.token';

export function getStoredToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setStoredToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(TOKEN_STORAGE_KEY, token);
    else localStorage.removeItem(TOKEN_STORAGE_KEY);
  } catch {
    /* localStorage unavailable (SSR / privacy mode) — silently ignore */
  }
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly body?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export interface CustomRequestConfig {
  url: string;
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';
  params?: Record<string, string | number | boolean | undefined | null> | undefined;
  data?: unknown;
  responseType?: 'json' | 'blob' | 'text';
  signal?: AbortSignal;
  headers?: Record<string, string>;
}

function joinUrl(base: string, path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${base}${normalizedPath}`;
}

export async function customInstance<T>(config: CustomRequestConfig): Promise<T> {
  const url = joinUrl(API_BASE_URL, config.url);

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...config.headers,
  };
  const token = getStoredToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const init: RequestInit = {
    method: (config.method ?? 'GET').toUpperCase(),
    headers,
  };
  if (config.signal) init.signal = config.signal;
  if (config.data !== undefined) {
    init.body =
      config.responseType === 'blob' ? (config.data as BodyInit) : JSON.stringify(config.data);
  }

  let fullUrl = url;
  if (config.params) {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(config.params)) {
      if (v !== undefined && v !== null) qs.set(k, String(v));
    }
    const s = qs.toString();
    if (s) fullUrl += (fullUrl.includes('?') ? '&' : '?') + s;
  }

  const res = await fetch(fullUrl, init);

  if (!res.ok) {
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      body = await res.text();
    }
    if (res.status === 401) {
      setStoredToken(null);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('auth:unauthorized'));
      }
    }
    throw new ApiError(res.status, `HTTP ${res.status} ${res.statusText}`, body);
  }

  if (config.responseType === 'blob') {
    return (await res.blob()) as unknown as T;
  }
  if (res.status === 204) return undefined as unknown as T;
  return (await res.json()) as T;
}

export default customInstance;
