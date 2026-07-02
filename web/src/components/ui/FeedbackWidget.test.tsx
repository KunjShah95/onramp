import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, userEvent } from '../../test/test-utils'
import FeedbackWidget from './FeedbackWidget'
import * as api from '../../lib/api'

describe('FeedbackWidget', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('submits thumbs up with context and shows thanks', async () => {
    const spy = vi.spyOn(api, 'submitFeedback').mockResolvedValue({ recorded: true })
    render(<FeedbackWidget feature="ask" context={{ index_id: 'abc' }} />)

    await userEvent.click(screen.getByLabelText('Thumbs up'))

    expect(spy).toHaveBeenCalledWith('ask', 1, { index_id: 'abc' }, undefined)
    expect(screen.getByText('Thanks for the feedback')).toBeInTheDocument()
  })

  it('thumbs down asks for an optional comment before submitting', async () => {
    const spy = vi.spyOn(api, 'submitFeedback').mockResolvedValue({ recorded: true })
    render(<FeedbackWidget feature="learn" />)

    await userEvent.click(screen.getByLabelText('Thumbs down'))
    const input = screen.getByPlaceholderText('What was wrong? (optional)')
    await userEvent.type(input, 'cited the wrong file')
    await userEvent.click(screen.getByText('Send'))

    expect(spy).toHaveBeenCalledWith('learn', -1, undefined, 'cited the wrong file')
    expect(screen.getByText('Thanks for the feedback')).toBeInTheDocument()
  })

  it('swallows API failures and still thanks the user', async () => {
    vi.spyOn(api, 'submitFeedback').mockRejectedValue(new Error('network down'))
    render(<FeedbackWidget feature="explore" />)

    await userEvent.click(screen.getByLabelText('Thumbs up'))

    expect(screen.getByText('Thanks for the feedback')).toBeInTheDocument()
  })
})
