import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { renderRoute } from '../test/harness'
import { mockShadowVideo } from '../mocks/handlers'

/**
 * Chủ đề và nhãn, on the authoring side.
 *
 * Two axes with two shapes, and the shapes are the design. A category is one
 * choice from a curated list, so it is a `<select>` and nobody can invent one by
 * typing; a tag is many and open, so it is a text field the server normalises.
 *
 * What these tests hold shut is the thing that would quietly break the learner's
 * chip row: a category an author could type. One typo and "Du lịch" becomes two
 * shelves, both half full, and nothing anywhere says so.
 *
 * Fixtures: sv-1 is filed under "Hội thoại hàng ngày" with two tags, sv-2 is
 * unfiled; ds-1 is under "Công việc", ds-2 is unfiled.
 */

function rowFor(title: string) {
  return screen.getByRole('link', { name: title }).closest('tr')!
}

describe('the studio files a lesson under a curated shelf', () => {
  it('offers the vocabulary as a menu and never as a free text field', async () => {
    renderRoute('/videos/sv-1')

    const picker = await screen.findByLabelText('Chủ đề')
    // A <select>, not an <input>. This is the whole guarantee: an author cannot
    // create a shelf by mistyping one, so the learner's chip row cannot
    // fragment.
    expect(picker.tagName).toBe('SELECT')
    // The vocabulary arrives in its own request, so the menu fills a moment
    // after the field appears — and stays disabled until it does, rather than
    // showing an empty menu that reads as a corpus with no categories.
    await waitFor(() => {
      expect(within(picker).getByRole('option', { name: 'Hội thoại hàng ngày' })).toBeInTheDocument()
    })

    // "— Chưa chọn —" is a real option and not a placeholder: clearing a
    // category has to be possible, and a select whose first entry is
    // unselectable would let an author file something and never unfile it.
    expect(within(picker).getByRole('option', { name: '— Chưa chọn —' })).toBeInTheDocument()
  })

  it('saves the choice and the labels together, in one Lưu nháp', async () => {
    const user = userEvent.setup()
    renderRoute('/videos/sv-1')

    const picker = await screen.findByLabelText('Chủ đề')
    await waitFor(() => expect(within(picker).getByRole('option', { name: 'Tin tức' })).toBeInTheDocument())
    await user.selectOptions(picker, 'sc-2')

    const tags = screen.getByLabelText('Nhãn')
    await user.clear(tags)
    await user.type(tags, 'Trung cấp, phỏng vấn')
    await user.click(screen.getByRole('button', { name: /Lưu nháp/ }))

    await waitFor(() => {
      expect(mockShadowVideo('sv-1')?.categoryName).toBe('Tin tức')
    })
    expect(mockShadowVideo('sv-1')?.tags).toEqual(['phỏng vấn', 'Trung cấp'])
  })

  it('lets a lesson be un-filed, because the gate warns rather than refuses', async () => {
    const user = userEvent.setup()
    renderRoute('/videos/sv-1')

    const picker = await screen.findByLabelText('Chủ đề')
    await waitFor(() => expect(picker).not.toBeDisabled())
    await user.selectOptions(picker, '')
    await user.click(screen.getByRole('button', { name: /Lưu nháp/ }))

    // An empty categoryId clears it. There is no "leave it alone": the request
    // is the whole metadata record, the same rule topicIds already follows.
    await waitFor(() => {
      expect(mockShadowVideo('sv-1')?.categoryId).toBeUndefined()
    })
  })

  it('collapses two spellings of one label into one tag', async () => {
    const user = userEvent.setup()
    renderRoute('/videos/sv-1')

    const tags = await screen.findByLabelText('Nhãn')
    await user.clear(tags)
    await user.type(tags, 'Sơ cấp, sơ cấp,  ,Nghe hiểu')
    await user.click(screen.getByRole('button', { name: /Lưu nháp/ }))

    // The server is what makes a plain comma-separated box safe: two spellings
    // of one label would otherwise render as two chips on the same row, which
    // looks like a data-entry bug because it is one.
    await waitFor(() => {
      expect(mockShadowVideo('sv-1')?.tags).toEqual(['Nghe hiểu', 'Sơ cấp'])
    })
  })
})

