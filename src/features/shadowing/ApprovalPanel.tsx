import { useState, type RefObject } from 'react'
import { setShadowLineApproval } from '../../api/gen/kolearn'
import type { AdminShadowLine } from '../../api/gen/model'
import { userMessage } from '../../lib/problem'
import { Badge, Button, ErrorNote, TextField, WarnNote } from '../../components/ui'
import { formatMs } from './lineRules'

const REASONS = [
  'ngữ điệu cuối câu',
  'phát âm sai',
  'tốc độ quá nhanh',
  'lệch mốc thời gian',
  'tiếng ồn nền',
]

/**
 * "Người bản ngữ nghe duyệt từng câu."
 *
 * Two rules make this panel mean anything, and both are about what it reads
 * rather than what it renders.
 *
 * It reads the SAVED lines, never the draft. A verdict is a statement about a
 * specific stretch of audio between two specific marks; approving against an
 * unsaved timing would record a verdict about audio nobody — not the reviewer,
 * not the next reader of the row — can play back. So while the draft is dirty
 * the buttons are off, and the reason is on screen.
 *
 * And a verdict retires when the line moves under it. The server stamps each
 * verdict with the line's revision and reports `stale`; the gate counts a stale
 * one as unreviewed. Without that, nudging a mark after sign-off ships a native
 * speaker's signature on audio that no longer exists.
 */
export function ApprovalPanel({
  videoId,
  lines,
  dirty,
  videoRef,
  onChanged,
}: {
  videoId: string
  lines: AdminShadowLine[]
  dirty: boolean
  videoRef: RefObject<HTMLMediaElement | null>
  onChanged: () => void
}) {
  const [rejecting, setRejecting] = useState<string | null>(null)
  const [reason, setReason] = useState('')
  const [error, setError] = useState<unknown>(null)
  const [busy, setBusy] = useState(false)

  const preview = (line: AdminShadowLine) => {
    const el = videoRef.current
    if (!el) return
    el.currentTime = line.startMs / 1000
    void Promise.resolve(el.play()).catch(() => {})
    const stop = () => {
      if (el.currentTime * 1000 >= line.endMs) {
        el.pause()
        el.removeEventListener('timeupdate', stop)
      }
    }
    el.addEventListener('timeupdate', stop)
  }

  const send = async (lineId: string, verdict: 'APPROVED' | 'REJECTED' | 'UNREVIEWED', note = '') => {
    setBusy(true)
    setError(null)
    try {
      await setShadowLineApproval(videoId, lineId, { verdict, note })
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
      {dirty && (
        <WarnNote>
          Có thay đổi chưa lưu. Lưu nháp trước khi duyệt — kết quả duyệt gắn với mốc thời gian đã
          lưu, không phải mốc đang sửa.
        </WarnNote>
      )}
      {error !== null && <ErrorNote>{userMessage(error)}</ErrorNote>}

      <ol className="mt-2 grid gap-2">
        {lines.map((line) => (
          <li key={line.id} className="rounded-xl border border-line bg-white p-3">
            <div className="flex flex-wrap items-center gap-3">
              <span className="font-mono text-xs text-muted">{line.ordinal}</span>
              <span className="ko flex-1 truncate">{line.textKo}</span>
              <span className="font-mono text-xs tabular-nums text-muted">
                {formatMs(line.startMs)}–{formatMs(line.endMs)}
              </span>
              <Verdict line={line} />
            </div>

            <div className="mt-2 flex flex-wrap gap-2">
              <Button type="button" variant="ghost" onClick={() => preview(line)}>
                Nghe câu này
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={dirty || busy}
                onClick={() => void send(line.id, 'APPROVED')}
              >
                Đạt
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={dirty || busy}
                onClick={() => setRejecting(line.id)}
              >
                Chưa đạt
              </Button>
              {line.approval.verdict !== 'UNREVIEWED' && (
                <Button
                  type="button"
                  variant="ghost"
                  disabled={dirty || busy}
                  onClick={() => void send(line.id, 'UNREVIEWED')}
                >
                  Bỏ đánh dấu
                </Button>
              )}
            </div>

            {rejecting === line.id && (
              <div className="mt-2 flex flex-wrap items-end gap-2">
                <TextField
                  id={`reason-${line.id}`}
                  label="Lý do chưa đạt"
                  list="rejection-reasons"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
                <datalist id="rejection-reasons">
                  {REASONS.map((r) => (
                    <option key={r} value={r} />
                  ))}
                </datalist>
                {/* A rejection with no reason is a line nobody can fix — it is
                    what tells the author which of the three routes out to take
                    (TCCN-354-2). Refused here and 422'd on the server. */}
                <Button
                  type="button"
                  disabled={reason.trim() === '' || busy}
                  onClick={() => void send(line.id, 'REJECTED', reason)}
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

function Verdict({ line }: { line: AdminShadowLine }) {
  const { verdict, note, stale } = line.approval

  // Stale reads as unreviewed because that is what it is: nobody has listened
  // to the audio as it now stands.
  if (stale) return <Badge tone="warn">duyệt cũ — câu đã đổi từ lúc duyệt</Badge>
  if (verdict === 'APPROVED') return <Badge tone="ok">đạt</Badge>
  if (verdict === 'REJECTED') return <Badge tone="bad">chưa đạt — {note}</Badge>
  return <Badge>chưa nghe</Badge>
}
