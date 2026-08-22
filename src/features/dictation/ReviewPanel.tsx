import { useRef, useState } from 'react'
import { setAdminDictationApproval } from '../../api/gen/kolearn'
import type { AdminDictationItem } from '../../api/gen/model'
import { userMessage } from '../../lib/problem'
import { Badge, Button, ErrorNote, TextField } from '../../components/ui'

/**
 * "Người bản ngữ nghe duyệt từng câu" — for dictation.
 *
 * This panel is the entire reason the dictation studio exists.
 * `cmd/dictation-import` writes the sentences, the translations, the dictionary
 * and the anchors; the one thing it cannot do is hear whether the audio says
 * what the transcript claims.
 *
 * That check is not a formality here, it is the feature's safety property.
 * Grading is exact comparison against `textKo`, so a sentence whose audio and
 * transcript disagree marks a learner WRONG FOR HEARING CORRECTLY — and they
 * have no way to tell that from their own mistake. Nobody finds it later,
 * because it looks like the learner being bad at Korean.
 *
 * Two rules make a verdict mean something:
 *
 *   - It is given after PLAYING the clip. There is no shortcut to approve a
 *     whole set here for the same reason — the publish gate reports a set whose
 *     verdicts were all stamped at once, and that is the only trace a skipped
 *     pass leaves.
 *   - It retires when the sentence moves under it. The server stamps each
 *     verdict with the sentence's revision and reports `stale`; the gate counts
 *     a stale one as unreviewed.
 */

const REASONS = [
  'tiếng không khớp lời thoại',
  'phát âm sai',
  'nghe không rõ',
  'tốc độ quá nhanh',
  'tiếng ồn nền',
  'cắt mất đầu hoặc cuối câu',
]

export function ReviewPanel({
  setId,
  items,
  onChanged,
}: {
  setId: string
  items: AdminDictationItem[]
  onChanged: () => void
}) {
  const [rejecting, setRejecting] = useState<string | null>(null)
  const [reason, setReason] = useState('')
  const [error, setError] = useState<unknown>(null)
  const [busy, setBusy] = useState(false)
  const [playedIds, setPlayed] = useState<Set<string>>(new Set())

  // One element reused for every sentence. A player per row would let a
  // reviewer start three at once, which is a good way to pass the wrong one.
  const audioRef = useRef<HTMLAudioElement | null>(null)

  const play = (item: AdminDictationItem) => {
    const el = audioRef.current
    if (!el) return
    el.src = item.audioUrl
    el.currentTime = 0
    void el.play().catch(() => {})
    setPlayed((prev) => new Set(prev).add(item.id))
  }

  const send = async (
    itemId: string,
    verdict: 'APPROVED' | 'REJECTED' | 'UNREVIEWED',
    note = '',
  ) => {
    setBusy(true)
    setError(null)
    try {
      await setAdminDictationApproval(setId, itemId, { verdict, note })
      setRejecting(null)
      setReason('')
      onChanged()
    } catch (err) {
      setError(err)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mt-2">
      <audio ref={audioRef} preload="none" className="hidden" />
      {error !== null && <ErrorNote>{userMessage(error)}</ErrorNote>}

      <ol className="mt-2 grid gap-2">
        {items.map((item) => (
          <li key={item.id} className="rounded-xl border border-line bg-white p-3">
            <div className="flex flex-wrap items-center gap-3">
              <span className="font-mono text-xs text-muted">{item.ordinal}</span>
              <span className="ko flex-1">{item.textKo}</span>
              <span className="font-mono text-xs tabular-nums text-muted">
                {(item.durationMs / 1000).toFixed(1)}s
              </span>
              <Verdict item={item} />
            </div>

            {/* The Vietnamese under the Korean, because a reviewer checking
                whether the audio matches the sentence is also the last person
                who will read the translation before a learner does. */}
            {item.textVi !== '' && <p className="mt-1 text-sm text-muted">{item.textVi}</p>}

            <div className="mt-2 flex flex-wrap gap-2">
              <Button type="button" variant="ghost" onClick={() => play(item)}>
                Nghe câu này
              </Button>
              {/* Not disabled until played — a reviewer who listened on another
                  pass should not be locked out, and a control that lies about
                  being unavailable is worse than one that trusts them. The
                  prompt below is a nudge, and the publish gate is the check. */}
              <Button
                type="button"
                variant="secondary"
                disabled={busy}
                onClick={() => void send(item.id, 'APPROVED')}
              >
                Đạt
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={busy}
                onClick={() => setRejecting(item.id)}
              >
                Chưa đạt
              </Button>
              {item.approval.verdict !== 'UNREVIEWED' && (
                <Button
                  type="button"
                  variant="ghost"
                  disabled={busy}
                  onClick={() => void send(item.id, 'UNREVIEWED')}
                >
                  Bỏ đánh dấu
                </Button>
              )}
              {!playedIds.has(item.id) && item.approval.verdict === 'UNREVIEWED' && (
                <span className="self-center text-xs text-muted">Bạn chưa nghe câu này.</span>
              )}
            </div>

            {rejecting === item.id && (
              <div className="mt-2 flex flex-wrap items-end gap-2">
                <TextField
                  id={`reason-${item.id}`}
                  label="Lý do chưa đạt"
                  list="dictation-rejection-reasons"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
                <datalist id="dictation-rejection-reasons">
                  {REASONS.map((r) => (
                    <option key={r} value={r} />
                  ))}
                </datalist>
                {/* A rejection with no reason is a sentence nobody can fix: it
                    is what tells the author whether to re-cut the audio, fix
                    the transcript, or drop the sentence. Refused here and 422'd
                    on the server. */}
                <Button
                  type="button"
                  disabled={reason.trim() === '' || busy}
                  onClick={() => void send(item.id, 'REJECTED', reason)}
                >
                  Lưu lý do
                </Button>
                <Button type="button" variant="ghost" onClick={() => setRejecting(null)}>
                  Huỷ
                </Button>
              </div>
            )}
          </li>
        ))}
      </ol>
    </div>
  )
}

function Verdict({ item }: { item: AdminDictationItem }) {
  const { verdict, note, stale, reviewedByName } = item.approval

  // A stale verdict is reported as stale rather than as what it used to say.
  // On screen it looks identical to a fresh one, which is exactly how a
  // native speaker's signature ends up on audio that no longer exists.
  if (stale) return <Badge tone="warn">đã sửa sau khi duyệt</Badge>
  if (verdict === 'APPROVED') {
    return <Badge tone="ok">{reviewedByName ? `đạt · ${reviewedByName}` : 'đạt'}</Badge>
  }
  if (verdict === 'REJECTED') return <Badge tone="bad">chưa đạt — {note}</Badge>
  return <Badge>chưa nghe</Badge>
}
