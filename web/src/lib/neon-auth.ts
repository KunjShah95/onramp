/**
 * Auth token management — stores the JWT in memory for API calls.
 * Replaces the former Neon Auth client.
 */

let _token: string | null = null;

export function getToken(): string | null {
  return _token;
}

export function setToken(token: string | null): void {
  _token = token;
}
