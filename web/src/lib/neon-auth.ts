import { createAuthClient } from '@neondatabase/neon-js/auth';

export const authClient = createAuthClient(
  import.meta.env.VITE_NEON_AUTH_URL || window.location.origin + '/api/v1/auth'
);
