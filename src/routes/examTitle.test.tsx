import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { renderRoute } from '../test/harness'
import { server } from '../mocks/server'
import { MOCK_USER } from '../mocks/handlers'

/**
 * Sửa tên đề, on SC-BANK-ADMIN's detail screen.
 *
 * Fixtures: `e-83` is a draft, `e-84` has been published. Both matter — the
 * published one is the case the feature exists for, because its title is the
 * one a learner can actually see.
 */

/** Opens the rename form on a paper and hands back its input. */
async function openRename(examId: string) {
  const user = userEvent.setup()
  renderRoute(`/exams/${examId}`)
  await user.click(await screen.findByRole('button', { name: 'Sửa tên' }))
  return { user, field: await screen.findByLabelText('Tên đề') }
}

/** Signs in as a role holding everything except `exam:write`. */
function withoutExamWrite() {
  const user = {
    ...MOCK_USER,
    permissions: MOCK_USER.permissions.filter((p) => p !== 'exam:write'),
  }
  server.use(
    http.post('/api/v1/auth/refresh', () =>
      HttpResponse.json({ accessToken: 'mock-access-token', expiresIn: 900, user }),
    ),
  )
}

describe('sửa tên đề', () => {
  it('lưu tên mới, và tiêu đề trang đổi theo', async () => {
    const { user, field } = await openRename('e-83')

    await user.clear(field)
    await user.type(field, 'Đề luyện tập 83 (đã đổi tên)')
    await user.click(screen.getByRole('button', { name: 'Lưu' }))

    // The heading, not just the field: the screen re-renders from the paper the
    // server returned, so this is what proves the save reached it.
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Đề luyện tập 83 (đã đổi tên)' }),
    ).toBeInTheDocument()
    // And the form closes behind it.
    expect(screen.queryByLabelText('Tên đề')).not.toBeInTheDocument()
  })

  // The whole point of not gating this on status. A published paper's title is
  // the one a learner reads; renaming touches no question, no answer key and no
  // score, so refusing here would make the visible typos the unfixable ones.
  it('đề đã xuất bản vẫn sửa được tên, và vẫn là đã xuất bản', async () => {
    const { user, field } = await openRename('e-84')

    await user.clear(field)
    await user.type(field, 'Đề luyện tập 84 (sửa sau khi xuất bản)')
    await user.click(screen.getByRole('button', { name: 'Lưu' }))

    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: 'Đề luyện tập 84 (sửa sau khi xuất bản)',
      }),
    ).toBeInTheDocument()
    expect(screen.getByText('Đã xuất bản')).toBeInTheDocument()
  })

  it('tên rỗng thì không lưu được, và nói vì sao trước khi bấm', async () => {
    const { user, field } = await openRename('e-83')

    await user.clear(field)
    expect(screen.getByRole('button', { name: 'Lưu' })).toBeDisabled()
    expect(screen.getByText('Tên đề không được để trống.')).toBeInTheDocument()

    // Whitespace is the version of this that survives review.
    await user.type(field, '   ')
    expect(screen.getByRole('button', { name: 'Lưu' })).toBeDisabled()
  })

  it('chưa sửa gì thì nút Lưu chưa bật', async () => {
    await openRename('e-83')
    expect(screen.getByRole('button', { name: 'Lưu' })).toBeDisabled()
    expect(screen.getByText('Chưa có gì thay đổi.')).toBeInTheDocument()
  })

  it('Huỷ bỏ bản nháp đang gõ, tên cũ giữ nguyên', async () => {
    const { user, field } = await openRename('e-83')

    await user.clear(field)
    await user.type(field, 'Tên không bao giờ được lưu')
    await user.click(screen.getByRole('button', { name: 'Huỷ' }))

    expect(
      screen.getByRole('heading', { level: 1, name: 'Đề luyện tập 83 (seed)' }),
    ).toBeInTheDocument()

    // And re-opening starts from the saved name, not from what was abandoned.
    await user.click(screen.getByRole('button', { name: 'Sửa tên' }))
    expect(await screen.findByLabelText('Tên đề')).toHaveValue('Đề luyện tập 83 (seed)')
  })

  // The server's 422 is what actually holds the length line — the field's
  // maxLength only stops typing, and says nothing about a value that arrived
  // some other way. So the screen has to render the refusal.
  it('server từ chối thì hiện đúng câu server viết', async () => {
    server.use(
      http.patch('/api/v1/admin/exams/:examId', () =>
        HttpResponse.json(
          {
            title: 'Dữ liệu không hợp lệ',
            status: 422,
            code: 'exam_title_too_long',
            detail: 'Tên đề dài quá 200 ký tự',
          },
          { status: 422, headers: { 'content-type': 'application/problem+json' } },
        ),
      ),
    )
    const { user, field } = await openRename('e-83')

    await user.clear(field)
    await user.type(field, 'Một cái tên nào đó')
    await user.click(screen.getByRole('button', { name: 'Lưu' }))

    expect(await screen.findByText('Tên đề dài quá 200 ký tự')).toBeInTheDocument()
    // The form stays open on a refusal — closing it would throw away what the
    // author typed along with the reason it was refused.
    expect(screen.getByLabelText('Tên đề')).toBeInTheDocument()
  })

  // The courtesy half of the gate. The PATCH is gated on `exam:write`
  // server-side too, which is the half that actually holds — but an author
  // should not be offered a button whose only outcome is a 403.
  it('không có exam:write thì không có nút Sửa tên', async () => {
    withoutExamWrite()
    renderRoute('/exams/e-83')

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Đề luyện tập 83 (seed)' }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Sửa tên' })).not.toBeInTheDocument()
  })

  // A rename the list screen does not report is not a rename: the detail page
  // and the bank list read the same row and must not disagree about its name.
  it('tên mới hiện luôn ở danh sách đề', async () => {
    const { user, field } = await openRename('e-83')

    await user.clear(field)
    await user.type(field, 'Đề đã đổi tên')
    await user.click(screen.getByRole('button', { name: 'Lưu' }))
    await screen.findByRole('heading', { level: 1, name: 'Đề đã đổi tên' })

    // The list links the code and prints the title beside it, so this is the
    // cell that has to have changed.
    await user.click(screen.getByRole('link', { name: 'Đề thi' }))
    await waitFor(() => {
      expect(screen.getByText('Đề đã đổi tên')).toBeInTheDocument()
    })
    expect(screen.queryByText('Đề luyện tập 83 (seed)')).not.toBeInTheDocument()
  })

  it('mở form thì con trỏ vào ô tên, đóng thì quay lại nút', async () => {
    const { user, field } = await openRename('e-83')
    expect(field).toHaveFocus()

    await user.click(screen.getByRole('button', { name: 'Huỷ' }))
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Sửa tên' })).toHaveFocus()
    })
  })

  it('Escape trong ô tên đóng form', async () => {
    const { user } = await openRename('e-83')
    await user.keyboard('{Escape}')

    await waitFor(() => {
      expect(screen.queryByLabelText('Tên đề')).not.toBeInTheDocument()
    })
  })
})

/** Guards the one thing the form must never be able to do. */
describe('sửa tên đề: chỉ đúng cái tên', () => {
  it('form không đụng tới mã đề, cấp độ hay trạng thái', async () => {
    const { user, field } = await openRename('e-83')

    const form = field.closest('form')!
    // One field, and it is the title. A form that also reached `code`, `level`
    // or `blueprintVersion` would put four decisions behind one "Lưu".
    expect(within(form).getAllByRole('textbox')).toHaveLength(1)
    expect(within(form).queryByRole('combobox')).not.toBeInTheDocument()

    await user.clear(field)
    await user.type(field, 'Chỉ đổi mỗi tên')
    await user.click(screen.getByRole('button', { name: 'Lưu' }))
    await screen.findByRole('heading', { level: 1, name: 'Chỉ đổi mỗi tên' })

    // The code and the status are still what they were.
    expect(screen.getByText('SEED-TOPIK-II-83')).toBeInTheDocument()
    expect(screen.getByText('Bản nháp')).toBeInTheDocument()
  })
})
