/*
 * Progressive-disclosure kit — the "reduce the choices first, then show the
 * details" contract. These tests pin the *behaviour* the role pages depend on:
 * a list is capped, the cap is disclosed, a filter narrows before the list
 * renders, and collapsed detail stays unmounted until it is asked for.
 */
import { describe, it, expect, vi } from 'vitest'
import { useState } from 'react'
import { renderSettled, screen, userEvent } from './test-utils'
import {
  NextUp, FilterChips, ShowMore, Disclosure, DeepDive,
} from '../components/ui/progressive'

describe('NextUp — reduce the choices, then rank them', () => {
  const actions = Array.from({ length: 6 }, (_, i) => ({
    id: `a${i}`,
    label: `Action ${i}`,
    detail: 'detail',
    onClick: vi.fn(),
  }))

  it('renders the headline, the one reason, and the primary action', async () => {
    await renderSettled(
      <NextUp
        headline="3 reviews waiting on you"
        detail="Reviews are the shortest path to unblocking someone."
        primary={{ id: 'p', label: 'Open review queue', onClick: vi.fn() }}
      />,
    )
    expect(screen.getByText('3 reviews waiting on you')).toBeInTheDocument()
    expect(screen.getByText(/shortest path/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Open review queue/ })).toBeInTheDocument()
  })

  it('caps secondaries and names how many are withheld', async () => {
    const user = userEvent.setup()
    await renderSettled(
      <NextUp headline="Verdict" primary={{ id: 'p', label: 'Go' }} secondary={actions} />,
    )
    // Default: 3 secondaries, the rest behind a labelled reveal.
    expect(screen.getByText('Action 0')).toBeInTheDocument()
    expect(screen.getByText('Action 2')).toBeInTheDocument()
    expect(screen.queryByText('Action 3')).not.toBeInTheDocument()
    expect(screen.getByText(/Show 3 more actions/)).toBeInTheDocument()

    await user.click(screen.getByText(/Show 3 more actions/))
    expect(screen.getByText('Action 5')).toBeInTheDocument()
    expect(screen.getByText('Show fewer')).toBeInTheDocument()
  })

  it('fires the primary action on click', async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()
    await renderSettled(
      <NextUp headline="Verdict" primary={{ id: 'p', label: 'Do the thing', onClick }} />,
    )
    await user.click(screen.getByRole('button', { name: /Do the thing/ }))
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('renders nothing when there is no primary and no secondaries', async () => {
    // A verdict with no action behind it is noise, so the rail stands down.
    await renderSettled(<NextUp headline="Verdict" />)
    expect(screen.queryByText('Verdict')).not.toBeInTheDocument()
  })
})

describe('FilterChips — narrow the field before listing', () => {
  function Harness() {
    const [v, setV] = useState('all')
    const rows = v === 'all' ? 12 : v === 'a' ? 5 : 0
    return (
      <>
        <FilterChips
          label="Stage"
          value={v}
          onChange={setV}
          options={[
            { value: 'all', label: 'All', count: 12 },
            { value: 'a', label: 'Onboarding', count: 5 },
            { value: 'b', label: 'Ramping', count: 0 },
          ]}
          summary={`${rows} of 12`}
        />
        <p data-testid="rows">{rows}</p>
      </>
    )
  }

  it('marks the active chip with aria-pressed, not colour alone', async () => {
    await renderSettled(<Harness />)
    const all = screen.getByRole('button', { name: /All/ })
    const onboarding = screen.getByRole('button', { name: /Onboarding/ })
    expect(all).toHaveAttribute('aria-pressed', 'true')
    expect(onboarding).toHaveAttribute('aria-pressed', 'false')
  })

  it('reports the filtered count so the list never looks arbitrary', async () => {
    const user = userEvent.setup()
    await renderSettled(<Harness />)
    expect(screen.getByTestId('rows')).toHaveTextContent('12')
    await user.click(screen.getByRole('button', { name: /Onboarding/ }))
    expect(screen.getByTestId('rows')).toHaveTextContent('5')
    // Scoped by text: the toast host also owns a role="status" region, so a
    // bare getByRole('status') would be ambiguous.
    const summary = screen.getByText('5 of 12')
    expect(summary.closest('[role="status"]')).not.toBeNull()
  })

  it('dims a zero-count chip but leaves it clickable so the rail never reflows', async () => {
    await renderSettled(<Harness />)
    const empty = screen.getByRole('button', { name: /Ramping/ })
    expect(empty).toHaveAttribute('data-empty', 'true')
    expect(empty).toBeEnabled()
  })
})

