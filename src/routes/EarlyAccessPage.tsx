import { useState } from 'react'

import { CodesSection } from '../features/earlyAccess/CodesSection'
import { SettingsSection } from '../features/earlyAccess/SettingsSection'
import { WaitlistSection } from '../features/earlyAccess/WaitlistSection'
import { FilterChips, PageShell, PageTitle } from '../components/ui'

type Tab = 'settings' | 'codes' | 'waitlist'

/**
 * Truy cập sớm — the private launch, run from one screen.
 *
 * Three tabs, in the order they are used on launch day: whether the site is
 * locked at all, the codes that open it, and the waitlist that is released in
 * batches. `early_access:manage` opens this, and the server mounts every route
 * behind the same permission.
 */
export function EarlyAccessPage() {
  const [tab, setTab] = useState<Tab>('settings')

  return (
    <PageShell>
      <PageTitle>Truy cập sớm</PageTitle>
      <p className="mt-1 text-sm text-muted">
        Trong giai đoạn truy cập sớm, chỉ người có mã hoặc được mời từ danh sách chờ mới dùng được
        Xami. Mọi thay đổi ở đây đều được ghi vào nhật ký.
      </p>

      <FilterChips<Tab>
        label="Khu vực"
        className="mt-4"
        value={tab}
        onChange={setTab}
        choices={[
          { value: 'settings', label: 'Cài đặt' },
          { value: 'codes', label: 'Mã truy cập' },
          { value: 'waitlist', label: 'Danh sách chờ' },
        ]}
      />

      {tab === 'settings' && <SettingsSection />}
      {tab === 'codes' && <CodesSection />}
      {tab === 'waitlist' && <WaitlistSection />}
    </PageShell>
  )
}
