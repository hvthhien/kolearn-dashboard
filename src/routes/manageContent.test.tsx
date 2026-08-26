import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { renderRoute } from '../test/harness'

/**
 * Sửa và xoá, on both studios.
 *
 * The behaviour worth testing is not that a button exists. It is that the
 * screen never offers the wrong one of two operations that differ in whether a
 * learner's history survives — a draft is deleted outright, and anything that
 * has ever been published can only be pulled back out of the bank.
 *
 * `publishedAt` decides it. The trap these tests hold shut is the tempting
 * check against `status`: a RETIRED row is not PUBLISHED, so a screen reading
 * status alone offers "Xoá" on precisely the row carrying learners' results.
 *
 * Fixtures: sv-1/sv-2/sv-3 and ds-1 are drafts; sv-4 and ds-2 have gone out.
 */

/** Finds the table row whose first cell holds this title. */
function rowFor(title: string) {
  return screen.getByRole('link', { name: title }).closest('tr')!
}

describe('xoá nội dung nhại theo', () => {
  it('bản nháp thì cho xoá hẳn, và biến khỏi danh sách', async () => {
    const user = userEvent.setup()
    renderRoute('/videos')

    const draft = await screen.findByRole('link', { name: 'Đặt bàn nhà hàng' })
    await user.click(within(draft.closest('tr')!).getByRole('button', { name: 'Xoá' }))

    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText(/không hoàn tác được/i)).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Xoá hẳn' }))

    await waitFor(() => {
      expect(screen.queryByRole('link', { name: 'Đặt bàn nhà hàng' })).not.toBeInTheDocument()
    })
    // The others are untouched — a delete that took the list with it would
    // pass a "the row is gone" assertion just as well.
    expect(screen.getByRole('link', { name: 'Hỏi đường' })).toBeInTheDocument()
  })

  // The published row must not offer delete at all. Refusing at the server is
  // the rule; not offering it is what stops someone learning the wrong model of
  // their own bank from a button that always fails.
  it('video đã xuất bản chỉ cho gỡ, không cho xoá', async () => {
    const user = userEvent.setup()
    renderRoute('/videos')

    await screen.findByRole('link', { name: 'Hỏi đường' })
    const published = rowFor('Hỏi đường')

    expect(within(published).queryByRole('button', { name: 'Xoá' })).not.toBeInTheDocument()
    await user.click(within(published).getByRole('button', { name: 'Gỡ' }))

    const dialog = await screen.findByRole('dialog')
    // The dialog says what survives, because that is the entire difference
    // between the two operations and the reader is choosing on it.
    expect(within(dialog).getByText(/tiến độ của họ/)).toBeInTheDocument()
    expect(within(dialog).getByText(/đưa lại được/)).toBeInTheDocument()

    await user.click(within(dialog).getByRole('button', { name: 'Gỡ khỏi ngân hàng' }))

    // Still listed — retiring takes it out of the learner's world, not out of
    // the bank's. Somebody has to be able to find it again to put it back.
    await waitFor(() => {
      expect(within(rowFor('Hỏi đường')).getByText('đã gỡ')).toBeInTheDocument()
    })
  })

  // The one that matters, and the one a status check gets wrong.
  it('video đã gỡ vẫn không cho xoá', async () => {
    const user = userEvent.setup()
    renderRoute('/videos')

    await screen.findByRole('link', { name: 'Hỏi đường' })
    await user.click(within(rowFor('Hỏi đường')).getByRole('button', { name: 'Gỡ' }))
    await user.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Gỡ khỏi ngân hàng' }),
    )
    await waitFor(() => {
      expect(within(rowFor('Hỏi đường')).getByText('đã gỡ')).toBeInTheDocument()
    })

    const retired = rowFor('Hỏi đường')
    expect(within(retired).queryByRole('button', { name: 'Xoá' })).not.toBeInTheDocument()
    expect(within(retired).getByRole('button', { name: 'Gỡ' })).toBeInTheDocument()
  })

  it('xưởng video cũng xoá được, rồi quay về danh sách', async () => {
    const user = userEvent.setup()
    const { router } = renderRoute('/videos/sv-2')

    await user.click(await screen.findByRole('button', { name: 'Xoá hẳn video' }))
    await user.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Xoá hẳn' }),
    )

    // Staying on the studio of a video that no longer exists would render the
    // 404 arm, which reads as a bug rather than as a completed action.
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/videos')
    })
  })
})

