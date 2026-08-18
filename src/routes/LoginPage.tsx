import { useState } from 'react'
import type { FormEvent } from 'react'
import { Navigate } from '@tanstack/react-router'
import { useAuth } from '../lib/auth'
import { userMessage } from '../lib/problem'
import { Button, ErrorNote, PageShell, PageTitle, TextField } from '../components/ui'

export function LoginPage() {
  const { status, signIn } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<unknown>(null)
  const [busy, setBusy] = useState(false)

  if (status === 'authenticated') return <Navigate to="/exams" replace />

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await signIn(email, password)
    } catch (err) {
      setError(err)
    } finally {
      setBusy(false)
    }
  }

  return (
    <PageShell className="max-w-md">
      <PageTitle>Đăng nhập</PageTitle>
      <p className="mt-2 text-sm text-muted">
        Màn quản trị nội bộ. Tài khoản được cấp cùng vai trò — không tự đăng ký.
      </p>
      <form className="mt-6 flex flex-col gap-4" onSubmit={onSubmit}>
        <TextField
          id="email"
          label="Email"
          type="email"
          autoComplete="username"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <TextField
          id="password"
          label="Mật khẩu"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {error != null && <ErrorNote>{userMessage(error)}</ErrorNote>}
        <Button type="submit" disabled={busy}>
          {busy ? 'Đang đăng nhập…' : 'Đăng nhập'}
        </Button>
      </form>
    </PageShell>
  )
}
