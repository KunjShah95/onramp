import { createAuthClient } from '@neondatabase/neon-js/auth';

const origin =
  typeof window !== 'undefined'
    ? window.location.origin
    : 'http://localhost:8000';

const testClient: unknown =
  typeof window !== 'undefined'
    ? (window as unknown as Record<string, unknown>).__TEST_AUTH_CLIENT
    : undefined;

const authUrl = import.meta.env.VITE_NEON_AUTH_URL || origin + '/api/v1/auth';

export const authClient =
  (testClient as ReturnType<typeof createAuthClient> | undefined) ??
  createAuthClient(authUrl);
