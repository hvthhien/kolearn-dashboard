import { describe, expect, it } from 'vitest'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderRoute } from '../test/harness'
import { mockShadowVideo } from '../mocks/handlers'

/**
 * SC-VIDEO-STUDIO.
 *
 * Driven through the real router over the MSW handlers, so a save is asserted
 * by what the next GET returns rather than by what the component thinks it
 * sent.
 */

describe('TCCN-354-1 and TCCN-354-7: the publish gate', () => {
  it('refuses while a line is unreviewed, and names which line', async () => {
    renderRoute('/videos/sv-1')
    await screen.findByText('Đặt bàn nhà hàng')

    await userEvent.click(screen.getByRole('button', { name: 'Đưa vào ngân hàng' }))
    const dialog = await screen.findByRole('dialog')

    // "3 câu hỏng" would send a native speaker back through the whole video to
    // find which three.
    expect(within(dialog).getByText(/Câu 4: chưa nghe duyệt/)).toBeInTheDocument()
    expect(within(dialog).getByText(/Câu 3: chưa đạt — ngữ điệu cuối câu/)).toBeInTheDocument()

    const confirm = within(dialog).getByRole('button', { name: /Đưa vào ngân hàng|Vẫn đưa/ })
    expect(confirm).toBeDisabled()
  })

  it('keeps blockers and warnings in two separate sections', async () => {
    renderRoute('/videos/sv-1')
    await screen.findByText('Đặt bàn nhà hàng')
    await userEvent.click(screen.getByRole('button', { name: 'Đưa vào ngân hàng' }))
    const dialog = await screen.findByRole('dialog')

    // Merging them would destroy why both exist: if a warning blocked too,
    // nobody would publish anything and the gate would be routed around.
    const blockerHeading = within(dialog).getByText(/^Lỗi chặn \(/)
    const warningHeading = within(dialog).getByText(/^Cảnh báo \(/)
    expect(blockerHeading.closest('section')).not.toBe(warningHeading.closest('section'))
  })

  it('publishes a video whose every line has passed', async () => {
    renderRoute('/videos/sv-3')
    await screen.findByText('Gọi món ở nhà hàng')

    await userEvent.click(screen.getByRole('button', { name: 'Đưa vào ngân hàng' }))
    const dialog = await screen.findByRole('dialog')

    const confirm = within(dialog).getByRole('button', { name: /Đưa vào ngân hàng|Vẫn đưa/ })
    expect(confirm).toBeEnabled()
    await userEvent.click(confirm)

    await screen.findByText(/Đã vào ngân hàng/)
    expect(mockShadowVideo('sv-3')?.status).toBe('PUBLISHED')
  })

  it('says how many lines are unreviewed on the page, before the dialog', async () => {
    renderRoute('/videos/sv-1')
    // The gate is the thing standing between this video and a learner, so it
    // is stated where the author is working rather than only where they commit.
    expect(await screen.findByText(/1 câu chưa duyệt/)).toBeInTheDocument()
  })
})

describe('TCCN-354-2: câu chưa đạt phải kèm lý do', () => {
  it('will not record a rejection with an empty reason', async () => {
    renderRoute('/videos/sv-1')
    await screen.findByText('Đặt bàn nhà hàng')

    const rows = screen.getAllByRole('button', { name: 'Chưa đạt' })
    await userEvent.click(rows[0]!)

    // A rejection with no reason is a line nobody can fix.
    const save = await screen.findByRole('button', { name: 'Lưu lý do' })
    expect(save).toBeDisabled()

    await userEvent.type(screen.getByLabelText('Lý do chưa đạt'), 'phát âm sai')
    expect(save).toBeEnabled()
  })
})

describe('TCCN-354-3: nghĩa trong ngữ cảnh trùng nghĩa chung thì không chốt được', () => {
  it('refuses to settle, and says why on screen', async () => {
    renderRoute('/videos/sv-1')
    await screen.findByText('Đặt bàn nhà hàng')

    // The fixture ships 예약 with both meanings reading "đặt trước" — the case
    // drafting with a model produces most often.
    expect(screen.getByRole('button', { name: 'Chốt nghĩa' })).toBeDisabled()
    // Never a dead button with no explanation.
    expect(screen.getByText(/giống hệt nghĩa chung/)).toBeInTheDocument()
  })

  it('allows it once the context meaning says something different', async () => {
    renderRoute('/videos/sv-1')
    await screen.findByText('Đặt bàn nhà hàng')

    const context = screen.getByLabelText('Nghĩa trong ngữ cảnh')
    await userEvent.clear(context)
    await userEvent.type(context, 'đặt bàn trước')

    expect(screen.getByRole('button', { name: 'Chốt nghĩa' })).toBeEnabled()
  })

  it('re-opens the decision when a settled meaning is edited back to identical', async () => {
    renderRoute('/videos/sv-1')
    await screen.findByText('Đặt bàn nhà hàng')

    const context = screen.getByLabelText('Nghĩa trong ngữ cảnh')
    await userEvent.clear(context)
    await userEvent.type(context, 'đặt bàn trước')
    await userEvent.click(screen.getByRole('button', { name: 'Chốt nghĩa' }))
    expect(screen.getByText('đã chốt')).toBeInTheDocument()

    // Without clearing the flag here, "chốt rồi sửa" walks straight past the
    // one rule this editor exists to enforce.
    await userEvent.clear(context)
    await userEvent.type(context, 'đặt trước')
    expect(screen.getByText('chưa chốt')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Chốt nghĩa' })).toBeDisabled()
  })
})

describe('TCCN-354-4: sửa câu sau khi duyệt thì kết quả duyệt hết hiệu lực', () => {
  it('turns the verdict buttons off while the draft is dirty', async () => {
    renderRoute('/videos/sv-1')
    await screen.findByText('Đặt bàn nhà hàng')

    // Editing a timing makes the saved lines no longer describe what is on
    // screen, and a verdict recorded now would be about audio nobody can play.
    const start = screen.getAllByLabelText('Bắt đầu (ms)')[0]!
    await userEvent.clear(start)
    await userEvent.type(start, '500')

    expect(await screen.findByText(/Lưu nháp trước khi duyệt/)).toBeInTheDocument()
    for (const button of screen.getAllByRole('button', { name: 'Đạt' })) {
      expect(button).toBeDisabled()
    }
  })
})

describe('TCCN-354-5: nháp lưu được dù chưa xong', () => {
  it('saves a video with no file, no lines and no dictionary', async () => {
    renderRoute('/videos/sv-2')
    await screen.findByText('Ngữ liệu mới')

    // Requiring completeness at the first save only teaches an author to type
    // filler, and the filler stays.
    await userEvent.click(screen.getByRole('button', { name: 'Lưu nháp' }))
    expect(await screen.findByText('Đã lưu.')).toBeInTheDocument()
  })
})

describe('TCCN-354-6: hai câu không được chồng mốc thời gian', () => {
  it('reports the overlap and blocks the save', async () => {
    renderRoute('/videos/sv-1')
    await screen.findByText('Đặt bàn nhà hàng')

    // Push line 1's end past line 2's start.
    const end = screen.getAllByLabelText('Kết thúc (ms)')[0]!
    await userEvent.clear(end)
    await userEvent.type(end, '9000')

    expect(await screen.findByText(/chồng mốc thời gian/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Lưu nháp' })).toBeDisabled()
  })
})

describe('audio only, and the poster it needs', () => {
  /**
   * Video was retired in 00034, so there is no kind to choose or display — the
   * studio says what it is and offers the one file type the schema can hold.
   */
  it('offers audio and nothing else', async () => {
    renderRoute('/videos/sv-2')
    await screen.findByRole('heading', { name: 'Âm thanh' })

    expect(screen.getByLabelText('Chọn tệp âm thanh')).toBeInTheDocument()
    expect(screen.queryByLabelText('Chọn tệp video')).not.toBeInTheDocument()
  })

  /**
   * The picture is the whole visual surface of the learner's screen now, and
   * the publish gate refuses an item without one. Saying so in the studio is
   * what stops an author discovering it at the gate, after the work is done.
   */
  it('warns while an item has no poster', async () => {
    renderRoute('/videos/sv-2')
    await screen.findByRole('heading', { name: 'Ảnh xem trước' })
    expect(screen.getByText(/phải có ảnh xem trước/)).toBeInTheDocument()
  })

  it('stops warning once the poster is there, and shows it', async () => {
    const video = mockShadowVideo('sv-2')!
    video.thumbnail = {
      assetId: 'a-thumb',
      playbackUrl: 'https://media.test/shadowing/thumb/abc.png',
      objectKey: 'shadowing/thumb/abc.png',
      byteSize: 240_000,
      mimeType: 'image/webp',
      // Zero, and always will be: an image has no duration, which is why its
      // presence is decided on byte size alone.
      durationMs: 0,
    }

    renderRoute('/videos/sv-2')
    await screen.findByRole('heading', { name: 'Ảnh xem trước' })
    expect(screen.queryByText(/phải có ảnh xem trước/)).not.toBeInTheDocument()
    expect(screen.getByAltText('Ảnh xem trước hiện tại')).toHaveAttribute(
      'src',
      'https://media.test/shadowing/thumb/abc.png',
    )

    delete video.thumbnail
  })
})
