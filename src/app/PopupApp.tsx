import { Bookmark, Camera, Mic, Settings, StickyNote, X } from 'lucide-react';
import { useState } from 'react';
import type { FormEvent } from 'react';

import { openSidePanel } from '../browser/openSidePanel';
import { Brand } from '../components/ui/Brand';
import { Button } from '../components/ui/Button';
import { IconButton } from '../components/ui/IconButton';

const QUICK_ACTIONS = [
  { id: 'quick-note', label: 'Ghi chú nhanh', icon: StickyNote, tone: 'yellow' },
  { id: 'capture', label: 'Chụp trang', icon: Camera, tone: 'sage' },
  { id: 'bookmark', label: 'Đánh dấu', icon: Bookmark, tone: 'peach' },
  { id: 'record', label: 'Thu âm', icon: Mic, tone: 'blush' },
] as const;

interface RecentNote {
  id: string;
  time: string;
  title: string;
  tone: 'blush' | 'blue' | 'yellow';
}

const INITIAL_RECENT_NOTES: RecentNote[] = [
  { id: 'month-plan', title: 'Kế hoạch tháng 6', time: 'Hôm nay', tone: 'yellow' },
  { id: 'content-ideas', title: 'Ý tưởng nội dung 6', time: 'Hôm qua', tone: 'blush' },
];

interface PopupAppProps {
  onOpenAll?: () => Promise<boolean>;
}

export function PopupApp({ onOpenAll = openSidePanel }: PopupAppProps) {
  const [recentNotes, setRecentNotes] = useState<RecentNote[]>(() => INITIAL_RECENT_NOTES);
  const [activeAction, setActiveAction] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [showRecent, setShowRecent] = useState(true);
  const [status, setStatus] = useState<string | null>(null);

  const selectAction = (actionId: string, label: string) => {
    setActiveAction(actionId);
    setStatus(actionId === 'quick-note' ? null : `Đã chọn ${label}`);
  };

  const saveQuickNote = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const title = draftTitle.trim();

    if (!title) {
      return;
    }

    const note: RecentNote = {
      id: `quick-${Date.now()}`,
      title,
      time: 'Vừa xong',
      tone: 'blue',
    };

    setRecentNotes((currentNotes) => [note, ...currentNotes]);
    setDraftTitle('');
    setActiveAction(null);
    setStatus('Đã lưu ghi chú nhanh');
  };

  const openAllNotes = async () => {
    try {
      const didOpen = await onOpenAll();
      setStatus(didOpen ? 'Đã mở MochiNote' : 'Mở MochiNote từ thanh bên');
    } catch {
      setStatus('Chưa thể mở MochiNote');
    }
  };

  return (
    <main className="popup-app">
      <header className="popup-header">
        <Brand compact />
        <div className="popup-header__actions">
          <IconButton
            aria-label="Cài đặt popup"
            aria-pressed={showSettings}
            onClick={() => setShowSettings((isVisible) => !isVisible)}
          >
            <Settings aria-hidden="true" size={17} strokeWidth={1.8} />
          </IconButton>
          <IconButton aria-label="Đóng popup" onClick={() => window.close()}>
            <X aria-hidden="true" size={18} strokeWidth={1.8} />
          </IconButton>
        </div>
      </header>

      {showSettings ? (
        <section className="popup-settings" aria-label="Tùy chọn popup">
          <label>
            <input
              checked={showRecent}
              onChange={(event) => setShowRecent(event.target.checked)}
              type="checkbox"
            />
            <span>Hiện ghi chú gần đây</span>
          </label>
        </section>
      ) : null}

      <section className="quick-actions" aria-label="Tạo nhanh">
        {QUICK_ACTIONS.map(({ icon: Icon, id, label, tone }) => (
          <button
            aria-pressed={activeAction === id}
            className={`quick-action quick-action--${tone}`}
            key={id}
            onClick={() => selectAction(id, label)}
            type="button"
          >
            <span className="quick-action__icon">
              <Icon aria-hidden="true" size={20} strokeWidth={1.8} />
            </span>
            <span>{label}</span>
          </button>
        ))}
      </section>

      {activeAction === 'quick-note' ? (
        <form className="popup-quick-note" onSubmit={saveQuickNote}>
          <label htmlFor="popup-note-title">Ghi chú nhanh</label>
          <div>
            <input
              id="popup-note-title"
              onChange={(event) => setDraftTitle(event.target.value)}
              placeholder="Nhập nội dung..."
              value={draftTitle}
            />
            <Button size="small" type="submit">
              Lưu
            </Button>
          </div>
        </form>
      ) : null}

      {status ? (
        <p className="popup-status" role="status">
          {status}
        </p>
      ) : null}

      {showRecent ? (
        <section className="recent-notes" aria-labelledby="recent-notes-heading">
          <h1 id="recent-notes-heading">Ghi chú gần đây</h1>
          <div className="recent-notes__list">
            {recentNotes.slice(0, 3).map((note) => (
              <article className="recent-note-row" key={note.id}>
                <span className={`recent-note-row__dot recent-note-row__dot--${note.tone}`} />
                <h2>{note.title}</h2>
                <time>{note.time}</time>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      <button className="popup-open-all" onClick={() => void openAllNotes()} type="button">
        Xem tất cả
      </button>
    </main>
  );
}
