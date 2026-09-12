import { describe, it, expect } from 'vitest'

describe('shared cleanup', () => {
  it('exposes fetchWithAuth', async () => {
    const mod = await import('../lib/api')
    expect(typeof (mod as any).fetchWithAuth).toBe('function')
  })
})
