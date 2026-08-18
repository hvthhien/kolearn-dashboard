import { useEffect, useRef } from 'react'
import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react'

/**
 * The one primitives file, the same arrangement as kolearn-web's.
 *
 * Most of this is that file, unchanged — the argument for centralising a
 * button or a heading does not become a different argument in a different app.
 * Three primitives are new, and each is new for a reason worth stating rather
 * than for variety:
 *
 * - `Table`. The learner app has no tables; every list there is a stack of
 *   bordered cards, because a phone has no room for columns. This app is a
 *   paper of fifty questions on a desk, where "which of these has no layer 3"
 *   is a column-scanning question and a card stack answers it badly.
 * - `Dialog`. kolearn-web keeps its dialogs inside the features that own them
 *   because it has two. This app has the publish gate, the answer lock and the
 *   import confirmation, and a third hand-rolled focus trap is where one of
 *   them gets it wrong.
 * - `Field`. Authoring is a form; the learner app barely is.
 *
 * `PageShell` is wider here. Everything else about the shape is theirs.
 */

/** The page's one `h1`. */
export function PageTitle({ children }: { children: ReactNode }) {
  return <h1 className="text-2xl font-bold text-ink">{children}</h1>
}

/** The muted rule above a group. */
export function SectionHeading({ children, id }: { children: ReactNode; id?: string }) {
  return (
    <h2 id={id} className="text-sm font-semibold tracking-wide text-muted uppercase">
      {children}
    </h2>
  )
}

/** Every interactive control routes through here so `.tap` is never forgotten. */
export function Button({
  variant = 'primary',
  size = 'md',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'md' | 'sm'
}) {
  const base =
    'tap inline-flex items-center justify-center gap-2 rounded-xl font-semibold ' +
    'transition disabled:cursor-not-allowed disabled:opacity-50'
  /* `brand-700` by name rather than through the `brand` alias: white on 700 is
     5.25:1 and on 600 it is 3.46:1, so which step fills this button is a
     contrast decision and should be legible as one. */
  const styles = {
    primary: 'bg-brand-700 text-white hover:bg-brand-800',
    secondary: 'border border-line bg-white text-ink hover:bg-brand-soft',
    ghost: 'text-brand-700 hover:bg-brand-soft',
    danger: 'bg-wrong text-white hover:opacity-90',
  }[variant]
  const sizing = { md: 'px-5 text-base', sm: 'px-3 text-sm' }[size]
  return <button className={`${base} ${styles} ${sizing} ${className}`} {...props} />
}

export interface FilterChoice<T extends string> {
  value: T
  label: string
  /** `undefined` shows no number, which is a different statement from `0`. */
  count?: number
  /** An `sr-only` sentence appended to the accessible name (WCAG 2.5.3). */
  description?: string
}

/** One axis of filtering, as a row of pills. */
export function FilterChips<T extends string>({
  label,
  choices,
  value,
  onChange,
  className = '',
}: {
  label: string
  choices: FilterChoice<T>[]
  value: T
  onChange: (value: T) => void
  className?: string
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className={`flex flex-wrap items-center gap-2 ${className}`}
    >
      {choices.map((choice) => {
        const on = choice.value === value
        return (
          <button
            key={choice.value}
            type="button"
            onClick={() => onChange(choice.value)}
            aria-pressed={on}
            className={`tap rounded-full border px-4 text-sm font-medium ${
              on ? 'border-brand bg-brand text-white' : 'border-line bg-white text-ink'
            }`}
          >
            {choice.count === undefined ? choice.label : `${choice.label} ${choice.count}`}
            {choice.description && <span className="sr-only"> — {choice.description}</span>}
          </button>
        )
      })}
    </div>
  )
}

/**
 * A label, its control, and the sentence that explains it.
 *
 * Takes a rendered control rather than rendering one, because authoring needs
 * a dozen shapes — a radio group, a chip list, a passage with a selection in
 * it — and a `Field` that only knows about inputs would be worked around on
 * the third one.
 */