describe('ShowMore — cap the list, label the cap', () => {
  const items = Array.from({ length: 12 }, (_, i) => ({ id: i, name: `Row ${i}` }))

  it('shows the limit and states exactly how many are withheld', async () => {
    await renderSettled(
      <ShowMore items={items} limit={5} noun="row">
        {(visible) => <ul>{visible.map((r) => <li key={r.id}>{r.name}</li>)}</ul>}
      </ShowMore>,
    )
    expect(screen.getByText('Row 4')).toBeInTheDocument()
    expect(screen.queryByText('Row 5')).not.toBeInTheDocument()
    expect(screen.getByText(/Show 7 more · 12 rows total/)).toBeInTheDocument()
  })

  it('reveals the rest and can re-collapse', async () => {
    const user = userEvent.setup()
    await renderSettled(
      <ShowMore items={items} limit={5} noun="row">
        {(visible) => <ul>{visible.map((r) => <li key={r.id}>{r.name}</li>)}</ul>}
      </ShowMore>,
    )
    await user.click(screen.getByText(/Show 7 more · 12 rows total/))
    expect(screen.getByText('Row 11')).toBeInTheDocument()

    await user.click(screen.getByText('Show first 5 only'))
    expect(screen.queryByText('Row 11')).not.toBeInTheDocument()
  })

  it('re-caps when resetKey changes (a filter reshaped the list)', async () => {
    const user = userEvent.setup()
    function Harness() {
      const [k, setK] = useState('a')
      return (
        <>
          <button onClick={() => setK('b')}>refilter</button>
          <ShowMore items={items} limit={5} noun="row" resetKey={k}>
            {(visible) => <ul>{visible.map((r) => <li key={r.id}>{r.name}</li>)}</ul>}
          </ShowMore>
        </>
      )
    }
    await renderSettled(<Harness />)
    await user.click(screen.getByText(/Show 7 more · 12 rows total/))
    expect(screen.getByText('Row 11')).toBeInTheDocument()

    await user.click(screen.getByText('refilter'))
    expect(screen.queryByText('Row 11')).not.toBeInTheDocument()
    expect(screen.getByText(/Show 7 more · 12 rows total/)).toBeInTheDocument()
  })

  it('renders the empty state and no reveal control for an empty list', async () => {
    await renderSettled(
      <ShowMore items={[] as typeof items} limit={5} noun="row" emptyState={<p>Nothing here</p>}>
        {(visible) => <ul>{visible.map((r) => <li key={r.id}>{r.name}</li>)}</ul>}
      </ShowMore>,
    )
    expect(screen.getByText('Nothing here')).toBeInTheDocument()
    expect(screen.queryByText(/more ·/)).not.toBeInTheDocument()
  })
})

describe('Disclosure — collapse detail behind a labelled trigger', () => {
  it('names what is inside while collapsed, and keeps it unmounted', async () => {
    await renderSettled(
      <Disclosure label="Module access" hint="4 modules granted">
        <p>the secret detail</p>
      </Disclosure>,
    )
    const trigger = screen.getByRole('button', { name: /Module access/ })
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByText('4 modules granted')).toBeInTheDocument()
    // mountOnOpen is the default: collapsed detail costs nothing to render.
    expect(screen.queryByText('the secret detail')).not.toBeInTheDocument()
  })

  it('reveals on click and wires aria-controls to the region', async () => {
    const user = userEvent.setup()
    await renderSettled(
      <Disclosure label="Module access" hint="4 modules granted">
        <p>the secret detail</p>
      </Disclosure>,
    )
    const trigger = screen.getByRole('button', { name: /Module access/ })
    const regionId = trigger.getAttribute('aria-controls')
    expect(regionId).toBeTruthy()

    await user.click(trigger)
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('the secret detail')).toBeInTheDocument()
    expect(document.getElementById(regionId!)).toBeInTheDocument()
  })

  it('honours defaultOpen and can be collapsed again', async () => {
    const user = userEvent.setup()
    await renderSettled(
      <Disclosure label="Open one" defaultOpen>
        <p>visible</p>
      </Disclosure>,
    )
    const trigger = screen.getByRole('button', { name: /Open one/ })
    expect(screen.getByText('visible')).toBeInTheDocument()
    await user.click(trigger)
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
  })

  it('mountOnOpen={false} keeps the content in the DOM for in-page search', async () => {
    await renderSettled(
      <Disclosure label="Always mounted" mountOnOpen={false}>
        <p>findable</p>
      </Disclosure>,
    )
    expect(screen.getByText('findable')).toBeInTheDocument()
  })
})

describe('DeepDive — page-level "what else is here"', () => {
  it('lists the contents while sealed and mounts nothing', async () => {
    await renderSettled(
      <DeepDive label="Leadership deep dive" summary="ramp · cohorts · retention">
        <p>panel one</p>
      </DeepDive>,
    )
    expect(screen.getByText('Leadership deep dive')).toBeInTheDocument()
    expect(screen.getByText('ramp · cohorts · retention')).toBeInTheDocument()
    expect(screen.queryByText('panel one')).not.toBeInTheDocument()
  })

  it('mounts the sealed panels on open', async () => {
    const user = userEvent.setup()
    await renderSettled(
      <DeepDive label="Leadership deep dive" summary="ramp · cohorts">
        <p>panel one</p>
      </DeepDive>,
    )
    await user.click(screen.getByRole('button', { name: /Leadership deep dive/ }))
    expect(screen.getByText('panel one')).toBeInTheDocument()
  })
})
