export interface Trainer {
  id: number;
  username: string | null;
  fullName: string;
  telegramUserId: number | null;
  telegramLinkedAt: string;
  approvedAt: string | null;
  deactivatedAt: string | null;
}
export interface MuscleGroup {
  id: number;
  name: string;
  description?: string | null;
}
export interface Item extends MuscleGroup {
  muscleGroupId?: number;
  hidden: boolean;
}
export type Section = 'requests' | 'trainers' | 'exercises' | 'goals';
export class Unauthorized extends Error {}

/** Sends a page failure to the server log. Hosted pages leave no other trace of it. */
let reportsLeft = 3;
export function reportError(error: unknown, stack = '') {
  if (reportsLeft-- <= 0) return;
  const detail = error instanceof Error ? error.stack || '' : '';
  void fetch('/admin/v1/client-errors', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    keepalive: true,
    body: JSON.stringify({
      message: String(error).slice(0, 300),
      source: 'admin ' + window.location.hash.slice(0, 70),
      stack: (detail + '\n' + stack).slice(0, 1500),
    }),
  }).catch(() => {});
}
export async function request<T>(
  path: string,
  token = '',
  method = 'GET',
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const headers = new Headers();
  if (token) headers.set('Authorization', 'Bearer ' + token);
  if (body !== undefined) headers.set('Content-Type', 'application/json');
  const result = await fetch('/admin/v1' + path, {
    method,
    headers,
    signal,
    cache: 'no-store',
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!result.ok) {
    const message = (await result.json().catch(() => null))?.error || `Ошибка запроса (${result.status}).`;
    if (result.status === 401 && token) throw new Unauthorized('Сессия завершена. Войдите снова.');
    throw new Error(message);
  }
  return result.status === 204 ? (undefined as T) : ((await result.json()) as T);
}
