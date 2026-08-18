import {
  createRootRouteWithContext,
  createRoute,
  createRouter,
  Link,
  Navigate,
  Outlet,
  redirect,
  useRouterState,
} from '@tanstack/react-router'
import type { QueryClient } from '@tanstack/react-query'
import { useAuth } from './lib/auth'
import { queryClient } from './lib/queryClient'
import { EmptyState, PageShell, PageTitle, Spinner } from './components/ui'
import { AppBar } from './components/AppBar'
import { RouteProgress } from './components/RouteProgress'
import { MockBanner } from './components/MockBanner'
import { LoginPage } from './routes/LoginPage'
import { ExamListPage } from './routes/ExamListPage'
import { ExamDetailPage } from './routes/ExamDetailPage'
import { QuestionEditorPage } from './routes/QuestionEditorPage'
import { ImportPage } from './routes/ImportPage'

interface RouterContext {
  queryClient: QueryClient
}

const PUBLIC_PATHS = ['/login']

/**
 * The permission every screen here needs at minimum. `exam:read` is held by
 * `content_editor`, `content_admin` and `admin`, and not by `learner` or
 * `support` — which is the line this app exists on the far side of.
 */
const REQUIRED_PERMISSION = 'exam:read'

/**
 * The session gate, plus a permission gate the learner app has no use for.
 *
 * Deliberately the root component rather than a pathless layout route: a
 * layout route with an id prefixes every route id with it, so every `to` and
 * `from` in the app would read `/authed/exams` while the URL stayed `/exams`.
 * Two names for one route is how a typo survives review.
 *
 * A learner who signs in here is refused rather than redirected. They have a
 * valid session and there is nowhere in this app to send them; bouncing them
 * back to the login form they just completed reads as "wrong password", which
 * is a different problem with a different fix.
 *
 * This is the courtesy layer, not the enforcement one. Every `/admin`
 * operation is gated server-side by `rbac`, and hiding a button no more
 * protects a route than a disabled submit protects an endpoint.
 */
function RootLayout() {
  const { status, user } = useAuth()
  const pathname = useRouterState({ select: (s) => s.location.pathname })

  const body = () => {
    if (PUBLIC_PATHS.includes(pathname)) return <Outlet />
    if (status === 'loading') return <Spinner label="Đang kiểm tra phiên đăng nhập…" />
    if (status === 'anonymous') return <Navigate to="/login" replace />
    if (user && !user.permissions.includes(REQUIRED_PERMISSION)) {
      return (
        <PageShell>
          <PageTitle>Tài khoản này không vào được ngân hàng đề</PageTitle>
          <p className="mt-2 max-w-prose text-sm text-muted">
            Đây là màn quản trị nội bộ. Tài khoản của bạn đăng nhập thành công nhưng chưa
            được cấp quyền soạn đề — cần vai trò <code>content_editor</code> trở lên.
          </p>
        </PageShell>
      )
    }
    return <Outlet />
  }

  const authorised =
    status === 'authenticated' && !!user?.permissions.includes(REQUIRED_PERMISSION)

  return (
    <>
      <RouteProgress />
      {/* Above the sign-in form too: knowing the backend is fake matters most
          to whoever is about to wonder why their real credentials work. */}
      <MockBanner />
      {authorised && !PUBLIC_PATHS.includes(pathname) && <AppBar />}
      {body()}
    </>
  )
}

const rootRoute = createRootRouteWithContext<RouterContext>()({
  component: RootLayout,
  notFoundComponent: () => (
    <PageShell>
      <PageTitle>Không tìm thấy trang</PageTitle>
      <div className="mt-4">
        <EmptyState
          title="Đường dẫn này không tồn tại"
          action={
            <Link to="/exams" className="font-semibold text-brand">
              Về danh sách đề
            </Link>
          }
        />
      </div>
    </PageShell>
  ),
})

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  beforeLoad: () => {
    throw redirect({ to: '/exams' })
  },
})

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/login',
  component: LoginPage,
})

const examsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/exams',
  component: ExamListPage,
})

const examDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/exams/$examId',
  component: ExamDetailPage,
})

const questionEditorRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/exams/$examId/questions/$questionId',
  component: QuestionEditorPage,
})

const importRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/imports',
  component: ImportPage,
})

export const routeTree = rootRoute.addChildren([
  indexRoute,
  loginRoute,
  examsRoute,
  examDetailRoute,
  questionEditorRoute,
  importRoute,
])

export const router = createRouter({
  routeTree,
  context: { queryClient },
  defaultPreload: false,
})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
