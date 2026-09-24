import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { renderRoute } from '../test/harness'

/**
 * The app bar's menu, below `lg`.
 *
 * jsdom loads no stylesheet, so nothing here can see the panel hide — every
 * link is in the tree at every width, which is what lets the permission tests
 * in users/earlyAccess keep finding them. What can be checked is the state the
 * stylesheet reads: `aria-expanded`, and the three ways the menu is meant to
 * close without anyone pressing the button again.
 */

async function renderBar(path = '/exams') {
  const user = userEvent.setup()
  const { router } = renderRoute(path)
  await screen.findByRole('heading', { level: 1 })
  const toggle = screen.getByRole('button', { name: 'Menu điều hướng' })
  const nav = screen.getByRole('navigation', { name: 'Điều hướng chính' })
  return { user, router, toggle, nav }
}

describe('menu điều hướng', () => {
  it('opens and shuts from its button', async () => {
    const { user, toggle } = await renderBar()
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(toggle).toHaveAttribute('aria-controls', 'app-nav')

    await user.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')

    await user.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
  })

  it('closes on the screen a link leads to', async () => {
    const { user, router, toggle, nav } = await renderBar()
    await user.click(toggle)
    await user.click(within(nav).getByRole('link', { name: 'Người dùng' }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/users'))
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
  })

  it('closes on the link to the screen already open', async () => {
    const { user, toggle, nav } = await renderBar()
    await user.click(toggle)
    await user.click(within(nav).getByRole('link', { name: 'Đề thi' }))
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
  })

  it('closes on Escape and gives focus back to the button', async () => {
    const { user, toggle, nav } = await renderBar()
    await user.click(toggle)
    within(nav).getByRole('link', { name: 'Nhập lô' }).focus()

    await user.keyboard('{Escape}')
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(toggle).toHaveFocus()
  })
})
