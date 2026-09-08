import { useEffect, useState } from 'react'

export interface Pager {
  page: number
  pageSize: number
  /** Rows to skip, for the list query's `offset`. */
  offset: number
  /** Step to a page, for the pager's own two buttons. */
  go: (page: number) => void
  /** Back to page one, for anything that changes what is being asked for. */
  reset: () => void
}

/**
 * The page a list is on, and the window to ask the server for.
 *
 * One hook rather than `useState(0)` in four screens, because the same mistake
 * is what a hand-rolled pager makes: any change to what is being asked for has
 * to start at the first page. Staying on page four of a narrower result set is
 * how a filter comes back empty for a reason nobody can see — so `reset` sits
 * beside every chip and every search box, and screens call it rather than
 * `go(0)`, which reads as a step and not as a fresh question.
 */
export function usePager(pageSize: number): Pager {
  const [page, setPage] = useState(0)
  return {
    page,
    pageSize,
    offset: page * pageSize,
    go: setPage,
    reset: () => setPage(0),
  }
}

/**
 * Steps a pager down off a page its list no longer has.
 *
 * Removing the last row of the last page leaves the pager pointing past the
 * end, where the list comes back empty and the empty state would say "chưa có
 * bộ nào" about a bank holding hundreds — with a "Trang trước" button as the
 * only clue, which is the kind of dead end R-13 exists to prevent.
 *
 * Called after the list query rather than inside `usePager`, because the total
 * it corrects against is in that query's answer. `undefined` is a query still
 * in flight or one whose filter just changed, which is not the same as zero:
 * nothing is yet known about how many pages there are, so nothing is
 * corrected.
 */
export function useClampPage(pager: Pager, total: number | undefined) {
  const { page, pageSize, go } = pager
  useEffect(() => {
    if (total === undefined) return
    const lastPage = Math.max(0, Math.ceil(total / pageSize) - 1)
    if (page > lastPage) go(lastPage)
    // `go` is setState, stable across renders; `pager` itself is a new object
    // every render and would make this an every-render effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageSize, total])
}
