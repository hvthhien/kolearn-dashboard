import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { mockQuestion } from '../mocks/handlers'
import { renderRoute } from '../test/harness'

const SAT = '/exams/e-83/questions/q-15' // 11 submitted attempts
const UNSAT = '/exams/e-83/questions/q-16' // never sat

/**
 * The proposed fifth prohibition, and the one criterion in this repo whose
 * scope has to be stated rather than implied.
 *
 * TCCN-301-8 requires the block to sit **at the data layer**, not in the admin
 * UI: the other four prohibitions are enforced beneath the layer that could
 * regress — REVOKE, triggers, constraints — precisely because the layer above
 * them is a screen like this one. kolearn-server has no such trigger today;
 * `db/migrations` carries no guard on `question_choices.is_correct`.
 *
 * So these tests cover the client half only — that the refusal is surfaced
 * with its reason and the versioning path offered. They are not evidence that
 * the answer key cannot be changed. See README, "What this repo does not
 * prove".
 */
describe('YC-301: khoá đáp án của câu đã có người làm', () => {
  // TCCN-301-8 (drafted): the refusal states why. "Không sửa được" alone
  // invites a second attempt by some other route; the count explains itself.
  it('TCCN-301-8: đổi đáp án của câu đã có người làm bị từ chối, và nói rõ vì sao', async () => {
    const user = userEvent.setup()
    renderRoute(SAT)
    await screen.findByLabelText('Đề bài (tiếng Hàn)')

    // Move the key from choice 2 to choice 4.
    const radios = screen.getAllByRole('radio', { name: 'Đáp án đúng' })
    await user.click(radios[3]!)
    await user.click(screen.getByRole('button', { name: 'Lưu nháp' }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Không sửa được đáp án của câu đã có người làm')
    expect(alert).toHaveTextContent('11 lượt làm bài đã nộp')

    // And the stored key is untouched: choice 2 is still the answer.
    const stored = mockQuestion('q-15')
    expect(stored?.choices.find((c) => c.isCorrect)?.ordinal).toBe(2)
  })

  // TCCN-301-8 (drafted): "lối đi đúng là tạo phiên bản mới của câu hỏi, không
  // sửa tại chỗ". A refusal with no route forward is a refusal people work
  // around by editing the database.
  it('TCCN-301-8: chỉ ra lối đi đúng là tạo phiên bản mới', async () => {
    const user = userEvent.setup()
    renderRoute(SAT)
    await screen.findByLabelText('Đề bài (tiếng Hàn)')

    await user.click(screen.getAllByRole('radio', { name: 'Đáp án đúng' })[3]!)
    await user.click(screen.getByRole('button', { name: 'Lưu nháp' }))

    const version = await screen.findByRole('button', { name: 'Tạo phiên bản mới' })
    await user.click(version)

    // The new version carries no attempts, so its key is free to change.
    const copy = mockQuestion('q-15-v2')
    expect(copy?.attemptedCount).toBe(0)
    // And the original keeps its key and its history.
    expect(mockQuestion('q-15')?.choices.find((c) => c.isCorrect)?.ordinal).toBe(2)
  })

  // TCCN-301-9 (drafted): the boundary case, and the point of stating it — a
  // question nobody has sat is edited freely. This is the ordinary work of an
  // author, not an exception to be granted, so there is no warning at all.
  it('TCCN-301-9: câu chưa ai làm thì đổi đáp án thoải mái, không cảnh báo gì', async () => {
    const user = userEvent.setup()
    renderRoute(UNSAT)
    await screen.findByLabelText('Đề bài (tiếng Hàn)')

    expect(screen.queryByText(/khoá đáp án/)).not.toBeInTheDocument()

    await user.click(screen.getAllByRole('radio', { name: 'Đáp án đúng' })[0]!)
    await user.click(screen.getByRole('button', { name: 'Lưu nháp' }))

    await screen.findByText('Đã lưu.')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(mockQuestion('q-16')?.choices.find((c) => c.isCorrect)?.ordinal).toBe(1)
  })

  it('cảnh báo trước khi lưu khi đáp án vừa bị đổi trên một câu đã có người làm', async () => {
    const user = userEvent.setup()
    renderRoute(SAT)
    await screen.findByLabelText('Đề bài (tiếng Hàn)')

    await user.click(screen.getAllByRole('radio', { name: 'Đáp án đúng' })[3]!)
    expect(screen.getByText(/lưu sẽ bị từ chối/)).toBeInTheDocument()
  })
})
