import '@testing-library/jest-dom'
import { vi } from 'vitest'

const mockUser = {
  id: 'test-uid',
  email: 'test@example.com',
  name: 'Test User',
}

vi.mock('@neondatabase/neon-js/auth', () => ({
  createAuthClient: vi.fn(() => ({
    signUp: {
      email: vi.fn().mockResolvedValue({ data: { user: mockUser } }),
    },
    signIn: {
      email: vi.fn().mockResolvedValue({ data: { user: mockUser } }),
      social: vi.fn().mockResolvedValue({ data: { user: mockUser } }),
    },
    signOut: vi.fn().mockResolvedValue({}),
    getSession: vi.fn().mockResolvedValue({ data: null }),
    updateUser: vi.fn().mockResolvedValue({ data: { user: mockUser } }),
    forgetPassword: {
      emailOtp: vi.fn().mockResolvedValue({}),
    },
  })),
}))

Element.prototype.scrollIntoView = vi.fn()
globalThis.ResizeObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(), unobserve: vi.fn(), disconnect: vi.fn(),
}))
globalThis.IntersectionObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(), unobserve: vi.fn(), disconnect: vi.fn(),
}))

vi.mock('../lib/neon-auth', () => ({
  authClient: {
    signUp: {
      email: vi.fn().mockResolvedValue({ data: { user: mockUser } }),
    },
    signIn: {
      email: vi.fn().mockResolvedValue({ data: { user: mockUser } }),
      social: vi.fn().mockResolvedValue({ data: { user: mockUser } }),
    },
    signOut: vi.fn().mockResolvedValue({}),
    getSession: vi.fn().mockResolvedValue({ data: null }),
    updateUser: vi.fn().mockResolvedValue({ data: { user: mockUser } }),
    forgetPassword: {
      emailOtp: vi.fn().mockResolvedValue({}),
    },
  },
}))
