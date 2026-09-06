import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { renderRoute } from '../test/harness'
import { server } from '../mocks/server'
import { MOCK_USER, mockShadowVideo } from '../mocks/handlers'

/**
 * Đổi chủ đề ngay trên danh sách.
 *
 * Both list screens already named each row's shelf, because the list is where
 * somebody notices that most rows are unfiled. What they could not do there is
 * anything about it: nhại theo meant a trip into the studio and back per row,
 * chép chính tả meant a dialog per row. Filing a backlog is the one job where
 * that cost lands on every single item.
 *
 * Two things these tests hold shut, and the second is the one that would hurt.
 *
 * The vocabulary stays closed. A quicker control is exactly where somebody
 * would be tempted to allow a typed category, and one typo splits "Du lịch"
 * into two half-full shelves on the learner's chip row with nothing anywhere
 * saying so.
 *
 * And a re-file changes the shelf and NOTHING else. Both endpoints are PUT and
 * both take the whole metadata record, so the honest way to move one field is
 * to send back every other field unchanged — see features/lessons/refile.ts.
 * The shadowing list row does not carry voice, voice kind or chủ điểm, which is
 * why that one reads the video first, and why the fixture has all three set.
 */

function rowFor(title: string) {
  return screen.getByRole('link', { name: title }).closest('tr')!
}

/** The row's chủ đề picker, once the vocabulary has landed. It is disabled
 *  until then rather than showing a menu with nothing on it. */
async function pickerIn(row: HTMLElement) {
  const picker = within(row).getByRole('combobox')
  await waitFor(() => expect(picker).not.toBeDisabled())
  return picker
}

describe('nhại theo: filing a row from the list', () => {
  it('moves it to the chosen shelf, without ever opening the studio', async () => {
    const user = userEvent.setup()
    renderRoute('/videos')

    await screen.findByRole('link', { name: 'Đặt bàn nhà hàng' })
    await user.selectOptions(await pickerIn(rowFor('Đặt bàn nhà hàng')), 'sc-2')

    await waitFor(() => expect(mockShadowVideo('sv-1')?.categoryName).toBe('Tin tức'))
    // And the row says so, from the re-read list rather than from the click.
    expect(await pickerIn(rowFor('Đặt bàn nhà hàng'))).toHaveDisplayValue('Tin tức')
  })

  it('leaves every field the row does not carry exactly as it was', async () => {
    const user = userEvent.setup()
    renderRoute('/videos')

    await screen.findByRole('link', { name: 'Đặt bàn nhà hàng' })
    await user.selectOptions(await pickerIn(rowFor('Đặt bàn nhà hàng')), 'sc-2')

    await waitFor(() => expect(mockShadowVideo('sv-1')?.categoryId).toBe('sc-2'))

    // The whole point of the extra read. PUT is the whole metadata record, so a
    // request built from the list row alone — which has none of these three on
    // it — would send them absent, and absent means cleared: the voice label
    // gone, a real recording relabelled as máy đọc, and the chủ điểm ngữ pháp
    // that SC-WEAKNESS counts wrong answers against detached from the video.
    // Nothing on this screen would have said any of it happened.
    const video = mockShadowVideo('sv-1')
    expect(video?.voice).toBe('Nữ')
    expect(video?.voiceKind).toBe('HUMAN')
    expect(video?.topics.map((t) => t.id)).toEqual(['t-3'])
    // Nor is this an edit to the material, so no line goes back for another ear.
    expect(video?.review).toEqual({ total: 4, approved: 2, rejected: 1, unreviewed: 1 })
  })

  it('un-files a row too, because the gate warns rather than refuses', async () => {
    const user = userEvent.setup()
    renderRoute('/videos')

    await screen.findByRole('link', { name: 'Đặt bàn nhà hàng' })
    // "— Chưa chọn —" is a real option here for the same reason it is one in
    // the dialog: a control that can file something and never unfile it is how
    // a row ends up on a shelf nobody meant to put it on.
    await user.selectOptions(await pickerIn(rowFor('Đặt bàn nhà hàng')), '')

    await waitFor(() => expect(mockShadowVideo('sv-1')?.categoryId).toBeUndefined())
  })

  it('never lets an author type a shelf that does not exist', async () => {
    renderRoute('/videos')
    await screen.findByRole('link', { name: 'Đặt bàn nhà hàng' })

    // A <select>, exactly as in the dialog. Being quicker must not also mean
    // being looser: this is the control that keeps the learner's chip row from
    // fragmenting on the first typo.
    const picker = await pickerIn(rowFor('Đặt bàn nhà hàng'))
    expect(picker.tagName).toBe('SELECT')
    expect(within(picker).getByRole('option', { name: '— Chưa chọn —' })).toBeInTheDocument()
  })
})

