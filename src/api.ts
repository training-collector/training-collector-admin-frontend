export interface Trainer {
  id: number;
  username: string | null;
  fullName: string;
  telegramLinkedAt: string;
  approvedAt: string | null;
  deactivatedAt: string | null;
}
export interface Item {
  id: number;
  name: string;
  description?: string | null;
  hidden: boolean;
}
export type Section = 'requests' | 'trainers' | 'exercises' | 'goals';
export class Unauthorized extends Error {}
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
