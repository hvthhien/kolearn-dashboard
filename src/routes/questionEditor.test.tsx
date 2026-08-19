import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { http, HttpResponse } from 'msw'
import { server } from '../mocks/server'
import { mockQuestion } from '../mocks/handlers'
import { renderRoute } from '../test/harness'

const Q15 = '/exams/e-83/questions/q-15'
const Q16 = '/exams/e-83/questions/q-16'

/** The stem's Korean box, once the editor has loaded. */
async function stemKo() {
  return screen.findByLabelText('Đề bài (tiếng Hàn)')
}

describe('YC-301: soạn đề, năm tầng và bản dịch', () => {
  // TCCN-301-1 (drafted): the Vietnamese box sits beside the Korean one, on
  // the same screen. A translation authored on a second screen is authored
  // without the sentence it translates in view — and YC-121 makes the
  // translation the precondition for layers 2 and 3 meaning anything at all.
  it('TCCN-301-1: đề bài và bản dịch nằm cạnh nhau trên cùng một màn hình', async () => {
    renderRoute(Q15)

    expect(await stemKo()).toHaveValue('이 글의 내용과 같은 것을 고르십시오.')
    expect(screen.getByLabelText('Bản dịch đề bài (tiếng Việt)')).toHaveValue(
      'Chọn nội dung đúng với bài đọc.',
    )
  })

  // TCCN-301-1 (drafted): "cả bốn lựa chọn đều có ô dịch riêng, không chỉ đề
  // bài". A translated stem over untranslated choices is the exact gap YC-121
  // warns about: the learner cannot read the option the explanation is about.
  it('TCCN-301-1: cả bốn lựa chọn đều có ô dịch riêng', async () => {
    renderRoute(Q15)
    await stemKo()

    for (const n of [1, 2, 3, 4]) {
      expect(screen.getByLabelText(`Tiếng Hàn`, { selector: `#choice-${n}-ko` })).toBeInTheDocument()
      expect(
        screen.getByLabelText('Bản dịch tiếng Việt', { selector: `#choice-${n}-vi` }),
      ).toBeInTheDocument()
    }
  })

  // TCCN-301-2 (drafted): three distractors, three separate layer-3 boxes, and
  // no shared box for the question. One explanation shown to whoever picked
  // any of the three can only be an explanation that says nothing about any of
  // them — layer 3 answers "why is *your* choice wrong".
  it('TCCN-301-2: mỗi lựa chọn sai có ô tầng 3 riêng, không có ô chung', async () => {
    renderRoute(Q15)
    await stemKo()

    // Choice 2 is the correct one, so 1, 3 and 4 are the distractors.
    for (const n of [1, 3, 4]) {
      expect(
        screen.getByLabelText(`Tầng 3 — vì sao lựa chọn ${n} sai (tiếng Hàn)`),
      ).toBeInTheDocument()
    }
    expect(
      screen.queryByLabelText('Tầng 3 — vì sao lựa chọn 2 sai (tiếng Hàn)'),
    ).not.toBeInTheDocument()

    const shared = screen
      .queryAllByRole('textbox')
      .filter((el) => /tầng 3/i.test(el.getAttribute('aria-label') ?? ''))
    expect(shared).toHaveLength(0)
  })

  // TCCN-301-3 (drafted): an unwritten layer is stored as absent, not as "".
  // The difference only shows on the learner's review screen, where an empty
  // string renders a layer heading with nothing under it — read as "the author
  // had nothing to say" rather than "nobody has written this yet". This screen
  // is the only thing in the system that can manufacture that empty string.
  it('TCCN-301-3: tầng để trống gửi đi là null, không phải chuỗi rỗng', async () => {
    const bodies: unknown[] = []
    server.events.on('request:start', async ({ request }) => {
      if (request.method === 'PUT') bodies.push(await request.clone().json())
    })

    const user = userEvent.setup()
    renderRoute(Q16)
    await stemKo()

    // Q16 has no layer 2 at all; type into it and clear it again, so the field
    // is genuinely touched-and-blank rather than merely untouched.
    const layer2 = screen.getByLabelText('Tầng 2 (tiếng Hàn)')
    await user.type(layer2, 'tạm')
    await user.clear(layer2)
    await user.click(screen.getByRole('button', { name: 'Lưu nháp' }))

    await screen.findByText('Đã lưu.')

    const body = bodies.at(-1) as Record<string, unknown>
    expect(body.explanationCorrectKo).toBeNull()
    expect(body.explanationCorrectVi).toBeNull()
    // And the same rule for the per-choice layer 3.
    const choices = body.choices as { whyWrongKo: unknown }[]
    expect(choices.every((c) => c.whyWrongKo === null)).toBe(true)

    // Whitespace is blank too — " " is the version of this bug that survives a
    // careless review.
    expect(Object.values(body).some((v) => v === '' && v !== body.stemVi)).toBe(false)
  })

  // TCCN-301-3 (drafted): the same rule applied to what the server then holds.
  // Asserting only on the request body would pass against a server that
  // coerced null back to "" on write.
  it('TCCN-301-3: sau khi lưu, tầng chưa soạn vẫn là không có', async () => {
    const user = userEvent.setup()
    renderRoute(Q16)
    await stemKo()

    await user.click(screen.getByRole('button', { name: 'Lưu nháp' }))
    await screen.findByText('Đã lưu.')

    await waitFor(() => {
      expect(mockQuestion('q-16')?.explanationCorrectKo).toBeNull()
    })
  })

  // TCCN-301-10 (drafted): a half-built question saves. Requiring four choices
  // at the first save only teaches an author to type filler to get past it,
  // and the filler stays. The publish gate is where the shape is enforced.
  it('TCCN-301-10: câu chỉ có 3 lựa chọn vẫn lưu nháp được', async () => {
    const user = userEvent.setup()
    renderRoute(Q16)
    await stemKo()

    expect(screen.getByText(/3\/4 lựa chọn/)).toBeInTheDocument()
    expect(screen.getByText(/xuất bản cần đúng 4/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Lưu nháp' }))
    await screen.findByText('Đã lưu.')
  })

  it('hiển thị lỗi máy chủ nguyên văn, không viết lại', async () => {
    server.use(
      http.put('/api/v1/admin/questions/:id', () =>
        HttpResponse.json(
          {
            type: '/problems/validation',
            title: 'Không lưu được',
            status: 400,
            code: 'validation',
            detail: 'Đề bài không được để trống.',
          },
          { status: 400, headers: { 'content-type': 'application/problem+json' } },
        ),
      ),
    )
    const user = userEvent.setup()
    renderRoute(Q16)
    await stemKo()

    await user.click(screen.getByRole('button', { name: 'Lưu nháp' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Đề bài không được để trống.')
  })
})

describe('YC-303: độ khó', () => {
  // TCCN-303-1 (drafted): assigned by hand while authoring, and stored where
  // the hand-tagged value is distinguishable from one derived from attempt
  // data. ver1.0 uses only the first; keeping both from the start is what
  // stops this being a schema change later.
  it('TCCN-303-1: gắn độ khó khi soạn, và lưu cùng câu hỏi', async () => {
    const user = userEvent.setup()
    renderRoute(Q16)
    await stemKo()

    await user.selectOptions(screen.getByLabelText('Độ khó'), '4')
    await user.click(screen.getByRole('button', { name: 'Lưu nháp' }))
    await screen.findByText('Đã lưu.')

    await waitFor(() => {
      expect(mockQuestion('q-16')?.difficultyManual).toBe(4)
    })
  })

  // TOPIK6 is the band that did not exist before migration 00021, when the
  // scale ran 1-5. A control that still stops at five would leave the top of
  // the ladder unreachable for every question in the bank, and the placement
  // test would quietly never suggest it.
  it('TCCN-303-1: gắn được TOPIK6, cấp cao nhất của thang', async () => {
    const user = userEvent.setup()
    renderRoute(Q16)
    await stemKo()

    await user.selectOptions(screen.getByLabelText('Độ khó'), '6')
    await user.click(screen.getByRole('button', { name: 'Lưu nháp' }))
    await screen.findByText('Đã lưu.')

    await waitFor(() => {
      expect(mockQuestion('q-16')?.difficultyManual).toBe(6)
    })
  })

  it('TCCN-303-1: độ khó suy từ dữ liệu hiện tách khỏi độ khó gắn tay', async () => {
    renderRoute(Q15)
    await stemKo()

    expect(screen.getByLabelText('Độ khó')).toHaveValue('2')
    expect(screen.getByText(/Suy từ dữ liệu làm bài: 0\.412/)).toBeInTheDocument()
    expect(screen.getByText(/ver1\.0 không dùng/)).toBeInTheDocument()
  })

  // TCCN-303-3 (drafted): unassigned is a legitimate state — a warning with a
  // count at publish time, never a blocker.
  it('TCCN-303-3: câu chưa gắn độ khó vẫn lưu được, và hiện là "Chưa gắn"', async () => {
    const user = userEvent.setup()
    renderRoute(Q16)
    await stemKo()

    const select = screen.getByLabelText('Độ khó')
    expect(select).toHaveValue('')
    expect(within(select as HTMLSelectElement).getByText('Chưa gắn')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Lưu nháp' }))
    await screen.findByText('Đã lưu.')
    expect(mockQuestion('q-16')?.difficultyManual).toBeNull()
  })
})
