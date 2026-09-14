import { useCallback, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'

import {
  getGetEarlyAccessSettingsQueryKey,
  useGetEarlyAccessSettings,
  useUpdateEarlyAccessSettings,
} from '../../api/gen/kolearn'
import type { EarlyAccessSettings } from '../../api/gen/model'
import { Badge, Button, Dialog, ErrorNote, SkeletonList, TextField } from '../../components/ui'
import { userMessage } from '../../lib/problem'
import { toLocalInput } from './labels'

/**
 * Khoá trang — the one switch that decides who can use Xami at all.
 *
 * The form holds the release date and the capacity line; the lock itself is a
 * separate button with a confirmation, because it is the only setting here
 * whose mistake is felt by every learner at once: switched on by accident, it
 * shows the lock page to everyone without a code; switched off, it opens the
 * product to the whole internet on a day nobody announced.
 */
export function SettingsSection() {
  const { data, error, isPending } = useGetEarlyAccessSettings()

  return (
    <section aria-labelledby="ea-settings-heading" className="mt-6 flex flex-col gap-4">
      <h2 id="ea-settings-heading" className="text-base font-semibold text-ink">
        Chế độ truy cập sớm
      </h2>
      {error !== null && <ErrorNote>{userMessage(error)}</ErrorNote>}
      {isPending && <SkeletonList rows={2} label="Đang tải cài đặt…" />}
      {/* Keyed on the saved instant, so a save re-seeds the form from what the
          server stored rather than from what was typed. */}
      {data && <SettingsForm key={data.updatedAt} settings={data} />}
    </section>
  )
}

function SettingsForm({ settings }: { settings: EarlyAccessSettings }) {
  const queryClient = useQueryClient()
  const [launchAt, setLaunchAt] = useState(toLocalInput(settings.launchAt))
  const [showCapacity, setShowCapacity] = useState(settings.showCapacity)
  const [confirming, setConfirming] = useState(false)

  const save = useUpdateEarlyAccessSettings({
    mutation: {
      onSuccess: (saved) => {
        queryClient.setQueryData(getGetEarlyAccessSettingsQueryKey(), saved)
        setConfirming(false)
      },
    },
  })

  const write = (enabled: boolean) =>
    save.mutate({
      data: {
        enabled,
        showCapacity,
        launchAt: launchAt ? new Date(launchAt).toISOString() : undefined,
      },
    })

  const closeConfirm = useCallback(() => setConfirming(false), [])
  const dirty =
    launchAt !== toLocalInput(settings.launchAt) || showCapacity !== settings.showCapacity

  return (
    <>
      <div className="flex flex-col gap-3 rounded-2xl border border-line bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-1">
            <p className="flex items-center gap-2 font-semibold text-ink">
              Khoá trang
              {settings.enabled ? (
                <Badge tone="warn">Đang khoá</Badge>
              ) : (
                <Badge tone="ok">Đang mở cho mọi người</Badge>
              )}
            </p>
            <p className="text-sm text-muted">
              {settings.enabled
                ? 'Chỉ tài khoản đã nhập mã truy cập mới dùng được Xami. Người khác thấy trang khoá, nơi họ nhập mã hoặc tham gia danh sách chờ. Tài khoản nhân sự không bị khoá.'
                : 'Ai cũng đăng ký và dùng được Xami. Mã truy cập vẫn tặng dùng thử và ưu đãi, nhưng không còn cần để vào.'}
            </p>
          </div>
          <Button
            variant={settings.enabled ? 'secondary' : 'primary'}
            onClick={() => setConfirming(true)}
          >
            {settings.enabled ? 'Mở cho mọi người' : 'Bật khoá trang'}
          </Button>
        </div>
        <p className="text-xs text-muted">
          Cập nhật lần cuối {new Date(settings.updatedAt).toLocaleString('vi-VN')}
        </p>
      </div>

      <form
        className="flex flex-col gap-4 rounded-2xl border border-line bg-white p-5"
        onSubmit={(e) => {
          e.preventDefault()
          write(settings.enabled)
        }}
      >
        <TextField
          id="ea-launch-at"
          label="Ngày ra mắt chính thức"
          hint="Trang khoá đếm ngược đến lúc này. Chỉ để hiển thị: trang không tự mở khi hết giờ."
          type="datetime-local"
          value={launchAt}
          onChange={(e) => setLaunchAt(e.target.value)}
        />
        <label className="flex items-start gap-3 text-sm text-ink">
          <input
            type="checkbox"
            className="mt-1 size-4"
            checked={showCapacity}
            onChange={(e) => setShowCapacity(e.target.checked)}
          />
          <span>
            Hiện số lượt mời còn lại trên trang khoá
            <span className="block text-xs text-muted">
              Cộng dồn các mã chiến dịch đang mở, ví dụ “23 / 100 lượt mời còn lại”. Chỉ nên bật khi
              con số đó là thật.
            </span>
          </span>
        </label>
        {!confirming && save.error !== null && <ErrorNote>{userMessage(save.error)}</ErrorNote>}
        <div>
          <Button type="submit" disabled={!dirty || save.isPending}>
            {save.isPending && !confirming ? 'Đang lưu…' : 'Lưu'}
          </Button>
        </div>
      </form>

      <Dialog
        title={settings.enabled ? 'Mở Xami cho mọi người?' : 'Bật khoá trang?'}
        open={confirming}
        onClose={closeConfirm}
        footer={
          <>
            <Button variant="secondary" onClick={closeConfirm}>
              Huỷ
            </Button>
            <Button
              variant={settings.enabled ? 'primary' : 'danger'}
              disabled={save.isPending}
              onClick={() => write(!settings.enabled)}
            >
              {save.isPending ? 'Đang lưu…' : settings.enabled ? 'Mở cho mọi người' : 'Bật khoá trang'}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-2 text-sm text-ink">
          {settings.enabled ? (
            <p>
              Mọi người sẽ đăng ký và dùng được Xami ngay. Người đã vào bằng mã vẫn giữ tài khoản,
              tiến độ, thời gian dùng thử và ưu đãi chưa dùng.
            </p>
          ) : (
            <p>
              Người học chưa nhập mã sẽ thấy trang khoá thay cho sản phẩm, kể cả tài khoản đã đăng
              ký trước đó mà chưa được mời. Tài khoản đã có từ trước khi có chế độ này vẫn vào
              được.
            </p>
          )}
          {save.error !== null && <ErrorNote>{userMessage(save.error)}</ErrorNote>}
        </div>
      </Dialog>
    </>
  )
}
