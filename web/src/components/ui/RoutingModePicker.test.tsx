import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '../../test/test-utils'
import userEvent from '@testing-library/user-event'
import RoutingModePicker from './RoutingModePicker'

describe('RoutingModePicker', () => {
  it('shows Auto by default and opens the preset list on click', async () => {
    const user = userEvent.setup()
    render(<RoutingModePicker value={null} onChange={() => {}} />)

    const trigger = screen.getByRole('button', { name: /route/i })
    expect(trigger).toHaveTextContent('Auto')

    await user.click(trigger)
    expect(screen.getByRole('listbox')).toBeInTheDocument()
    // Anchored to the option's full accessible name — "Auto" also mentions
    // "Cost / Balanced / Intelligence" in its description. (jsdom computes
    // the label+description with no separating space: "CostCheapest…".)
    expect(screen.getByRole('option', { name: /^cost\s*cheapest/i })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: /^balanced\s*trust/i })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: /^intelligence\s*strongest/i })).toBeInTheDocument()
  })

  it('calls onChange with the preset when an option is picked', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<RoutingModePicker value={null} onChange={onChange} />)

    await user.click(screen.getByRole('button', { name: /route/i }))
    await user.click(screen.getByRole('option', { name: /^cost\s*cheapest/i }))

    expect(onChange).toHaveBeenCalledWith('cost')
  })

  it('reflects a set preset on the trigger and clears to Auto when Auto is picked', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<RoutingModePicker value="intelligence" onChange={onChange} />)

    expect(screen.getByRole('button', { name: /route/i })).toHaveTextContent('Intelligence')

    await user.click(screen.getByRole('button', { name: /route/i }))
    await user.click(screen.getByRole('option', { name: /auto/i }))

    expect(onChange).toHaveBeenCalledWith(null)
  })

  it('closes on Escape', async () => {
    const user = userEvent.setup()
    render(<RoutingModePicker value={null} onChange={() => {}} />)

    await user.click(screen.getByRole('button', { name: /route/i }))
    expect(screen.getByRole('listbox')).toBeInTheDocument()

    await user.keyboard('{Escape}')
    expect(screen.queryByRole('listbox')).toBeNull()
  })
})
