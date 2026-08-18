import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * TCCN-303-2, checked as well as this repo can check it.
 *
 * The criterion is about *kolearn-web*: "bất kỳ màn nào của người học — không
 * hiện độ khó ở đâu cả: không nhãn, không lọc, không sắp xếp." Difficulty's
 * user is the ver1.1 placement test. Shown early it invites a learner to filter
 * for the easy questions, which ruins both the measurement and the studying —
 * and no test here can look at a screen in another repository.
 *
 * What is checkable from here is one layer down. Since the server now serves
 * both apps from one spec, a learner-facing schema carrying a difficulty field
 * would put the value within reach of the learner client whatever its screens
 * do. So this reads the generated models — one file per schema, named after it
 * — and requires every schema that mentions difficulty to be one of the
 * authoring types.
 *
 * **Its limit, stated rather than papered over:** "authoring type" is
 * recognised by the `Admin` prefix and the two request bodies below, which is a
 * naming convention rather than a proof of reachability. A learner response
 * that embedded an `Admin…` type would slip through. The convention holds today
 * and the check is cheap; the real guarantee is a test beside kolearn-web's
 * screens, which is where the criterion actually lives.
 */
const MODEL_DIR = path.resolve(process.cwd(), 'src/api/gen/model')

/** Schemas that exist to author with. Difficulty belongs in exactly these. */
const AUTHORING = /^(Admin[A-Z]|SaveQuestionRequest|ListAdmin)/

const DIFFICULTY = /\bdifficulty\w*\s*[?:]/i

async function modelFiles(): Promise<string[]> {
  const entries = await readdir(MODEL_DIR)
  return entries.filter((f) => f.endsWith('.ts') && f !== 'index.ts')
}

/** `adminQuestionRow.ts` → `AdminQuestionRow`. */
function schemaName(file: string): string {
  const base = path.basename(file, '.ts')
  return base.charAt(0).toUpperCase() + base.slice(1)
}

describe('YC-303: độ khó không lộ ra phía người học', () => {
  // TCCN-303-2 (drafted): no learner-facing schema carries a difficulty field.
  it('TCCN-303-2: chỉ lược đồ soạn đề mới mang trường độ khó', async () => {
    const offenders: string[] = []

    for (const file of await modelFiles()) {
      const source = await readFile(path.join(MODEL_DIR, file), 'utf8')
      // Skip the licence header orval repeats in every file; only the type
      // body is a claim about the wire.
      const body = source.slice(source.indexOf('*/') + 2)
      if (!DIFFICULTY.test(body)) continue

      const name = schemaName(file)
      if (!AUTHORING.test(name)) offenders.push(name)
    }

    expect(
      offenders,
      `these are not authoring schemas and expose difficulty to a learner client:\n` +
        offenders.map((n) => `  ${n}`).join('\n'),
    ).toEqual([])
  })

  // The detector has to be shown to still fire. A guard that matches nothing
  // reports nothing, and the build stays green while the guard is gone.
  it('phát hiện được một trường độ khó trên lược đồ của người học', () => {
    expect(DIFFICULTY.test('  difficultyManual?: number;')).toBe(true)
    expect(DIFFICULTY.test('  difficulty: number;')).toBe(true)
    expect(AUTHORING.test('ExamListItem')).toBe(false)
    expect(AUTHORING.test('AdminQuestion')).toBe(true)
  })

  // And that it is looking at something: if difficulty vanished from the spec
  // entirely the first test would pass while proving nothing.
  it('lược đồ soạn đề thực sự có trường độ khó để mà kiểm', async () => {
    const source = await readFile(path.join(MODEL_DIR, 'adminQuestion.ts'), 'utf8')
    expect(DIFFICULTY.test(source)).toBe(true)
  })
})
