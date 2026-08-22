import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { renderRoute } from '../test/harness'

/**
 * Xưởng chép chính tả.
 *
 * The studio exists for one thing cmd/dictation-import cannot do: somebody with
 * Korean ears confirming the audio says what the transcript claims. Grading is
 * exact comparison against that transcript, so a sentence where the two
 * disagree marks a learner WRONG FOR HEARING CORRECTLY — and nobody finds it,
 * because it looks like the learner being bad at Korean.
 *
 * jsdom leaves play()/pause() as notImplementedMethod own properties of
 * HTMLMediaElement.prototype, so they are saved and restored rather than
 * deleted — deleting would remove jsdom's and leak into the next file.
 */

let realPlay: typeof HTMLMediaElement.prototype.play
let realPause: typeof HTMLMediaElement.prototype.pause

beforeEach(() => {
  realPlay = HTMLMediaElement.prototype.play
  realPause = HTMLMediaElement.prototype.pause
  HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined) as never
  HTMLMediaElement.prototype.pause = vi.fn() as never
})

afterEach(() => {
  HTMLMediaElement.prototype.play = realPlay
  HTMLMediaElement.prototype.pause = realPause
})

async function openStudio() {
  renderRoute('/dictation/ds-1')
  await screen.findByRole('heading', { name: 'Hội thoại công sở' })
  return userEvent.setup()
}

describe('nghe duyệt từng câu', () => {
  // The reviewer has to be able to read the sentence AND hear it. The learner's
  // payload deliberately carries neither the Korean nor a way to scrub; this
  // one carries both, which is why they are separate schemas.
  it('shows every sentence with its Korean and a way to play it', async () => {
    await openStudio()

    expect(screen.getByText('오늘 회사에서 많이 바빴어요?')).toBeInTheDocument()
    expect(screen.getByText('네, 새로운 프로젝트 때문에 회의가 많았어요.')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Nghe câu này' })).toHaveLength(3)
  })

  it('records a verdict and updates the counter', async () => {
    const user = await openStudio()

    // Three, not two: the stale approval counts as needing another listen,
    // which is the whole point of tracking staleness at all.
    expect(screen.getByText('3 chưa nghe')).toBeInTheDocument()

    const first = screen.getByText('오늘 회사에서 많이 바빴어요?').closest('li')!
    await user.click(within(first).getByRole('button', { name: 'Đạt' }))

    expect(await screen.findByText('2 chưa nghe')).toBeInTheDocument()
  })

  // A rejection with no reason is a sentence nobody can fix: the reason is what
  // tells the author whether to re-cut the audio, fix the transcript, or drop
  // the sentence. Refused on the client and 422'd on the server.
  it('will not save a rejection without a reason', async () => {
    const user = await openStudio()

    const first = screen.getByText('오늘 회사에서 많이 바빴어요?').closest('li')!
    await user.click(within(first).getByRole('button', { name: 'Chưa đạt' }))

    const save = within(first).getByRole('button', { name: 'Lưu lý do' })
    expect(save).toBeDisabled()

    await user.type(within(first).getByLabelText('Lý do chưa đạt'), 'tiếng không khớp lời thoại')
    expect(save).toBeEnabled()
    await user.click(save)

    expect(await within(first).findByText(/chưa đạt — tiếng không khớp lời thoại/)).toBeInTheDocument()
  })

  /**
   * The row this screen exists to get right.
   *
   * On the wire it still says APPROVED — only `stale` distinguishes it from a
   * sentence somebody actually passed. Rendering the verdict without the flag
   * ships a native speaker's signature on audio that no longer exists.
   */
  it('reports a verdict that went stale as needing another listen', async () => {
    await openStudio()

    const edited = screen.getByText('프로젝트는 잘 진행되고 있어요?').closest('li')!
    expect(within(edited).getByText('đã sửa sau khi duyệt')).toBeInTheDocument()
    // It must NOT read as passed.
    expect(within(edited).queryByText(/^đạt/)).not.toBeInTheDocument()
  })

  // Prompting rather than locking: a reviewer who listened on an earlier pass
  // should not be shut out, and a control that lies about being unavailable is
  // worse than one that trusts them. The publish gate is the real check.
  it('says when a sentence has not been played yet', async () => {
    const user = await openStudio()

    const first = screen.getByText('오늘 회사에서 많이 바빴어요?').closest('li')!
    expect(within(first).getByText('Bạn chưa nghe câu này.')).toBeInTheDocument()

    await user.click(within(first).getByRole('button', { name: 'Nghe câu này' }))
    expect(within(first).queryByText('Bạn chưa nghe câu này.')).not.toBeInTheDocument()
  })
})

describe('cổng xuất bản', () => {
  async function openPublish() {
    const user = await openStudio()
    await user.click(screen.getByRole('button', { name: 'Xuất bản' }))
    return { user, dialog: await screen.findByRole('dialog') }
  }

  // Two groups, not one list. Merging them reads better and destroys the
  // distinction the server went to the trouble of making.
  it('shows blockers and warnings as two separate groups', async () => {
    const { dialog } = await openPublish()

    const blockers = within(dialog).getByRole('heading', { name: /^Lỗi chặn/ })
    const warnings = within(dialog).getByRole('heading', { name: /^Cảnh báo/ })
    expect(blockers.closest('section')).not.toBe(warnings.closest('section'))
  })

  it('names every sentence that blocks, and refuses to publish', async () => {
    const { dialog } = await openPublish()

    const section = within(dialog).getByRole('heading', { name: /^Lỗi chặn/ }).closest('section')!
    const blockers = within(section).getAllByRole('listitem').map((li) => li.textContent ?? '')

    // Two unreviewed sentences, one stale approval, one unsettled dictionary
    // entry — every one of them named, because "3 câu hỏng" sends a reviewer
    // back through the whole set to find which three.
    expect(blockers.some((b) => b.includes('Câu 1'))).toBe(true)
    expect(blockers.some((b) => b.includes('Câu 2'))).toBe(true)
    expect(blockers.some((b) => b.includes('Câu 3') && b.includes('đã sửa'))).toBe(true)
    expect(blockers.some((b) => b.includes('프로젝트'))).toBe(true)

    expect(within(dialog).getByRole('button', { name: /Xuất bản/ })).toBeDisabled()
  })

  it('publishes once every sentence has been heard', async () => {
    const user = await openStudio()

    // Pass all three, and settle the dictionary entry the same way the importer
    // would have if the author had filled it in.
    for (const sentence of [
      '오늘 회사에서 많이 바빴어요?',
      '네, 새로운 프로젝트 때문에 회의가 많았어요.',
      '프로젝트는 잘 진행되고 있어요?',
    ]) {
      const row = screen.getByText(sentence).closest('li')!
      await user.click(within(row).getByRole('button', { name: 'Đạt' }))
    }
    expect(await screen.findByText('đã nghe hết')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Xuất bản' }))
    const dialog = await screen.findByRole('dialog')

    // The unsettled dictionary entry still blocks — that is deliberate, because
    // YC-426 offers these to learners as cards.
    const section = within(dialog).getByRole('heading', { name: /^Lỗi chặn/ }).closest('section')!
    const blockers = within(section).getAllByRole('listitem').map((li) => li.textContent ?? '')
    expect(blockers).toHaveLength(1)
    expect(blockers[0]).toContain('프로젝트')
  })
})
