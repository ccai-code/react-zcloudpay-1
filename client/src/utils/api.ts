export const API_BASE: string =
  (typeof import.meta !== 'undefined' &&
    import.meta.env &&
    (import.meta.env.VITE_API_BASE as string)) ||
  'http://paybg.zhihua.chat';

export function api(path: string, init?: RequestInit) {
  const url = `${API_BASE}${path}`;
  return fetch(url, init);
}
