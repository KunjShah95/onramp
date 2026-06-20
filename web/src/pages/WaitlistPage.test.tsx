import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, userEvent } from '../test/test-utils'
import WaitlistPage from './WaitlistPage'

describe('WaitlistPage', () => {
  const mockFetch = vi.fn()

  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch)
    mockFetch.mockReset()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  const fillForm = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.type(screen.getByPlaceholderText(/full name/i), 'Jane Doe')
    await user.type(screen.getByPlaceholderText(/work email/i), 'jane@example.com')

    const combos = screen.getAllByRole('combobox')
    await user.selectOptions(combos[0], 'developer')
    await user.type(screen.getByPlaceholderText(/company/i), 'Acme Inc')
    await user.selectOptions(combos[1], '11-50')
    await user.type(
      screen.getByPlaceholderText(/what.*biggest onboarding/i),
      'Too much manual ramp-up time',
    )
  }

  it('renders all form fields and Join Waitlist button', async () => {
    mockFetch.mockResolvedValueOnce(new Response(JSON.stringify({ count: 99 })))
    render(<WaitlistPage />)

    expect(await screen.findByPlaceholderText(/full name/i)).toBeInTheDocument()
    expect(await screen.findByPlaceholderText(/work email/i)).toBeInTheDocument()

    const combos = await screen.findAllByRole('combobox')
    expect(combos).toHaveLength(2)

    expect(await screen.findByPlaceholderText(/company/i)).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: /join waitlist/i })).toBeInTheDocument()
  })

  it('shows success state after successful submit', async () => {
    mockFetch
      .mockResolvedValueOnce(new Response(JSON.stringify({ count: 99 })))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ position: 42, message: "You're on the list!" }),
          { status: 200 },
        ),
      )

    const user = userEvent.setup()
    render(<WaitlistPage />)

    await screen.findByText(/already waiting/i)

    await fillForm(user)
    await user.click(screen.getByRole('button', { name: /join waitlist/i }))

    expect(await screen.findByText("You're on the list!")).toBeInTheDocument()

    const postCall = mockFetch.mock.calls.find(
      (c) => typeof c[0] === 'string' && (c[0] as string).includes('/join'),
    )
    expect(postCall).toBeDefined()
  })

  it('shows validation error when role or team_size is missing', async () => {
    mockFetch.mockResolvedValueOnce(new Response(JSON.stringify({ count: 99 })))
    const user = userEvent.setup()
    const { container } = render(<WaitlistPage />)

    await screen.findByPlaceholderText(/full name/i)

    await user.type(screen.getByPlaceholderText(/full name/i), 'Jane Doe')
    await user.type(screen.getByPlaceholderText(/work email/i), 'jane@example.com')
    await user.type(screen.getByPlaceholderText(/company/i), 'Acme Inc')

    const form = container.querySelector('form')!
    fireEvent.submit(form)

    expect(await screen.findByText(/please fill in all fields/i)).toBeInTheDocument()
  })
})
