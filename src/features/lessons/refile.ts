import {
  getAdminShadowVideo,
  saveAdminDictationSet,
  saveAdminShadowVideo,
} from '../../api/gen/kolearn'
import type {
  AdminDictationSetRow,
  SaveDictationSetRequest,
  SaveShadowVideoRequest,
} from '../../api/gen/model'

/**
 * Moving one lesson to another shelf, for both features.
 *
 * Both endpoints are PUT and both take the WHOLE metadata record — a field
 * left out of the body is not "leave it alone", it is "this lesson has none".
 * That is stated on `SaveShadowVideoRequest.categoryId` and it applies to
 * every other field on both requests: send `{ categoryId }` alone and the
 * lesson comes back with no title, which the server refuses, and no voice,
 * which it does not.
 *
 * So neither of these sends a patch. They send everything, and the only
 * interesting difference between them is where "everything" can be read from.
 *
 * A PATCH would make this a two-line function and is the right long-term
 * answer for a screen that edits one field, but it is a change to the spec,
 * the Go handler and both other clients; this is the same edit the studio
 * already makes, from a different button.
 */

/**
 * Chép chính tả: the row is enough.
 *
 * `AdminDictationSetRow` carries every field of `SaveDictationSetRequest`, so
 * a re-file costs one request. `Required<…>` is what holds that shut: if the
 * request ever grows a seventh field, this stops compiling instead of quietly
 * clearing it on the next save from this screen.
 */
export async function refileDictationSet(
  set: AdminDictationSetRow,
  categoryId: string,
): Promise<void> {
  const whole: Required<SaveDictationSetRequest> = {
    title: set.title,
    level: set.level,
    voice: set.voice,
    voiceKind: set.voiceKind,
    categoryId,
    tags: set.tags,
  }
  await saveAdminDictationSet(set.id, whole)
}

/**
 * Nhại theo: the row is NOT enough, and this is the whole reason this file
 * exists rather than an inline call in the page.
 *
 * `AdminShadowVideoRow` has no `voice`, no `voiceKind` and no topics — the
 * list has never needed them. Building the request from the row would send
 * those three absent, and absent means cleared: a voice label wiped, a HUMAN
 * recording relabelled as máy đọc, and every chủ điểm ngữ pháp detached from
 * the video. That last one is the expensive one, because SC-WEAKNESS counts
 * wrong answers against exactly that taxonomy and nothing on this screen would
 * say it had gone.
 *
 * So: read the detail, change the one field, send it back. The GET is not an
 * optimisation to remove later.
 */
export async function refileShadowVideo(videoId: string, categoryId: string): Promise<void> {
  const video = await getAdminShadowVideo(videoId)
  const whole: Required<SaveShadowVideoRequest> = {
    title: video.title,
    level: video.level,
    voice: video.voice,
    voiceKind: video.voiceKind,
    // Chủ điểm ngữ pháp, not chủ đề. Two taxonomies that sit beside each other
    // on this request and nowhere else (migration 00035).
    topicIds: video.topics.map((t) => t.id),
    categoryId,
    tags: video.tags,
  }
  await saveAdminShadowVideo(videoId, whole)
}
