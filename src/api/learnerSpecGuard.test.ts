import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * TCCN-303-2, checked in the only place this repo can check it.
 *
 * The criterion is about *kolearn-web*: "bất kỳ màn nào của người học — không
 * hiện độ khó ở đâu cả: không nhãn, không lọc, không sắp xếp." Difficulty's
 * user is the ver1.1 placement test. Shown early it invites a learner to
 * filter for the easy questions, which ruins both the measurement and the
 * studying — and no test in this repo can look at a screen in another one.
 *
 * What is checkable from here is the layer underneath: if no learner-facing
 * schema in kolearn-server's spec carries a difficulty field, then no learner
 * client can render one, whatever any screen does. That is a weaker claim than
 * inspecting the screens, and it is stated as weaker rather than counted as
 * equivalent.
 *
 * It skips when the sibling checkout is absent — the same posture
 * `scripts/api-check.sh` takes, for the same reason: CI checks out one repo at
 * a time. **A skipped test proves nothing.** It is recorded here so that the
 * matrix row for TCCN-303-2 can be read honestly, and the full check belongs
 * in kolearn-web beside the screens themselves.
 */
const SERVER_SPEC = path.resolve(process.cwd(), '../kolearn-server/api/openapi.yaml')

async function readServerSpec(): Promise<string | null> {
  try {
    return await readFile(SERVER_SPEC, 'utf8')
  } catch {
    return null
  }
}

describe('YC-303: độ khó không lộ ra phía người học', () => {
  // TCCN-303-2 (drafted): the learner contract carries no difficulty field.
  it('TCCN-303-2: không lược đồ nào của người học mang trường độ khó', async () => {
    const spec = await readServerSpec()
    if (spec == null) {
      // Reported rather than silently green.
      console.warn(`note: ${SERVER_SPEC} not found — TCCN-303-2 not checked.`)
      return
    }

    const offending = spec
      .split('\n')
      .map((line, i) => [i + 1, line] as const)
      .filter(([, line]) => /^\s+difficulty\w*\s*:/i.test(line))

    expect(
      offending,
      `kolearn-server's learner spec exposes a difficulty field:\n` +
        offending.map(([n, l]) => `  ${n}: ${l.trim()}`).join('\n'),
    ).toEqual([])
  })

  // The detector has to be shown to still fire. A guard that matches nothing
  // reports nothing, and the build stays green while the guard is gone.
  it('phát hiện được một trường độ khó nếu nó xuất hiện', () => {
    const sample = ['    ExamListItem:', '      properties:', '        difficultyManual: { type: integer }']
    const offending = sample.filter((line) => /^\s+difficulty\w*\s*:/i.test(line))
    expect(offending).toHaveLength(1)
  })
})