describe('a refused save is not allowed to look like a saved one', () => {
  it('puts the cell back where it was, and says why in the row', async () => {
    const user = userEvent.setup()
    server.use(
      http.put('/api/v1/admin/shadowing/videos/:videoId', () =>
        HttpResponse.json(
          {
            title: 'Không tìm thấy',
            status: 404,
            code: 'shadowing_category_not_found',
            detail: 'Không tìm thấy chủ đề này',
          },
          { status: 404 },
        ),
      ),
    )
    renderRoute('/videos')

    await screen.findByRole('link', { name: 'Đặt bàn nhà hàng' })
    await user.selectOptions(await pickerIn(rowFor('Đặt bàn nhà hàng')), 'sc-2')

    // The server's own Vietnamese, in the row that refused. A banner at the top
    // of a column of these would not say which row it meant.
    expect(await within(rowFor('Đặt bàn nhà hàng')).findByRole('alert')).toHaveTextContent(
      'Không tìm thấy chủ đề này',
    )
    // And the cell is back on the shelf the video is actually on. A cell still
    // showing the refused choice would leave the next person to read this list
    // reading a lie.
    expect(await pickerIn(rowFor('Đặt bàn nhà hàng'))).toHaveDisplayValue('Hội thoại hàng ngày')
  })
})

describe('chép chính tả gets the same cell, over its own vocabulary', () => {
  it('files a set without touching its voice or a single verdict', async () => {
    const user = userEvent.setup()
    renderRoute('/dictation')

    // ds-2 is unfiled, read by a real person, and its voice label is one of the
    // fields a request built from too little would clear.
    await screen.findByRole('link', { name: 'Chào hỏi hằng ngày' })
    const picker = await pickerIn(rowFor('Chào hỏi hằng ngày'))

    // Its own vocabulary, never nhại theo's — the server keeps the two corpora
    // apart (migration 00035) and a shared shelf here would be the one place
    // they met.
    expect(within(picker).queryByRole('option', { name: 'Hội thoại hàng ngày' })).toBeNull()
    await user.selectOptions(picker, 'dc-2')

    await waitFor(async () => {
      expect(await pickerIn(rowFor('Chào hỏi hằng ngày'))).toHaveDisplayValue('Tin tức')
    })

    const cells = within(rowFor('Chào hỏi hằng ngày')).getAllByRole('cell')
    // Giọng đọc, untouched: still a named human reader, not the blank and the
    // "do máy tạo" that an under-filled PUT would have left behind.
    expect(cells[3]).toHaveTextContent('Nam')
    expect(cells[3]).not.toHaveTextContent('do máy tạo')
  })
})

describe('reading the filing is not writing it', () => {
  it('shows plain text to an account without dictation:write', async () => {
    const user = { ...MOCK_USER, permissions: MOCK_USER.permissions.filter((p) => p !== 'dictation:write') }
    server.use(
      http.post('/api/v1/auth/refresh', () =>
        HttpResponse.json({ accessToken: 'mock-access-token', expiresIn: 900, user }),
      ),
    )
    renderRoute('/dictation')

    await screen.findByRole('link', { name: 'Hội thoại công sở' })
    const cell = within(rowFor('Hội thoại công sở')).getAllByRole('cell')[1]!
    // The column still names the shelf — that is what it was for before any of
    // this. Hiding the control is a courtesy; rbac is the rule, and the server
    // holds the same permission on the endpoint.
    expect(cell).toHaveTextContent('Công việc')
    expect(within(cell).queryByRole('combobox')).toBeNull()
  })
})
