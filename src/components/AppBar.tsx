import { useEffect, useRef, useState } from 'react'
import { Link, useRouterState } from '@tanstack/react-router'
import { useAuth } from '../lib/auth'
import { XamiMark } from './XamiMark'

/**
 * The one navigation bar, mounted once in `RootLayout`.
 *
 * Carries the signed-in author's name, which kolearn-web's does not. On a
 * learner app there is one kind of account; here there are four, they differ
 * in what they may do, and "why is Xuất bản not there" is answered by seeing
 * which account you are signed in as.
 *
 * Below `lg` the links fold behind a menu button. An admin's eight links and
 * Đăng xuất come to about 890px, and on a phone the row wrapped each label onto
 * three lines and clipped everything past Thanh toán, Đăng xuất included, off
 * the right edge. One `<nav>` serves both layouts rather than a second copy for
 * the phone: the links exist once, so `getByRole('link')` in the suite still
 * finds exactly one of each, and a permission check cannot be edited in one
 * copy and forgotten in the other.
 *
 * Active state comes from `data-status`, which the router sets on the anchor
 * itself. Passing a second `className` through `activeProps` would leave both
 * `text-muted` and `text-brand-800` on the element and let the generated
 * stylesheet's ordering decide which wins.
 */
const NAV_ITEM =
  'tap flex items-center rounded-lg px-3 text-base font-medium whitespace-nowrap text-muted ' +
  'transition-colors hover:bg-brand-100 hover:text-brand-800 ' +
  'data-[status=active]:bg-brand-100 data-[status=active]:font-semibold ' +
  'data-[status=active]:text-brand-800 lg:px-2 lg:text-sm'

/**
 * A full-width sheet on a phone, a dropdown under the button from `sm`, and
 * the plain row from `lg`.
 *
 * The row is tight for an admin, and what it drops is decided by measurement
 * rather than taste. At `lg` the links go to `px-2` and the logo to its mark
 * alone, which leaves about 100px spare at 1024; the wordmark and the author's
 * name come back at `xl`, where the bar stops growing at `max-w-6xl` and the
 * spare is about 50px. It was already wrapping every label at 1024 before the
 * menu existed, which a two-line label at `text-sm` hides well: it is 42px
 * tall, inside the 44px `.tap` floor.
 */
const NAV_PANEL =
  'absolute inset-x-0 top-full max-h-[calc(100dvh-3.5rem)] flex-col gap-1 overflow-y-auto ' +
  'border-b border-brand-200 bg-brand-50 p-3 shadow-lg ' +
  'sm:right-4 sm:left-auto sm:w-72 sm:rounded-b-xl sm:border-x ' +
  'lg:static lg:flex lg:max-h-none lg:w-auto lg:flex-row lg:items-center lg:gap-0.5 ' +
  'lg:overflow-visible lg:rounded-none lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none'

