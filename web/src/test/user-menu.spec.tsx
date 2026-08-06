import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from './test-utils'
import userEvent from '@testing-library/user-event'
import UserMenu from '../components/ui/UserMenu'

describe('UserMenu dropdown', () => {
  it('is closed initially and opens when the trigger is clicked', async () => {
    const user = userEvent.setup()
    render(<UserMenu />)

    // Closed initially
    expect(screen.queryByRole('menu')).toBeNull()

    await user.click(screen.getByRole('button', { name: 'Account menu' }))

    const menu = screen.getByRole('menu')
    expect(menu).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: /Profile/i })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: /Settings/i })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: /Sign Out/i })).toBeInTheDocument()
  })

  it('closes when Escape is pressed', async () => {
    const user = userEvent.setup()
    render(<UserMenu />)

    await user.click(screen.getByRole('button', { name: 'Account menu' }))
    expect(screen.getByRole('menu')).toBeInTheDocument()

    await user.keyboard('{Escape}')
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('closes when clicking outside', async () => {
    const user = userEvent.setup()
    render(<UserMenu />)

    await user.click(screen.getByRole('button', { name: 'Account menu' }))
    expect(screen.getByRole('menu')).toBeInTheDocument()

    fireEvent.mouseDown(document.body)
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('closes after navigating to a menu item', async () => {
    const user = userEvent.setup()
    render(<UserMenu />)

    await user.click(screen.getByRole('button', { name: 'Account menu' }))
    expect(screen.getByRole('menu')).toBeInTheDocument()

    await user.click(screen.getByRole('menuitem', { name: /Profile/i }))
    expect(screen.queryByRole('menu')).toBeNull()
  })
})
