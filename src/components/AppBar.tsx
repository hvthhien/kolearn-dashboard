import { Link } from '@tanstack/react-router'
import { useAuth } from '../lib/auth'

/**
 * The one navigation bar, mounted once in `RootLayout`.
 *
 * Carries the signed-in author's name, which kolearn-web's does not. On a
 * learner app there is one kind of account; here there are four, they differ
 * in what they may do, and "why is Xuất bản not there" is answered by seeing
 * which account you are signed in as.
 *
 * Active state comes from `data-status`, which the router sets on the anchor
 * itself. Passing a second `className` through `activeProps` would leave both
 * `text-muted` and `text-brand-800` on the element and let the generated
 * stylesheet's ordering decide which wins.
 */
const NAV_ITEM =
  'tap inline-flex items-center rounded-lg px-2.5 text-sm font-medium text-muted ' +
  'transition-colors hover:bg-brand-100 hover:text-brand-800 ' +
  'data-[status=active]:bg-brand-100 data-[status=active]:font-semibold ' +
  'data-[status=active]:text-brand-800 sm:px-3'

export function AppBar() {
  const { signOut, user } = useAuth()

  return (
    <header className="sticky top-0 z-30 border-b border-brand-200 bg-brand-50">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between gap-2 px-4">
        <Link
          to="/exams"
          aria-label="Kolearn — ngân hàng đề"
          className="tap -ml-1 flex shrink-0 items-center gap-2 rounded-lg px-1 font-bold tracking-tight text-brand-800"
        >
          <span
            aria-hidden
            className="grid size-7 shrink-0 place-items-center rounded-lg bg-brand-400 text-xs font-bold text-brand-900"
          >
            한
          </span>
          <span className="hidden sm:inline">Ngân hàng đề</span>
        </Link>

        <nav aria-label="Điều hướng chính" className="flex items-center gap-0.5">
          <Link to="/exams" className={NAV_ITEM}>
            Đề thi
          </Link>
          <Link to="/imports" className={NAV_ITEM}>
            Nhập lô
          </Link>

          {user && (
            <span className="ml-2 hidden text-xs text-muted md:inline">
              {user.displayName || user.email}
            </span>
          )}

          <button
            type="button"
            aria-label="Đăng xuất"
            onClick={() => void signOut()}
            className="tap ml-0.5 inline-flex items-center rounded-lg px-2 text-sm font-medium text-muted transition-colors hover:bg-brand-100 hover:text-brand-800 sm:px-3"
          >
            <span className="hidden sm:inline">Đăng xuất</span>
            <span className="sm:hidden" aria-hidden>
              ⎋
            </span>
          </button>
        </nav>
      </div>
    </header>
  )
}
