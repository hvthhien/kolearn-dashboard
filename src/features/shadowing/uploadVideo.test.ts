import { beforeEach, describe, expect, it } from 'vitest'
import { http, HttpResponse } from 'msw'
import { server } from '../../mocks/server'
import { setAccessToken } from '../../lib/http'
import {
  MAX_BYTES,
  probeThumbnailFile,
  probeVideoFile,
  uploadShadowingVideo,
  VideoRejected,
} from './uploadVideo'

/**
 * The three-call sequence, and the two properties that make it safe.
 *
 * `probeVideoFile` is not exercised here: it needs a real media element, which
 * jsdom does not have. Keeping it out of `uploadShadowingVideo` is what makes
 * this testable at all.
 */

const seen: { method: string; url: string; auth: string | null; contentType: string | null }[] = []

const routes = [
  http.post('/api/v1/admin/shadowing/videos/:id/upload-target', ({ request, params }) => {
    seen.push({
      method: 'POST',
      url: 'upload-target',
      auth: request.headers.get('Authorization'),
      contentType: request.headers.get('Content-Type'),
    })
    return HttpResponse.json({
      url: `https://media.mock.local/shadowing/${String(params.id)}/x.mp4`,
      method: 'PUT',
      headers: { 'Content-Type': 'video/mp4' },
      objectKey: `shadowing/${String(params.id)}/x.mp4`,
      expiresAt: '2026-08-21T00:15:00Z',
    })
  }),
  http.put('https://media.mock.local/*', ({ request }) => {
    seen.push({
      method: 'PUT',
      url: 'storage',
      auth: request.headers.get('Authorization'),
      contentType: request.headers.get('Content-Type'),
    })
    return new HttpResponse(null, { status: 200 })
  }),
  http.post('/api/v1/admin/shadowing/videos/:id/uploaded', ({ request }) => {
    seen.push({
      method: 'POST',
      url: 'uploaded',
      auth: request.headers.get('Authorization'),
      contentType: request.headers.get('Content-Type'),
    })
    return HttpResponse.json({ id: 'sv-1', title: 'x' })
  }),
]

// Narrowed onto the suite's own server rather than a second one: two servers
// both intercept, and every request is then recorded twice.
beforeEach(() => {
  seen.length = 0
  setAccessToken('test-access-token')
  server.use(...routes)
})

function file(): File {
  return new File([new Uint8Array(1024)], 'a.mp3', { type: 'audio/mpeg' })
}

const PROBE = { bytes: 1024, mimeType: 'audio/mpeg', durationMs: 21_000 }

describe('the upload sequence', () => {
  it('asks, puts, then confirms — in that order', async () => {
    const handle = uploadShadowingVideo({
      videoId: 'sv-1',
      file: file(),
      probe: PROBE,
      onPhase: () => {},
      onProgress: () => {},
      onObjectKey: () => {},
    })
    await handle.promise

    expect(seen.map((r) => r.url)).toEqual(['upload-target', 'storage', 'uploaded'])
  })

  it('sends no bearer token to the storage origin', async () => {
    const handle = uploadShadowingVideo({
      videoId: 'sv-1',
      file: file(),
      probe: PROBE,
      onPhase: () => {},
      onProgress: () => {},
      onObjectKey: () => {},
    })
    await handle.promise

    const api = seen.filter((r) => r.url !== 'storage')
    const storage = seen.find((r) => r.url === 'storage')

    // The API calls are ours and carry the session. The PUT goes to a
    // third-party origin, and the only credential it may see is the presigned
    // URL — sending our access token there would hand it to Cloudflare.
    expect(api.every((r) => r.auth !== null)).toBe(true)
    expect(storage?.auth).toBeNull()
    // And the signed Content-Type is sent verbatim, because a signed header
    // this client altered would be a signature mismatch.
    expect(storage?.contentType).toBe('video/mp4')
  })

  it('resuming after a failed confirm re-sends no bytes', async () => {
    const handle = uploadShadowingVideo({
      videoId: 'sv-1',
      file: file(),
      probe: PROBE,
      // The bytes are already in the bucket. Re-uploading thirty megabytes
      // because a two-hundred-byte JSON call timed out is the failure worth
      // writing code to avoid.
      resumeObjectKey: 'shadowing/sv-1/x.mp4',
      onPhase: () => {},
      onProgress: () => {},
      onObjectKey: () => {},
    })
    await handle.promise

    expect(seen.map((r) => r.url)).toEqual(['uploaded'])
  })
})

describe('TCCN-354-8: tệp sai định dạng hoặc quá lớn bị chặn sớm', () => {
  it('refuses a file that is not mp4, before anything leaves the machine', async () => {
    const wrong = new File([new Uint8Array(16)], 'a.mov', { type: 'video/quicktime' })

    await expect(probeVideoFile(wrong)).rejects.toBeInstanceOf(VideoRejected)
    // Refused before the network, so nothing was uploaded and nothing has to be
    // swept afterwards.
    expect(seen).toHaveLength(0)

    // The message names the kind THIS item is, not a rule in general: an author
    // who picked the wrong kind at creation has a different problem from one who
    // picked the wrong file, and only the first is worth deleting a draft over.
    await expect(probeVideoFile(wrong)).rejects.toThrow(/chỉ nhận tệp \.mp3/)
  })

  it('refuses an mp4 outright, because video was retired', async () => {
    const mp4 = new File([new Uint8Array(16)], 'a.mp4', { type: 'video/mp4' })

    await expect(probeVideoFile(mp4)).rejects.toThrow(/chỉ nhận tệp \.mp3/)
    expect(seen).toHaveLength(0)
  })

  it('refuses a poster that is not an image, and one nobody could read', async () => {
    const notImage = new File([new Uint8Array(16)], 'a.mp4', { type: 'video/mp4' })
    await expect(probeThumbnailFile(notImage)).rejects.toThrow(/chỉ nhận \.png/)

    // 8 MB, against a poster every row of the learner's list loads one of.
    const huge = new File([new Uint8Array(8)], 'a.png', { type: 'image/png' })
    Object.defineProperty(huge, 'size', { value: 9 * 1024 * 1024 })
    await expect(probeThumbnailFile(huge)).rejects.toThrow(/vượt giới hạn/)

    expect(seen).toHaveLength(0)
  })

  it('names the real size when the file is too big', async () => {
    // A sparse File: `size` is what the check reads, and allocating 200 MB to
    // prove it would be a slow way to test arithmetic.
    const huge = new File([new Uint8Array(8)], 'a.mp3', { type: 'audio/mpeg' })
    Object.defineProperty(huge, 'size', { value: MAX_BYTES + 1 })

    await expect(probeVideoFile(huge)).rejects.toThrow(/vượt giới hạn/)
    expect(seen).toHaveLength(0)
  })

  it('says which format it got, rather than only which it wanted', async () => {
    const unknown = new File([new Uint8Array(8)], 'a', { type: '' })
    // "Tệp bạn chọn là không rõ định dạng" tells an author what happened; "sai
    // định dạng" alone leaves them guessing at their own file.
    await expect(probeVideoFile(unknown)).rejects.toThrow(/không rõ định dạng/)
  })
})
