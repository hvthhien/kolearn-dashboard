/**
 * Says, on every screen, that the data is invented.
 *
 * The build refuses a mock-backed bundle unless someone asks for one on
 * purpose (see `vite.config.ts`), and this is the other half of that: a
 * deliberate mock preview still gets opened by people who were not the person
 * who built it. Without a mark on the page, an authoring console backed by
 * fixtures looks exactly like one backed by the bank — the exams are plausible,
 * the publish gate answers, every save reports success. The reviewer's
 * screenshot of "the paper looks wrong" would be about a paper that does not
 * exist.
 *
 * `sticky` rather than `fixed`, so it takes its own height instead of sitting
 * over the app bar underneath it.
 *
 * Ink on `warn-soft` rather than white on `warn`: white on that step is about
 * 3.9:1 and fails the threshold for body text. The prominence comes from a
 * full-width strip at the top of every screen and the border under it, which
 * is a layout decision rather than a contrast one.
 */
export function MockBanner() {
  if (import.meta.env.VITE_MOCK_API !== '1') return null
  return (
    <p
      role="status"
      className="sticky top-0 z-40 border-b border-warn bg-warn-soft px-4 py-1.5 text-center text-sm font-semibold text-ink"
    >
      Dữ liệu giả lập — không phải ngân hàng đề thật. Mọi thay đổi ở đây không được lưu.
    </p>
  )
}
