/**
 * 把角色头像等相对路径接到 API origin（与 mutator 同源约定）。
 */
export function resolveMediaUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (/^https?:\/\//i.test(url) || url.startsWith('data:')) return url;
  const raw = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim();
  const base = (raw && raw.length > 0 ? raw : 'http://localhost:8081').replace(/\/+$/, '');
  return `${base}${url.startsWith('/') ? url : `/${url}`}`;
}
