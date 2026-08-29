import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getGetAdminExamQueryKey,
  getListAdminExamsQueryKey,
  updateAdminExam,
} from '../../api/gen/kolearn'
import type { AdminExamDetail } from '../../api/gen/model'
import { userMessage } from '../../lib/problem'
import { Button, ErrorNote, PageTitle } from '../../components/ui'

/**
 * The cap the server enforces, repeated here so the field stops where the API
 * does.
 *
 * A copy rather than a shared constant: the generated client carries
 * `@maxLength 200` as a doc comment on `UpdateExamRequest.title` and exposes no
 * value to read it from. So the server's 422 is what actually holds the line,
 * which is why `save.error` is rendered rather than assumed unreachable.
 */
const MAX_TITLE_LENGTH = 200

/**
 * How few characters must be left before the count is worth showing.
 *
 * A counter on an empty field is noise on the one screen where the limit will
 * never be reached; a counter that appears only as the field fills is the
 * warning it was meant to be.
 */
const COUNTER_SHOWS_UNDER = 20

/**
 * The paper's name, and the form that changes it.
 *
 * The title and nothing else. A form that also reached `code`, `level` or
 * `blueprintVersion` would put four different decisions behind one "Lưu": the
 * code is the paper's identity, the other two are structure every section was
 * cut from, and none of them is what "sửa tên đề" means. `status` has the
 * publish dialog, which exists so that a release is never something that
 * happens on the way past something else.
 *
 * Editable whatever the status, matching the server. A published paper's title
 * is the one a learner can actually see, so it is the one most worth being able
 * to correct — and a rename touches no question, no answer key and no score.
 *
 * The `h1` stays put while the form is open, and the form opens underneath it.
 * Swapping the heading for the field would read well and leave the page with no
 * `h1` for as long as someone is typing; keeping it also means the name being
 * changed is still on screen beside the field changing it.
 */
export function ExamTitleEditor({
  exam,
  canEdit,
}: {
  exam: AdminExamDetail
  canEdit: boolean
}) {
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(exam.title)
  const input = useRef<HTMLInputElement>(null)
  const openButton = useRef<HTMLButtonElement>(null)
  /* Focus returns to the button only when the form is what the author was in.
     Without this, the first render — and any rename made from elsewhere —
     would pull focus out from under them. */
  const wasEditing = useRef(false)

  const save = useMutation({
    mutationFn: (title: string) => updateAdminExam(exam.id, { title }),
    onSuccess: async (updated) => {
      // Seeded, not merely invalidated: the response is the whole paper, so the
      // heading can show the saved name on the next frame rather than the old
      // one until a refetch lands.
      queryClient.setQueryData(getGetAdminExamQueryKey(exam.id), updated)
      setEditing(false)
      await queryClient.invalidateQueries({ queryKey: getListAdminExamsQueryKey() })
    },
  })

  useEffect(() => {
    if (editing) {
      input.current?.focus()
      // Selected, not just focused: a rename is usually a retype, and an author
      // who meant to append can still press End.
      input.current?.select()
    } else if (wasEditing.current) {
      openButton.current?.focus()
    }
    wasEditing.current = editing
  }, [editing])

  function open() {
    setDraft(exam.title)
    save.reset()
    setEditing(true)
  }

  function cancel() {
    save.reset()
    setEditing(false)
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    save.mutate(draft.trim())
  }

  const trimmed = draft.trim()
  const unchanged = trimmed === exam.title
  const remaining = MAX_TITLE_LENGTH - draft.length

  return (
    <div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <PageTitle>{exam.title}</PageTitle>
        {canEdit && !editing && (
          <Button ref={openButton} variant="ghost" size="sm" onClick={open}>
            Sửa tên
          </Button>
        )}
      </div>

      {editing && (
        <form onSubmit={onSubmit} className="mt-3 max-w-xl">
          <label htmlFor="exam-title" className="text-xs font-medium text-muted">
            Tên đề
          </label>
          <input
            ref={input}
            id="exam-title"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            /* Escape closes the form, as it closes the publish dialog. The
               handler sits on the field rather than the document because this
               form is not modal, and Escape elsewhere on the page is not
               about it. */
            onKeyDown={(e) => {
              if (e.key === 'Escape') cancel()
            }}
            maxLength={MAX_TITLE_LENGTH}
            disabled={save.isPending}
            aria-describedby={remaining < COUNTER_SHOWS_UNDER ? 'exam-title-remaining' : undefined}
            className="tap mt-1 w-full rounded-xl border border-line bg-white px-4 text-base text-ink"
          />
          {remaining < COUNTER_SHOWS_UNDER && (
            <p id="exam-title-remaining" className="mt-1 text-xs text-muted">
              Còn {remaining} ký tự
            </p>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Button type="submit" size="sm" disabled={save.isPending || !trimmed || unchanged}>
              {save.isPending ? 'Đang lưu…' : 'Lưu'}
            </Button>
            <Button type="button" variant="secondary" size="sm" onClick={cancel}>
              Huỷ
            </Button>
            {/* Why the button is not armed, said before it is pressed rather
                than after. Neither of these is an error yet. */}
            {!trimmed && <span className="text-xs text-muted">Tên đề không được để trống.</span>}
            {trimmed && unchanged && (
              <span className="text-xs text-muted">Chưa có gì thay đổi.</span>
            )}
          </div>
          {save.error != null && (
            <div className="mt-2">
              <ErrorNote>{userMessage(save.error)}</ErrorNote>
            </div>
          )}
        </form>
      )}
    </div>
  )
}
