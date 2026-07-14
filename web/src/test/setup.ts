import '@testing-library/jest-dom'
import { vi } from 'vitest'

// @neondatabase/neon-js/auth is no longer used — the project uses custom JWT auth.
// Keeping this mock empty avoids import errors if any transitive dep references it.
vi.mock('@neondatabase/neon-js/auth', () => ({}))

Element.prototype.scrollIntoView = vi.fn()
globalThis.ResizeObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(), unobserve: vi.fn(), disconnect: vi.fn(),
}))
globalThis.IntersectionObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(), unobserve: vi.fn(), disconnect: vi.fn(),
}))

vi.mock('../lib/neon-auth', () => ({
  getToken: vi.fn(() => null),
  setToken: vi.fn(),
}))
