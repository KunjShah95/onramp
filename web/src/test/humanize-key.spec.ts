/**
 * `humanizeKey` — machine identifiers (tier keys, module names, audit event
 * types) get shown to users verbatim all over the product. CSS `capitalize` is
 * not enough: it upper-cases the first letter of the whole string and leaves
 * separators in place, which is how `usage_based` reached the rate-limit table
 * rendered as "Usage_based".
 */
import { describe, it, expect } from 'vitest'
import { humanizeKey } from '../lib/utils'

describe('humanizeKey', () => {
  it('humanizes snake_case identifiers', () => {
    expect(humanizeKey('usage_based')).toBe('Usage Based')
    expect(humanizeKey('pro')).toBe('Pro')
    expect(humanizeKey('enterprise')).toBe('Enterprise')
  })

  it('handles kebab-case, spaces, and repeated separators', () => {
    expect(humanizeKey('usage-based')).toBe('Usage Based')
    expect(humanizeKey('pay as you go')).toBe('Pay As You Go')
    expect(humanizeKey('tier__two')).toBe('Tier Two')
  })

  it('keeps known acronyms upper-case rather than title-casing them', () => {
    expect(humanizeKey('ai_tier')).toBe('AI Tier')
    expect(humanizeKey('gpu_accelerated')).toBe('GPU Accelerated')
    expect(humanizeKey('v2_only')).toBe('V2 Only')
  })

  it('normalizes inconsistent casing in the source key', () => {
    expect(humanizeKey('FREE')).toBe('Free')
    expect(humanizeKey('Usage_Based')).toBe('Usage Based')
  })

  it('never leaks a separator or stray whitespace', () => {
    for (const key of ['usage_based', 'a_b_c', '  spaced  out  ', 'trailing_']) {
      const out = humanizeKey(key)
      expect(out).not.toMatch(/[_\-]/)
      expect(out).not.toMatch(/\s{2,}/)
      expect(out).toBe(out.trim())
    }
  })

  it('returns an empty string for empty input rather than throwing', () => {
    expect(humanizeKey('')).toBe('')
    expect(humanizeKey('___')).toBe('')
  })
})