export function AppBar() {
  const { signOut, user } = useAuth()
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const toggle = useRef<HTMLButtonElement>(null)

  /* Which screen the menu is open over, rather than whether it is open — the
     shape kolearn-web's drawer uses, for its reason: a menu belongs to the
     screen it was opened on. Following a link, or the browser's back gesture,
     changes the path and the menu is closed by derivation, with no effect to
     keep in step and no `setState` in one for `react-hooks` to refuse. */
  const [openAt, setOpenAt] = useState<string | null>(null)
  const open = openAt === pathname

  /* Escape closes and hands focus back to the button, since the link that
     held it has just gone `display: none`. */
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      setOpenAt(null)
      toggle.current?.focus()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  return (
    <>
      {/* Under the bar and over the page: a tap outside the menu closes it
          instead of landing on whatever the sheet was covering. */}
      {open && (
        <div
          aria-hidden
          onClick={() => setOpenAt(null)}
          className="fixed inset-0 z-20 bg-ink/20 lg:hidden"
        />
      )}
      <header className="sticky top-0 z-30 border-b border-brand-200 bg-brand-50">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between gap-2 px-4">
          <Link
            to="/exams"
            aria-label="Xami — ngân hàng đề"
            className="tap -ml-1 flex shrink-0 items-center gap-2 rounded-lg px-1 font-bold tracking-tight text-brand-800"
          >
            <XamiMark className="size-7" />
            <span className="lg:hidden xl:inline">Ngân hàng đề</span>
          </Link>

          <button
            ref={toggle}
            type="button"
            onClick={() => setOpenAt(open ? null : pathname)}
            aria-expanded={open}
            aria-controls="app-nav"
            aria-label="Menu điều hướng"
            className="tap -mr-2.5 inline-flex items-center justify-center rounded-lg text-brand-800 transition-colors hover:bg-brand-100 lg:hidden"
          >
            <MenuGlyph open={open} />
          </button>

          {/* The click handler is for the one link that does not change the
              path — the screen you are already on — which would otherwise leave
              the menu open over it. */}
          <nav
            id="app-nav"
            aria-label="Điều hướng chính"
            onClick={(e) => {
              if (e.target instanceof Element && e.target.closest('a')) setOpenAt(null)
            }}
            className={`${open ? 'flex' : 'hidden'} ${NAV_PANEL}`}
          >
            <Link to="/exams" className={NAV_ITEM}>
              Đề thi
            </Link>
            <Link to="/videos" className={NAV_ITEM}>
              Xưởng ngữ liệu
            </Link>
            <Link to="/dictation" className={NAV_ITEM}>
              Chép chính tả
            </Link>
            <Link to="/imports" className={NAV_ITEM}>
              Nhập lô
            </Link>
            {/* Offered only to an account that can use it. The rest of the nav
                is open to every account that reaches this app because the bank's
                floor, exam:read, is what let them in; billing:manage is held by
                admin alone, and a link to a screen that 403s teaches the wrong
                model of one's own account. */}
            {user?.permissions.includes('billing:manage') && (
              <Link to="/billing" className={NAV_ITEM}>
                Thanh toán
              </Link>
            )}
            {/* Beside Thanh toán and under the same permission, because issuing
                a discount is the same act as minting a mã nâng cấp at a smaller
                number. A separate link rather than a tab inside it — the two
                screens answer questions asked by different people at different
                times. */}
            {user?.permissions.includes('billing:manage') && (
              <Link to="/promotions" className={NAV_ITEM}>
                Khuyến mãi
              </Link>
            )}
            {/* Admin alone. `user:role:assign` is the permission 00003 gives to
                that role and to no other, so it is what "admin only" means here;
                `user:read` would show the link to support, whose account cannot
                do anything on the screen behind it. */}
            {user?.permissions.includes('user:role:assign') && (
              <Link to="/users" className={NAV_ITEM}>
                Người dùng
              </Link>
            )}
            {/* Admin alone (00064), and offered only to the account that holds
                it, for the reason Thanh toán is. */}
            {user?.permissions.includes('early_access:manage') && (
              <Link to="/early-access" className={NAV_ITEM}>
                Truy cập sớm
              </Link>
            )}

            {/* The account, then the way out of it, under a rule in the menu.
                In the row the name waits for `xl` (see NAV_PANEL), and is
                capped and truncated there: the spare is sized for a short
                display name, and a bare email should lose its tail rather than
                push Đăng xuất off the bar. */}
            <div className="mt-2 flex items-center justify-between gap-2 border-t border-brand-200 pt-2 lg:mt-0 lg:ml-2 lg:border-0 lg:pt-0">
              {user && (
                <span className="min-w-0 truncate px-3 text-sm text-muted lg:hidden lg:max-w-40 lg:px-0 lg:text-xs xl:block">
                  {user.displayName || user.email}
                </span>
              )}

              <button
                type="button"
                onClick={() => void signOut()}
                className="tap inline-flex shrink-0 items-center rounded-lg px-3 text-base font-medium text-muted transition-colors hover:bg-brand-100 hover:text-brand-800 lg:px-2 lg:text-sm"
              >
                Đăng xuất
              </button>
            </div>
          </nav>
        </div>
      </header>
    </>
  )
}

/**
 * Three lines shut, a cross open. The same 24×24 box and 2px round stroke as
 * kolearn-web's `MenuIcon`, and `aria-hidden` for the reason its note gives:
 * the name belongs on the button, and a titled `svg` would add an image to the
 * tree on every screen.
 */
function MenuGlyph({ open }: { open: boolean }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-6 shrink-0"
    >
      {open ? <path d="M6 6l12 12M18 6 6 18" /> : <path d="M4 6h16M4 12h16M4 18h16" />}
    </svg>
  )
}
