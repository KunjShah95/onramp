import '@testing-library/jest-dom'
import { vi } from 'vitest'

// @neondatabase/neon-js/auth is no longer used — the project uses custom JWT auth.
// Keeping this mock empty avoids import errors if any transitive dep references it.
vi.mock('@neondatabase/neon-js/auth', () => ({}))

Element.prototype.scrollIntoView = vi.fn()

// Use regular functions instead of arrow functions so that `new` works.
// framer-motion calls `new IntersectionObserver()` and vitest 4.x requires
// mock implementations to be constructable.
globalThis.ResizeObserver = vi.fn(function () {
  return { observe: vi.fn(), unobserve: vi.fn(), disconnect: vi.fn() }
}) as unknown as typeof ResizeObserver

globalThis.IntersectionObserver = vi.fn(function () {
  return { observe: vi.fn(), unobserve: vi.fn(), disconnect: vi.fn() }
}) as unknown as typeof IntersectionObserver

vi.mock('../lib/neon-auth', () => ({
  getToken: vi.fn(() => null),
  setToken: vi.fn(),
}))

// Guard against stray/unawaited network calls. Components may fire a fetch on
// mount that outlives a test; against a real backend (absent in CI) undici
// rejects with an AggregateError (ECONNREFUSED) that Vitest attributes to
// whichever test happens to be active — a nondeterministic, cross-test flake.
// Stubbing fetch to resolve an empty payload keeps the suite deterministic.
// Tests that need specific responses mock `../lib/api` or override fetch themselves.
globalThis.fetch = vi.fn(
  async () =>
    new Response(JSON.stringify({}), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
) as unknown as typeof fetch
