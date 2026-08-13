import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '../test/test-utils'
import userEvent from '@testing-library/user-event'
import AskPage from './AskPage'

// Keep the network-bound / unrelated peers out of this focused test.
const { mockIndexRepo, mockAsk } = vi.hoisted(() => ({
  mockIndexRepo: vi.fn(),
  mockAsk: vi.fn(),
}))

vi.mock('../lib/api', () => ({
  indexRepo: (...args: unknown[]) => mockIndexRepo(...args),
  askQuestionStream: (...args: unknown[]) => mockAsk(...args),
}))

vi.mock('../components/ui/ModelPicker', () => ({
  default: () => <button type="button">ModelPicker stub</button>,
}))

vi.mock('../components/ui/RoastModeToggle', () => ({
  default: () => <button type="button">RoastModeToggle stub</button>,
}))

describe('AskPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockIndexRepo.mockResolvedValue({ index_id: 'idx-1' })
  })

  async function ask(repo = 'github.com/owner/repo', question = 'How does indexing work?') {
    const user = userEvent.setup()
    render(<AskPage />)
    await user.type(screen.getByPlaceholderText('github.com/owner/repo'), repo)
    await user.type(screen.getByPlaceholderText(/ask a question/i), question)
    await user.click(screen.getByRole('button', { name: 'Send' }))
  }

  it('shows the served-by label when the stream reports the serving route', async () => {
    mockAsk.mockImplementation(
      async (
        _idx: string,
        _question: string,
        onToken: (t: string) => void,
        _signal: unknown,
        _mode: string,
        _model: unknown,
        _routingMode: unknown,
        onRoute: (r: string) => void,
      ) => {
        onToken('TypeScript modules are indexed.')
        onRoute('groq/llama-3.3-70b-versatile')
      },
    )

    await ask()

    await waitFor(() => {
      expect(screen.getByText(/TypeScript modules are indexed/i)).toBeInTheDocument()
      expect(screen.getByText(/served by groq\/llama-3\.3-70b-versatile/i)).toBeInTheDocument()
    })
  })

  it('does not show a served-by label when the stream reports no route', async () => {
    mockAsk.mockImplementation(async (_idx: string, _question: string, onToken: (t: string) => void) => {
      onToken('Plain answer without routing attribution.')
    })

    await ask()

    await waitFor(() => {
      expect(screen.getByText(/Plain answer without routing attribution/i)).toBeInTheDocument()
    })
    expect(screen.queryByText(/served by/i)).toBeNull()
  })

  it('forwards the routing-mode picker choice and active team with the request', async () => {
    mockAsk.mockResolvedValue(undefined)

    const user = userEvent.setup()
    render(<AskPage />)
    await user.type(screen.getByPlaceholderText('github.com/owner/repo'), 'github.com/owner/repo')
    await user.type(screen.getByPlaceholderText(/ask a question/i), 'How does indexing work?')

    // Pick Cost on the routing dial. Anchored to the full option name because
    // "Auto" also mentions "Cost / Balanced / Intelligence" in its description.
    await user.click(screen.getByRole('button', { name: /route/i }))
    await user.click(screen.getByRole('option', { name: /^cost\s*cheapest/i }))

    await user.click(screen.getByRole('button', { name: 'Send' }))

    await waitFor(() => {
      expect(mockAsk).toHaveBeenCalledWith(
        'idx-1',
        'How does indexing work?',
        expect.any(Function), // onToken
        expect.any(AbortSignal), // signal
        'normal', // roast mode off
        undefined, // model pin stays Auto
        'cost', // routing-mode dial
        expect.any(Function), // onRoute
        null, // no signed-in user → no active team
      )
    })
  })
})
