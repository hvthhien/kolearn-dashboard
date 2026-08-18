import type { Topic } from '../../api/gen/model'

/**
 * The catalogue. Names are the seed exam's, so the autocomplete matches what
 * the questions are actually tagged with.
 */
export const TOPICS: Topic[] = [
  { id: 't-1', category: 'READING_SKILL', name: 'đối chiếu chi tiết với bài đọc', isSystem: true },
  { id: 't-2', category: 'GRAMMAR', name: '-지만', isSystem: true },
  { id: 't-3', category: 'GRAMMAR', name: '-(으)려고 하다', isSystem: true },
  { id: 't-4', category: 'GRAMMAR', name: '-기 때문에', isSystem: true },
  { id: 't-5', category: 'VOCAB', name: 'từ chỉ thời gian', isSystem: true },
  { id: 't-6', category: 'VOCAB', name: 'từ chỉ phương tiện đi lại', isSystem: true },
  { id: 't-7', category: 'LISTENING_SKILL', name: 'nghe lấy ý chính', isSystem: true },
  { id: 't-8', category: 'READING_SKILL', name: 'suy luận từ ngữ cảnh', isSystem: false },
]
