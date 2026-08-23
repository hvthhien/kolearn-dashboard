/**
 * Which way a piece of content leaves the bank.
 *
 * Two operations, never one, and the choice is not the author's to make. A
 * video or a set nobody could ever reach is scaffolding — a draft opened and
 * abandoned, an import that went wrong — and deleting it costs nothing. One
 * learners could reach has their progress hanging off it and cards naming its
 * lines as their source, and the row is the only thing left that can say where
 * any of that came from.
 *
 * So the screen does not offer a choice between them. It reads `publishedAt`,
 * offers the one operation that applies, and says plainly what it will do. A
 * single "Xoá" button that quietly retired some rows and destroyed others would
 * be the worst of both.
 */
export type Removal = 'DELETE' | 'RETIRE'

/**
 * `publishedAt` decides it, and nothing else does.
 *
 * Not `status`, and that is the trap this function exists to close: a RETIRED
 * row is not PUBLISHED right now, so a check against the current status reads
 * "safe to delete" about precisely the row that carries a learner's history.
 * The server refuses it either way — every delete is gated on `published_at IS
 * NULL` there too — but a screen that offers a button the server will refuse is
 * a screen that taught someone the wrong model of their own bank.
 */
export function removalFor(publishedAt: string | undefined): Removal {
  return publishedAt ? 'RETIRE' : 'DELETE'
}

/** The word on the button. Short, because it sits in a table row. */
export function removalLabel(removal: Removal): string {
  return removal === 'DELETE' ? 'Xoá' : 'Gỡ'
}
