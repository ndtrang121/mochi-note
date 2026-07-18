import {
  Bookmark,
  Camera,
  Globe2,
  Mic,
  Settings,
  StickyNote,
  X,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';

import { openSidePanel } from '../browser/openSidePanel';
import {
  getActivePageMetadata,
  requestPageCapture,
  type ActivePageMetadata,
  type CapturePageResult,
  type PageCaptureMode,
} from '../browser/pageCapture';
import { Brand } from '../components/ui/Brand';
import { Button } from '../components/ui/Button';
import { IconButton } from '../components/ui/IconButton';
import type { Note } from '../db/models';
import { MochiDataProvider, useMochiData } from './MochiDataProvider';

const QUICK_ACTIONS = [
  { id: 'quick-note', label: 'Ghi chú nhanh', icon: StickyNote, tone: 'yellow' },
  { id: 'capture', label: 'Chụp trang', icon: Camera, tone: 'sage' },
  { id: 'bookmark', label: 'Đánh dấu', icon: Bookmark, tone: 'peach' },
  { id: 'record', label: 'Thu âm', icon: Mic, tone: 'blush' },
] as const;

interface PopupAppProps {
  capturePage?: (mode: PageCaptureMode) => Promise<CapturePageResult>;
  databaseName?: string;
  loadActivePage?: () => Promise<ActivePageMetadata | null>;
  onOpenAll?: () => Promise<boolean>;
}

type PopupContentProps = Omit<PopupAppProps, 'databaseName'>;

function createQuickNote(title: string): Note {
  const timestamp = new Date().toISOString();
  return {
    id: `note-quick-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title,
    content: { body: '', checklist: [], format: {}, type: 'note-document' },
    plainText: title,
    folderId: null,
    color: 'blue',
    pattern: 'plain',
    pinned: false,
    favorite: false,
    source: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function relativeTime(timestamp: string) {
  const difference = Date.now() - Date.parse(timestamp);
  if (difference < 60_000) return 'Vừa xong';
  if (difference < 86_400_000) return 'Hôm nay';
  if (difference < 172_800_000) return 'Hôm qua';
  return `${Math.max(2, Math.floor(difference / 86_400_000))} ngày trước`;
}

function pageHostname(url: string) {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

function PopupContent({
  capturePage = requestPageCapture,
  loadActivePage = getActivePageMetadata,
  onOpenAll = openSidePanel,
}: PopupContentProps) {
  const { errorMessage, repositories, status: dataStatus } = useMochiData();
  const [recentNotes, setRecentNotes] = useState<Note[]>([]);
  const [activePage, setActivePage] = useState<ActivePageMetadata | null>(null);
  const [activeAction, setActiveAction] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [showRecent, setShowRecent] = useState(true);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    void loadActivePage()
      .then((page) => {
        if (active) setActivePage(page);
      })
      .catch(() => {
        if (active) setActivePage(null);
      });
    return () => {
      active = false;
    };
  }, [loadActivePage]);

  useEffect(() => {
    if (!repositories) return;
    let active = true;
    void repositories.notes.listRecent(3).then((notes) => {
      if (active) setRecentNotes(notes);
    });
    return () => {
      active = false;
    };
  }, [repositories]);

  async function refreshRecentNotes() {
    if (!repositories) return;
    setRecentNotes(await repositories.notes.listRecent(3));
  }

  async function selectAction(actionId: string, label: string) {
    setActiveAction(actionId);
    if (actionId === 'quick-note') {
      setStatus(null);
      return;
    }
    if (actionId === 'record') {
      setStatus('Thu âm sẽ có trong phiên bản sau');
      return;
    }

    const mode: PageCaptureMode = actionId === 'capture' ? 'visible' : 'bookmark';
    setBusy(true);
    setStatus(mode === 'visible' ? 'Đang chụp trang...' : 'Đang lưu trang...');
    const result = await capturePage(mode);
    if (result.ok) {
      await refreshRecentNotes();
      setStatus(mode === 'visible' ? 'Đã chụp trang hiện tại' : 'Đã đánh dấu trang hiện tại');
      setActiveAction(null);
    } else {
      setStatus(result.error || `Chưa thể ${label.toLocaleLowerCase('vi')}`);
    }
    setBusy(false);
  }

  async function saveQuickNote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const title = draftTitle.trim();
    if (!title || !repositories) return;

    const note = createQuickNote(title);
    await repositories.notes.put(note);
    setRecentNotes((currentNotes) => [
      note,
      ...currentNotes.filter((item) => item.id !== note.id),
    ].slice(0, 3));
    setDraftTitle('');
    setActiveAction(null);
    setStatus('Đã lưu ghi chú nhanh');
  }

  async function openAllNotes() {
    try {
      const didOpen = await onOpenAll();
      setStatus(didOpen ? 'Đã mở MochiNote' : 'Mở MochiNote từ thanh bên');
    } catch {
      setStatus('Chưa thể mở MochiNote');
    }
  }

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

      {activePage ? (
        <section className="popup-active-page" aria-label="Trang hiện tại">
          <span><Globe2 aria-hidden="true" size={16} /></span>
          <div>
            <strong>{activePage.pageTitle}</strong>
            <small>{pageHostname(activePage.url)}</small>
          </div>
        </section>
      ) : null}

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
            disabled={busy}
            key={id}
            onClick={() => void selectAction(id, label)}
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
        <form className="popup-quick-note" onSubmit={(event) => void saveQuickNote(event)}>
          <label htmlFor="popup-note-title">Ghi chú nhanh</label>
          <div>
            <input
              id="popup-note-title"
              onChange={(event) => setDraftTitle(event.target.value)}
              placeholder="Nhập nội dung..."
              value={draftTitle}
            />
            <Button disabled={!repositories} size="small" type="submit">Lưu</Button>
          </div>
        </form>
      ) : null}

      {status || dataStatus === 'error' ? (
        <p className="popup-status" role="status">
          {status ?? errorMessage ?? 'Không thể tải dữ liệu MochiNote'}
        </p>
      ) : null}

      {showRecent ? (
        <section className="recent-notes" aria-labelledby="recent-notes-heading">
          <h1 id="recent-notes-heading">Ghi chú gần đây</h1>
          <div className="recent-notes__list">
            {recentNotes.map((note) => (
              <article className="recent-note-row" key={note.id}>
                <span className={`recent-note-row__dot recent-note-row__dot--${note.color}`} />
                <h2>{note.title}</h2>
                <time>{relativeTime(note.updatedAt)}</time>
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

export function PopupApp({ databaseName, ...props }: PopupAppProps) {
  return (
    <MochiDataProvider databaseName={databaseName}>
      <PopupContent {...props} />
    </MochiDataProvider>
  );
}