describe('the list says which shelf each row is on', () => {
  it('names the category, and says so out loud when there is none', async () => {
    renderRoute('/videos')

    await screen.findByRole('link', { name: 'Đặt bàn nhà hàng' })
    expect(within(rowFor('Đặt bàn nhà hàng')).getAllByRole('cell')[1]).toHaveTextContent(
      'Hội thoại hàng ngày',
    )

    // This is where somebody notices that nine of eleven rows are unfiled. They
    // cannot notice it one studio page at a time, so a blank cell would be the
    // wrong answer.
    expect(within(rowFor('Ngữ liệu mới')).getAllByRole('cell')[1]).toHaveTextContent('chưa chọn')
  })

  it('shows a row its labels under the title', async () => {
    renderRoute('/videos')
    await screen.findByRole('link', { name: 'Đặt bàn nhà hàng' })
    expect(within(rowFor('Đặt bàn nhà hàng')).getByText('Nhà hàng · Sơ cấp')).toBeInTheDocument()
  })
})

describe('the vocabulary itself is editable, and deleting one never takes lessons with it', () => {
  it('adds a shelf without ever asking an author what a slug is', async () => {
    const user = userEvent.setup()
    renderRoute('/videos')

    await user.click(await screen.findByRole('button', { name: /Chủ đề \(2\)/ }))

    const dialog = await screen.findByRole('dialog')
    await user.type(within(dialog).getByLabelText('Thêm chủ đề'), 'Du lịch')
    await user.click(within(dialog).getByRole('button', { name: 'Thêm' }))

    // The slug is derived on the server, which is why a one-field form works.
    await waitFor(() => {
      expect(within(dialog).getByText('du-lich')).toBeInTheDocument()
    })
  })

  it('says what a delete costs before the second click, because the server will not refuse it', async () => {
    const user = userEvent.setup()
    renderRoute('/videos')

    await user.click(await screen.findByRole('button', { name: /Chủ đề/ }))
    const dialog = await screen.findByRole('dialog')

    const row = within(dialog).getByDisplayValue('Hội thoại hàng ngày').closest('li')!
    await user.click(within(row).getByRole('button', { name: 'Xoá' }))

    // Refusing would mean an author cannot retire a shelf without re-filing
    // every lesson on it first, which is how a vocabulary ends up with a
    // category nobody wants and nobody can remove. So the warning is the only
    // thing standing here, and it has to say what actually happens.
    expect(within(row).getByText(/vẫn còn nguyên/)).toBeInTheDocument()

    await user.click(within(row).getByRole('button', { name: 'Xoá thật' }))

    await waitFor(() => {
      expect(within(dialog).queryByDisplayValue('Hội thoại hàng ngày')).not.toBeInTheDocument()
    })
    // The lesson survives, uncategorised — ON DELETE SET NULL.
    expect(mockShadowVideo('sv-1')?.categoryId).toBeUndefined()
    expect(mockShadowVideo('sv-1')?.title).toBe('Đặt bàn nhà hàng')
  })
})

describe('chép chính tả gets the same two fields, in its own dialog', () => {
  it('files a set and labels it without touching a single verdict', async () => {
    const user = userEvent.setup()
    renderRoute('/dictation')

    await screen.findByRole('link', { name: 'Hội thoại công sở' })
    await user.click(within(rowFor('Hội thoại công sở')).getByRole('button', { name: 'Sửa' }))

    const dialog = await screen.findByRole('dialog')
    // Its own vocabulary, never nhại theo's: "Hội thoại hàng ngày" is a
    // shadowing shelf and must not be offered here (migration 00035).
    const picker = within(dialog).getByLabelText('Chủ đề')
    expect(within(picker).queryByRole('option', { name: 'Hội thoại hàng ngày' })).toBeNull()
    expect(within(picker).getByRole('option', { name: 'Tin tức' })).toBeInTheDocument()

    await user.selectOptions(picker, 'dc-2')
    await user.type(within(dialog).getByLabelText('Nhãn'), ', Thời sự')
    await user.click(within(dialog).getByRole('button', { name: 'Lưu' }))

    await waitFor(() => {
      expect(within(rowFor('Hội thoại công sở')).getAllByRole('cell')[1]).toHaveTextContent(
        'Tin tức',
      )
    })
    // The counter this screen exists for is untouched: re-filing a set is the
    // same audio saying the same sentences.
    const cells = within(rowFor('Hội thoại công sở')).getAllByRole('cell')
    expect(cells[4]).toHaveTextContent('3')
  })
})
