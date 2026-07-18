import { FileText, Search, SlidersHorizontal } from 'lucide-react';

import { FloatingActionButton } from '../../components/ui/FloatingActionButton';
import { IconButton } from '../../components/ui/IconButton';

const NOTE_ROWS = [
  { title: 'Kế hoạch tháng 6', category: 'Công việc', time: 'Hôm nay', tone: 'yellow' },
  { title: 'Meeting với client', category: 'Công việc', time: 'Hôm qua', tone: 'blue' },
  { title: 'Ý tưởng nội dung', category: 'Cá nhân', time: 'Hôm qua', tone: 'blush' },
  { title: 'Meditation mỗi sáng', category: 'Cá nhân', time: '2 ngày trước', tone: 'lilac' },
] as const;

export function NotesPreview() {
  return (
    <section className="preview-screen" aria-labelledby="notes-heading">
      <header className="preview-header">
        <div className="preview-header__title">
          <span className="notes-heading-icon">
            <FileText aria-hidden="true" size={19} />
          </span>
          <h1 id="notes-heading">Ghi chú</h1>
        </div>
        <div className="preview-header__actions">
          <IconButton aria-label="Tìm kiếm ghi chú">
            <Search aria-hidden="true" size={19} />
          </IconButton>
          <IconButton aria-label="Lọc ghi chú">
            <SlidersHorizontal aria-hidden="true" size={18} />
          </IconButton>
        </div>
      </header>
      <div className="notes-search-preview">
        <Search aria-hidden="true" size={17} />
        <span>Tìm kiếm ghi chú...</span>
      </div>
      <p className="notes-preview-label">Gần đây</p>
      <div className="note-preview-list">
        {NOTE_ROWS.map((note) => (
          <article className="note-preview-row" key={note.title}>
            <span className={`note-preview-row__dot note-preview-row__dot--${note.tone}`} />
            <div>
              <h2>{note.title}</h2>
              <span>{note.category}</span>
            </div>
            <time>{note.time}</time>
          </article>
        ))}
      </div>
      <FloatingActionButton aria-label="Thêm ghi chú" />
    </section>
  );
}
