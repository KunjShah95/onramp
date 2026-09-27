import { describe, it, expect } from 'vitest'
import { renderSettled } from '../../test/test-utils'
import { DashboardSkeleton } from './Skeleton'

describe('DashboardSkeleton', () => {
  it('renders a dashboard shell of seated instrument panels', async () => {
    const { container } = await renderSettled(<DashboardSkeleton />)
    const panels = container.querySelectorAll('[class*="bg-panel"]')
    expect(panels.length).toBeGreaterThanOrEqual(5)
    expect(container.querySelectorAll('[class*="h-52"]').length).toBeGreaterThan(0)
  })
})
