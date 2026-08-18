import { Button } from '../../components/ui'

/**
 * The refusal, and the way past it.
 *
 * TCCN-301-8 is the strongest criterion in the set, and the drafted document
 * proposes it as the product's **fifth prohibition**. Changing the answer key
 * of a question people have already sat rewrites every score derived from it
 * and every denominator in the error log — "sai 8 trên 11 lần gặp", the number
 * this whole product exists to produce, changes meaning with nobody being
 * told, including the person who pressed save. The learner sees nothing; their
 * history is simply different.
 *
 * Two things this component is careful about:
 *
 * It states the count, not just the refusal. "Không sửa được" invites a second
 * attempt through some other route; "đã nằm trong 11 lượt đã nộp" explains
 * itself and points at the versioning path, which is the correct move rather
 * than a workaround.
 *
 * And it is **not** the enforcement. The other four prohibitions are blocked
 * beneath the layer that could regress — REVOKE, triggers, constraints — and
 * this one has to be too, because the layer above it is exactly this screen.
 * That guard does not exist in kolearn-server yet; see the README.
 */
export function AnswerLockNotice({
  attemptedCount,
  questionOrdinal,
  onCreateVersion,
  busy,
}: {
  attemptedCount: number
  questionOrdinal: number
  onCreateVersion: () => void
  busy: boolean
}) {
  return (
    <div role="alert" className="rounded-xl border border-wrong/40 bg-wrong/10 p-4">
      <p className="font-semibold text-wrong">Không sửa được đáp án của câu đã có người làm</p>
      <p className="mt-1 text-sm text-ink">
        Câu {questionOrdinal} đã nằm trong {attemptedCount} lượt làm bài đã nộp. Đổi đáp án sẽ
        viết lại điểm của tất cả các lượt đó và mọi mẫu số trong nhật ký lỗi — người học không
        thấy gì cả, lịch sử của họ chỉ đơn giản là khác đi.
      </p>
      <p className="mt-2 text-sm text-ink">
        Lối đi đúng là tạo một <strong>phiên bản mới</strong> của câu hỏi. Câu cũ giữ nguyên đáp
        án và mọi lượt đã tham chiếu tới nó.
      </p>
      <div className="mt-3">
        <Button size="sm" onClick={onCreateVersion} disabled={busy}>
          {busy ? 'Đang tạo…' : 'Tạo phiên bản mới'}
        </Button>
      </div>
    </div>
  )
}
