import {
  ArrowLeft,
  FileText,
  Folder,
  Grid2X2,
  Menu,
  MoreVertical,
  Plus,
  Search,
  Settings,
  SlidersHorizontal,
  Star,
} from 'lucide-react';
import { useState } from 'react';
import type { ReactNode } from 'react';

import type { AppTab } from '../../app/tabs';
import { Chip } from '../../components/ui/Chip';
import { FloatingActionButton } from '../../components/ui/FloatingActionButton';
import { IconButton } from '../../components/ui/IconButton';

const FOLDERS = [
  { name: 'Công việc', count: 12, tone: 'yellow' },
  { name: 'Học tập', count: 8, tone: 'blue' },
  { name: 'Cá nhân', count: 15, tone: 'blush' },
  { name: 'Ý tưởng', count: 6, tone: 'sage' },
  { name: 'Dự án phụ', count: 5, tone: 'lilac' },
] as const;

const STICKY_NOTES = [
  {
    title: 'Kế hoạch tháng 6',
    lines: ['Gym 3 buổi/tuần', 'Đọc 2 quyển sách', 'Đi du lịch'],
    category: 'Công việc',
    tone: 'yellow',
    time: 'Hôm nay',
  },
  {
    title: 'Ý tưởng nội dung',
    lines: ['Video productivity', 'Tips ghi chú', 'Review sách'],
    category: 'Cá nhân',
    tone: 'blush',
    time: 'Hôm qua',
  },
  {
    title: 'Meeting với client',
    lines: ['25/05/2024', '2:00 PM', 'Phòng họp A'],
    category: 'Công việc',
    tone: 'blue',
    time: '2 ngày trước',
  },
  {
    title: 'Mua sắm',
    lines: ['Sữa hạnh nhân', 'Bơ', 'Bánh mì đen', 'Chuối'],
    category: 'Cá nhân',
    tone: 'sage',
    time: '2 ngày trước',
  },
] as const;

const NOTE_ROWS = [
  { title: 'Kế hoạch tháng 6', category: 'Công việc', time: 'Hôm nay', tone: 'yellow' },
  { title: 'Meeting với client', category: 'Công việc', time: 'Hôm qua', tone: 'blue' },
  { title: 'Ý tưởng nội dung', category: 'Cá nhân', time: 'Hôm qua', tone: 'blush' },
  { title: 'Meditation mỗi sáng', category: 'Cá nhân', time: '2 ngày trước', tone: 'lilac' },
] as const;

interface PreviewScreensProps {
  activeTab: Exclude<AppTab, 'tasks'>;
}

export function PreviewScreens({ activeTab }: PreviewScreensProps) {
  if (activeTab === 'folders') {
    return <FoldersPreview />;
  }

  if (activeTab === 'sticky') {
    return <StickyPreview />;
  }

  return <NotesPreview />;
}

function PreviewHeader({
  actions,
  leading,
  title,
}: {
  actions: ReactNode;
  leading: ReactNode;
  title: string;
}) {
  return (
    <header className="preview-header">
      <div className="preview-header__title">
        {leading}
        <h1>{title}</h1>
      </div>
      <div className="preview-header__actions">{actions}</div>
    </header>
  );
}

function FoldersPreview() {
  return (
    <section className="preview-screen" aria-labelledby="folders-heading">
      <PreviewHeader
        leading={
          <IconButton aria-label="Quay lại">
            <ArrowLeft aria-hidden="true" size={20} />
          </IconButton>
        }
        title="Quản lý thư mục"
        actions={
          <IconButton aria-label="Thêm thư mục" variant="outlined">
            <Plus aria-hidden="true" size={20} />
          </IconButton>
        }
      />
      <p className="preview-screen__subtitle">Sắp xếp ghi chú của bạn</p>
      <div className="folder-preview-list">
        {FOLDERS.map((folder) => (
          <article className={`folder-preview-card folder-preview-card--${folder.tone}`} key={folder.name}>
            <span className="folder-preview-card__icon">
              <Folder aria-hidden="true" fill="currentColor" size={27} strokeWidth={1.5} />
            </span>
            <div>
              <h2>{folder.name}</h2>
              <p>{folder.count} ghi chú</p>
            </div>
            <IconButton aria-label={`Tùy chọn thư mục ${folder.name}`}>
              <MoreVertical aria-hidden="true" size={18} />
            </IconButton>
          </article>
        ))}
      </div>
      <p className="folder-preview-tip">💡 Mẹo: Kéo thả để sắp xếp thứ tự thư mục</p>
    </section>
  );
}

function StickyPreview() {
  const [filter, setFilter] = useState('Tất cả');
  const visibleNotes =
    filter === 'Tất cả'
      ? STICKY_NOTES
      : STICKY_NOTES.filter((note) => note.category === filter);

  return (
    <section className="preview-screen preview-screen--sticky" aria-labelledby="sticky-heading">
      <PreviewHeader
        leading={
          <IconButton aria-label="Mở menu">
            <Menu aria-hidden="true" size={20} />
          </IconButton>
        }
        title="Ghi chú Sticker"
        actions={
          <>
            <IconButton aria-label="Tìm kiếm">
              <Search aria-hidden="true" size={19} />
            </IconButton>
            <IconButton aria-label="Đổi kiểu hiển thị">
              <Grid2X2 aria-hidden="true" size={18} />
            </IconButton>
            <IconButton aria-label="Cài đặt Sticker">
              <Settings aria-hidden="true" size={18} />
            </IconButton>
          </>
        }
      />
      <div className="sticky-filter" aria-label="Lọc Sticker">
        {['Tất cả', 'Công việc', 'Cá nhân', 'Học tập'].map((label) => (
          <Chip key={label} onClick={() => setFilter(label)} selected={filter === label}>
            {label}
          </Chip>
        ))}
      </div>
      <div className="sticky-grid">
        {visibleNotes.map((note) => (
          <article className={`sticky-card sticky-card--${note.tone}`} key={note.title}>
            <span className="sticky-card__tape" aria-hidden="true" />
            <Star className="sticky-card__star" aria-hidden="true" size={15} />
            <h2>{note.title}</h2>
            <ul>
              {note.lines.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
            <time>{note.time}</time>
          </article>
        ))}
      </div>
      <FloatingActionButton aria-label="Thêm Sticker" />
    </section>
  );
}

function NotesPreview() {
  return (
    <section className="preview-screen" aria-labelledby="notes-heading">
      <PreviewHeader
        leading={
          <span className="notes-heading-icon">
            <FileText aria-hidden="true" size={19} />
          </span>
        }
        title="Ghi chú"
        actions={
          <>
            <IconButton aria-label="Tìm kiếm ghi chú">
              <Search aria-hidden="true" size={19} />
            </IconButton>
            <IconButton aria-label="Lọc ghi chú">
              <SlidersHorizontal aria-hidden="true" size={18} />
            </IconButton>
          </>
        }
      />
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
