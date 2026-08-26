import { Select, TextField } from '../../components/ui'

/**
 * Chủ đề và nhãn, on the authoring side.
 *
 * One module for both studios even though the two vocabularies are deliberately
 * separate on the server (migration 00035). What is shared here is the shape of
 * the controls — a select of curated names, a text field of free labels — and
 * the props carry nothing that could let one feature's categories reach the
 * other's form.
 *
 * The two axes are edited differently on purpose. A category is one choice from
 * a closed list, so it is a `<select>` and an author cannot invent one by
 * typing; a tag is many and open, so it is a text field the server normalises.
 * Making tags a picker would mean a modal before every label; making categories
 * a text field would fragment the learner's chip row on the first typo.
 */

/** What both selects need, whichever feature the list came from. */
export interface CategoryOption {
  id: string
  name: string
}

/**
 * The category picker.
 *
 * "— Chưa chọn —" is a real option and not a placeholder, because clearing a
 * category has to be possible: `categoryId: ''` is what the request means by
 * uncategorised, and a select whose first entry is unselectable would let an
 * author file something by accident and never unfile it.
 *
 * Never required. The publish gate warns about a missing category and does not
 * refuse — an author forced to pick one before saving picks the first one in
 * the list, which is worse than an honest blank.
 */
export function CategorySelect({
  id,
  categories,
  value,
  onChange,
  /** Absent while the list is still loading, so the control can say so rather
   *  than showing an empty menu that looks like a corpus with no categories. */
  loading = false,
}: {
  id: string
  categories: CategoryOption[]
  value: string
  onChange: (categoryId: string) => void
  loading?: boolean
}) {
  return (
    <Select
      id={id}
      label="Chủ đề"
      hint="Chủ đề xếp bài học vào một mục trên màn hình người học. Không bắt buộc, nhưng bài học không có chủ đề chỉ nằm ở mục “Tất cả”."
      value={value}
      disabled={loading}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">— Chưa chọn —</option>
      {categories.map((c) => (
        <option key={c.id} value={c.id}>
          {c.name}
        </option>
      ))}
      {/* A category deleted or renamed underneath an open form would otherwise
          select nothing, silently clearing the field on the next save. Naming
          it keeps the value visible until somebody chooses. */}
      {value !== '' && !categories.some((c) => c.id === value) && (
        <option value={value}>(chủ đề đã bị xoá)</option>
      )}
    </Select>
  )
}

/** The separator authors type between labels, and the one they get back. */
const SEPARATOR = ', '

/** Comma-separated text → the array the request carries. */
export function parseTags(text: string): string[] {
  return text
    .split(',')
    .map((t) => t.trim().replace(/\s+/g, ' '))
    .filter((t) => t !== '')
}

/** The array a lesson came back with → the text an author edits. */
export function formatTags(tags: string[]): string {
  return tags.join(SEPARATOR)
}

/**
 * The tag field.
 *
 * A plain comma-separated text box rather than a chip editor, and the server is
 * what makes that safe: it trims, collapses whitespace, drops blanks,
 * de-duplicates case-insensitively and caps at twelve, then resolves each name
 * to a row by R-06's normalised comparison. So "Sơ cấp, sơ  cấp" is one tag
 * whatever an author types, and a chip editor would be a lot of interface
 * enforcing rules that are already enforced.
 *
 * The state is the raw TEXT and not the parsed array, which is what lets an
 * author type a comma and keep going. Parsing on every keystroke would delete
 * the separator they just pressed.
 */
export function TagField({
  id,
  value,
  onChange,
}: {
  id: string
  value: string
  onChange: (text: string) => void
}) {
  const count = parseTags(value).length
  return (
    <TextField
      id={id}
      label="Nhãn"
      hint={
        count > MAX_TAGS
          ? `Chỉ ${MAX_TAGS} nhãn đầu tiên được lưu — hiện đang có ${count}.`
          : 'Cách nhau bằng dấu phẩy. Nhãn hiện trên thẻ bài học; trùng hoa thường được gộp lại.'
      }
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  )
}

/** The server's cap, repeated here only to warn before a save silently trims.
 *  The server is the rule; this is the courtesy. */
export const MAX_TAGS = 12
