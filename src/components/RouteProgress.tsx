import { useIsFetching } from '@tanstack/react-query'

/**
 * The app-wide answer to "is something happening?".
 *
 * A 2px bar pinned to the top edge, shown whenever any query is in flight. It
 * is `position: fixed` and outside the flow on purpose: it can appear and
 * disappear as often as the network does without moving a single line of the
 * text underneath it, which is what lets every screen below keep its content
 * on display while it refetches.
 *
 * Deliberately not shown for mutations — those already have a button that
 * says what it is doing ("Đang nộp…"), and a second indicator for the same
 * action reads as a second action.
 */
export function RouteProgress() {
  const fetching = useIsFetching()
  if (fetching === 0) return null
  return <div className="route-progress" role="presentation" />
}