export function Field({
  label,
  hint,
  htmlFor,
  children,
}: {
  label: ReactNode
  hint?: ReactNode
  htmlFor?: string
  children: ReactNode
}) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={htmlFor} className="text-sm font-medium text-ink">
        {label}
      </label>
      {children}
      {hint && <p className="text-xs text-muted">{hint}</p>}
    </div>
  )
}

export function TextField({
  label,
  hint,
  id,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string; id: string }) {
  return (
    <Field label={label} hint={hint} htmlFor={id}>
      <input
        id={id}
        className="tap rounded-xl border border-line bg-white px-4 text-base text-ink"
        {...props}
      />
    </Field>
  )
}

export function Select({
  label,
  hint,
  id,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { label: string; hint?: string; id: string }) {
  return (
    <Field label={label} hint={hint} htmlFor={id}>
      <select
        id={id}
        className="tap rounded-xl border border-line bg-white px-4 text-base text-ink"
        {...props}
      >
        {children}
      </select>
    </Field>
  )
}

/**
 * `korean` switches on `.ko`, which carries the R-14 size floor and
 * `word-break: keep-all` together. An author proof-reads the same Hangul the
 * learner will read, so the box they read it in obeys the same floor.
 */
export function Textarea({
  label,
  hint,
  id,
  korean = false,
  className = '',
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label: string
  hint?: string
  id: string
  korean?: boolean
}) {
  return (
    <Field label={label} hint={hint} htmlFor={id}>
      <textarea
        id={id}
        className={`w-full rounded-xl border border-line bg-white p-3 text-ink [field-sizing:content] ${
          korean ? 'ko min-h-24' : 'min-h-20 text-base'
        } ${className}`}
        {...props}
      />
    </Field>
  )
}

/**
 * Errors are shown as the server wrote them — the Vietnamese `detail` from the
 * problem document. Rewriting them here would mean maintaining two copies of
 * every message and picking the wrong one under pressure.
 */
export function ErrorNote({ children }: { children: ReactNode }) {
  if (!children) return null
  return (
    <p role="alert" className="rounded-xl bg-wrong/10 px-4 py-3 text-sm text-wrong">
      {children}
    </p>
  )
}

/** A warning that is not a refusal. Distinct from `ErrorNote` on purpose. */
export function WarnNote({ children }: { children: ReactNode }) {
  if (!children) return null
  return <p className="rounded-xl bg-warn-soft px-4 py-3 text-sm text-ink">{children}</p>
}

export function Badge({
  children,
  tone = 'neutral',
}: {
  children: ReactNode
  tone?: 'neutral' | 'ok' | 'warn' | 'bad'
}) {
  const styles = {
    neutral: 'border-line bg-white text-muted',
    ok: 'border-correct/40 bg-correct/10 text-correct',
    warn: 'border-warn/40 bg-warn-soft text-ink',
    bad: 'border-wrong/40 bg-wrong/10 text-wrong',
  }[tone]
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${styles}`}
    >
      {children}
    </span>
  )
}

/**
 * R-13: every list has its own empty state with something to do next, and
 * never a table of zeroes. The action is required rather than optional — an
 * empty state with no way out is the error screen R-13 exists to replace.
 */
export function EmptyState({
  title,
  children,
  action,
}: {
  title: string
  children?: ReactNode
  action: ReactNode
}) {
  return (
    <div className="rounded-2xl border border-dashed border-line bg-white px-6 py-10 text-center">
      <p className="text-lg font-semibold text-ink">{title}</p>
      {children && <p className="mt-1 text-sm text-muted">{children}</p>}
      <div className="mt-4 flex justify-center">{action}</div>
    </div>
  )
}

/**
 * A table with a caption and a scroll container of its own.
 *
 * The container is what keeps R-14's no-horizontal-page-scroll rule true on a
 * narrow window: a fifty-row question table is genuinely wide, so it scrolls
 * inside its own box rather than dragging the page sideways.
 */
export function Table({ caption, head, children }: { caption: string; head: ReactNode; children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-line bg-white">
      <table className="w-full border-collapse text-left text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead className="border-b border-line text-xs tracking-wide text-muted uppercase">
          {head}
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  )
}

export function Th({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <th scope="col" className={`px-3 py-2.5 font-semibold ${className}`}>
      {children}
    </th>
  )
}

export function Td({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <td className={`border-t border-line px-3 py-2.5 align-middle ${className}`}>{children}</td>
}

/**
 * A modal, focus moved into it on open and `Escape` closing it.
 *
 * Rendered inline rather than through a portal: nothing in this app stacks a
 * dialog inside a clipped or transformed container, and a portal would buy
 * only the problem it solves.
 */
export function Dialog({
  title,
  open,
  onClose,
  children,
  footer,
}: {
  title: string
  open: boolean
  onClose: () => void
  children: ReactNode
  footer: ReactNode
}) {
  const panel = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    // Focus the panel, not the first control: the first control in the publish
    // dialog is "Xuất bản", and opening a dialog with the irreversible action
    // pre-focused makes Enter-on-open destructive.
    panel.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-ink/40 p-4">
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className="max-h-[85vh] w-full max-w-xl overflow-y-auto rounded-2xl border border-line bg-white p-6 shadow-xl"
      >
        <h2 className="text-lg font-bold text-ink">{title}</h2>
        <div className="mt-4">{children}</div>
        <div className="mt-6 flex flex-wrap justify-end gap-2">{footer}</div>
      </div>
    </div>
  )
}

/** The moving part, on its own, for use inside a button or a line of text. */
export function BusyDot({ className = '' }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={
        'inline-block size-4 shrink-0 animate-spin rounded-full border-2 ' +
        `border-line border-t-brand motion-reduce:animate-none ${className}`
      }
    />
  )
}

export function Spinner({ label = 'Đang tải…' }: { label?: string }) {
  return (
    <div
      className="flex items-center justify-center gap-3 p-8 text-sm text-muted"
      role="status"
      aria-live="polite"
    >
      <BusyDot />
      {label}
    </div>
  )
}

/** Content being replaced: dimmed, not removed, and `aria-busy` says so. */
export function Refreshing({ busy, children }: { busy: boolean; children: ReactNode }) {
  return (
    <div aria-busy={busy || undefined} className={busy ? 'opacity-50 transition-opacity' : ''}>
      {children}
    </div>
  )
}

/** One grey bar. `aria-hidden` — the wrappers below do the announcing. */
export function Skeleton({ className = '' }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={`animate-pulse rounded-lg bg-line motion-reduce:animate-none ${className}`}
    />
  )
}

/**
 * Rows are `div`s, not `li`s or `tr`s: a placeholder that answers
 * `getAllByRole('row')` would make every table assertion in the suite count
 * furniture as data.
 */
export function SkeletonList({ rows = 4, label = 'Đang tải…' }: { rows?: number; label?: string }) {
  return (
    <div role="status" aria-live="polite" className="rounded-2xl border border-line bg-white px-4">
      <span className="sr-only">{label}</span>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="border-b border-line py-3.5 last:border-0">
          <div className="flex items-baseline justify-between gap-3">
            <Skeleton className="h-4 w-40 max-w-[55%]" />
            <Skeleton className="h-4 w-12" />
          </div>
          <Skeleton className="mt-2 h-3 w-32" />
        </div>
      ))}
    </div>
  )
}

/**
 * Wider than kolearn-web's `max-w-2xl`. That width is a column of Korean text
 * on a phone; this is a fifty-row table beside a blueprint panel on a desk.
 */
export function PageShell({
  children,
  className = '',
}: {
  children: ReactNode
  className?: string
}) {
  return <div className={`mx-auto w-full max-w-6xl px-4 py-6 ${className}`}>{children}</div>
}
