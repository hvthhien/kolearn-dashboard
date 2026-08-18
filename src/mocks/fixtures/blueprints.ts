import type { Blueprint } from '../../api/gen/model'

/**
 * R-16, copied from migration `00004_exam_config.sql` rather than from the
 * requirements table. The migration is what the server will serve, and a
 * fixture that agrees with the document but not with the database tests the
 * document.
 *
 * GĐ-1 warns the TOPIK format changes between years and must be checked
 * against the official publication, which is why these are versioned and why
 * nothing here is a constant in a screen (TCCN-302-1).
 */
export const BLUEPRINTS: Blueprint[] = [
  {
    version: '2024',
    level: 'TOPIK_I',
    totalScore: 200,
    sections: [
      { kind: 'LISTENING', sitting: 1, ordinal: 1, questionCount: 30, timeLimitSeconds: 2400, maxScore: 100 },
      { kind: 'READING', sitting: 1, ordinal: 2, questionCount: 40, timeLimitSeconds: 3600, maxScore: 100 },
    ],
  },
  {
    version: '2024',
    level: 'TOPIK_II',
    totalScore: 300,
    sections: [
      { kind: 'LISTENING', sitting: 1, ordinal: 1, questionCount: 50, timeLimitSeconds: 3600, maxScore: 100 },
      { kind: 'WRITING', sitting: 1, ordinal: 2, questionCount: 4, timeLimitSeconds: 3000, maxScore: 100 },
      { kind: 'READING', sitting: 2, ordinal: 3, questionCount: 50, timeLimitSeconds: 4200, maxScore: 100 },
    ],
  },
]
