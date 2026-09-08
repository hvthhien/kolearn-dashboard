import { useState } from 'react'
import { BusyDot } from '../../components/ui'

/**
 * Nội dung này dành cho gói nào — the one control that decides whether gói Cơ
 * bản can reach an item.
 *
 * ── Why it is on the list and not in the editor ────────────────────────────
 *
 * The question this answers is never about one item. It is "how much of the
 * shelf is open", and that is a thing somebody looks at a whole column to
 * decide — the same argument the chủ đề column already makes about noticing
 * that nine of eleven rows are unfiled. An operator opening papers one editor
 * page at a time cannot see the shape of what they are giving away.
 *
 * ── Why it is a switch and not a dialog ────────────────────────────────────
 *
 * Nothing here is destructive and everything is instantly reversible: the
 * flag reaches learners on their next list load and reaches nothing else. A
 * confirmation step on a reversible toggle is a step people learn to click
 * through, which is what makes the next confirmation — the one on a delete —
 * worth less.
 *
 * ── Why it is `disabled` rather than hidden for most operators ─────────────
 *
 * `billing:manage` is `admin` alone, and the people who spend all day on
 * these lists are content editors who do not hold it. Hiding the column from
 * them would mean the shelf's most consequential fact is invisible to exactly
 * the people publishing to it. So they read it and cannot change it, which is
 * what the server enforces anyway — rbac is the rule, this is the courtesy.
 */
export function PremiumToggle({
  premium,
  label,
  canChange,
  onChange,
  onError,
}: {
  premium: boolean
  /** What this row is, for a screen reader that hears the switch out of context. */
  label: string
  canChange: boolean
  /** Resolves once the server has agreed. The caller refreshes its own list. */
  onChange: (premium: boolean) => Promise<void>
  onError: (error: unknown) => void
}) {
  const [busy, setBusy] = useState(false)

  /* No optimistic flip. The row re-reads from the list query the caller
     invalidates, so an optimistic value would be a second source of truth
     that has to be unwound on a 403 — and a 403 is the likely failure here,
     since the whole point of the permission is that some callers meet it. */
  const toggle = async () => {
    setBusy(true)
    try {
      await onChange(!premium)
    } catch (err) {
      onError(err)
    } finally {
      setBusy(false)
    }
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        role="switch"
        aria-checked={premium}
        aria-label={`${label}: dành riêng cho Premium`}
        disabled={!canChange || busy}
        onClick={() => void toggle()}
        className={
          /* `justify-end` rather than a translate: the travel is then whatever
             is left over inside the pill, so the knob stays flush at both ends
             if either size ever changes. A hardcoded offset drifts silently. */
          'tap inline-flex h-5 w-9 shrink-0 items-center rounded-full border p-0.5 ' +
          'transition-colors disabled:cursor-not-allowed disabled:opacity-60 ' +
          (premium ? 'justify-end border-brand bg-brand' : 'justify-start border-line bg-white')
        }
      >
        <span
          aria-hidden
          className={
            'size-3.5 rounded-full bg-white shadow ' + (premium ? '' : 'border border-line')
          }
        />
      </button>
      {/* The word, not only the switch. A row is scanned down a column, and a
          column of bare switches makes a reader work out which way is which
          from the fill colour alone. */}
      <span className={`text-xs ${premium ? 'font-medium text-ink' : 'text-muted'}`}>
        {premium ? 'Premium' : 'Miễn phí'}
      </span>
      {busy && <BusyDot className="size-3.5" />}
    </span>
  )
}