describe('sửa và xoá bộ chép chính tả', () => {
  it('sửa được tên và cấp độ, không đụng tới câu nào', async () => {
    const user = userEvent.setup()
    renderRoute('/dictation')

    await screen.findByRole('link', { name: 'Hội thoại công sở' })
    await user.click(
      within(rowFor('Hội thoại công sở')).getByRole('button', { name: 'Sửa' }),
    )

    const dialog = await screen.findByRole('dialog')
    const title = within(dialog).getByLabelText('Tên bộ')
    await user.clear(title)
    await user.type(title, 'Hội thoại văn phòng')
    await user.selectOptions(within(dialog).getByLabelText('Cấp độ'), '5')
    await user.click(within(dialog).getByRole('button', { name: 'Lưu' }))

    await waitFor(() => {
      expect(screen.getByRole('link', { name: 'Hội thoại văn phòng' })).toBeInTheDocument()
    })
    // By cell, not by text: "3" is both the sentence count and the unreviewed
    // count on this row, and a bare getByText would pass while asserting the
    // wrong column.
    const cells = within(rowFor('Hội thoại văn phòng')).getAllByRole('cell')
    // Chủ đề sits between the name and the level, and a rename does not touch
    // it: filing is a different edit from naming.
    expect(cells[1]).toHaveTextContent('Công việc')
    expect(cells[2]).toHaveTextContent('5')
    // The counter this screen exists for is unchanged: renaming a set is the
    // same audio saying the same sentences, so no verdict goes stale.
    expect(cells[4]).toHaveTextContent('3')
    expect(cells[5]).toHaveTextContent('3')
  })

  it('tên rỗng thì không lưu được', async () => {
    const user = userEvent.setup()
    renderRoute('/dictation')

    await screen.findByRole('link', { name: 'Hội thoại công sở' })
    await user.click(
      within(rowFor('Hội thoại công sở')).getByRole('button', { name: 'Sửa' }),
    )

    const dialog = await screen.findByRole('dialog')
    await user.clear(within(dialog).getByLabelText('Tên bộ'))
    expect(within(dialog).getByRole('button', { name: 'Lưu' })).toBeDisabled()
  })

  it('bộ nháp thì xoá hẳn, bộ đã xuất bản thì chỉ gỡ', async () => {
    const user = userEvent.setup()
    renderRoute('/dictation')

    await screen.findByRole('link', { name: 'Hội thoại công sở' })
    expect(
      within(rowFor('Chào hỏi hằng ngày')).queryByRole('button', { name: 'Xoá' }),
    ).not.toBeInTheDocument()
    expect(
      within(rowFor('Chào hỏi hằng ngày')).getByRole('button', { name: 'Gỡ' }),
    ).toBeInTheDocument()

    await user.click(within(rowFor('Hội thoại công sở')).getByRole('button', { name: 'Xoá' }))
    await user.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Xoá hẳn' }),
    )

    await waitFor(() => {
      expect(screen.queryByRole('link', { name: 'Hội thoại công sở' })).not.toBeInTheDocument()
    })
    expect(screen.getByRole('link', { name: 'Chào hỏi hằng ngày' })).toBeInTheDocument()
  })

  it('gỡ xong thì giữ nguyên kết quả nghe duyệt và vẫn xuất bản lại được', async () => {
    const user = userEvent.setup()
    renderRoute('/dictation/ds-2')

    await screen.findByRole('heading', { name: 'Chào hỏi hằng ngày' })
    // Published, so the studio offers retire and never delete.
    expect(screen.queryByRole('button', { name: 'Xoá hẳn bộ' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Gỡ khỏi ngân hàng' }))

    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getAllByRole('button', { name: 'Gỡ khỏi ngân hàng' })[0]!)

    // Still on the set, and its verdicts are where they were: retiring is what
    // you do to a set you intend to fix and send back out.
    await waitFor(() => {
      expect(screen.getByText('đã nghe hết')).toBeInTheDocument()
    })
    expect(screen.getByRole('button', { name: 'Xuất bản' })).toBeEnabled()
  })
})
