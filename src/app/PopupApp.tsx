import { useEffect, useMemo, useState } from 'react';

import { openSidePanel } from '../browser/openSidePanel';
import { requestReminderReconciliation } from '../browser/reminders';
import type { Folder, Note, Reminder } from '../db/models';
import { NoteEditor, type FolderOption } from '../features/notes/NotesScreen';
import { type ReminderDraft } from '../features/notes/ReminderFields';
import { MochiDataProvider, useMochiData } from './MochiDataProvider';

interface PopupAppProps {
  databaseName?: string;
}

function createEntityId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function folderOptions(folders: Folder[]): FolderOption[] {
  const byParent = new Map<string | null, Folder[]>();
  for (const folder of folders) {
    const parentId = folder.parentId ?? null;
    byParent.set(parentId, [...(byParent.get(parentId) ?? []), folder]);
  }

  const result: FolderOption[] = [];
  const visited = new Set<string>();
  function visit(parentId: string | null, depth: number) {
    const siblings = [...(byParent.get(parentId) ?? [])].sort(
      (first, second) => first.position - second.position,
    );
    for (const folder of siblings) {
      if (visited.has(folder.id)) continue;
      visited.add(folder.id);
      result.push({ depth, folder });
      visit(folder.id, depth + 1);
    }
  }
  visit(null, 0);
  return result;
}

function PopupContent() {
  const { errorMessage, repositories, settings, status: dataStatus } = useMochiData();
  const [folders, setFolders] = useState<Folder[]>([]);
  const [saving, setSaving] = useState(false);
  const [panelStatus, setPanelStatus] = useState<string | null>(null);
  const options = useMemo(() => folderOptions(folders), [folders]);

  useEffect(() => {
    if (!repositories) return;
    let active = true;
    void repositories.folders.listOrdered().then((storedFolders) => {
      if (active) setFolders(storedFolders);
    });
    return () => {
      active = false;
    };
  }, [repositories]);

  async function showSidePanel() {
    if (saving) return;
    setPanelStatus(null);
    try {
      const opened = await openSidePanel();
      if (!opened) {
        setPanelStatus('Trình duyệt này chưa hỗ trợ Side Panel.');
        return;
      }
      window.close();
    } catch {
      setPanelStatus('Không thể mở Side Panel. Hãy thử lại.');
    }
  }

  async function saveSticky(note: Note, reminderDraft: ReminderDraft) {
    if (!repositories || saving) return;
    setSaving(true);
    try {
      const reminderTime = Date.parse(reminderDraft.localDateTime);
      if (
        reminderDraft.enabled
        && (!reminderDraft.localDateTime || !Number.isFinite(reminderTime) || reminderTime <= Date.now())
      ) {
        throw new Error('Hãy chọn ngày và giờ nhắc nhở trong tương lai.');
      }

      if (reminderDraft.enabled) {
        const now = new Date().toISOString();
        const reminder: Reminder = {
          id: createEntityId('reminder'),
          ownerId: note.id,
          ownerType: 'note',
          scheduledAt: new Date(reminderTime).toISOString(),
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Ho_Chi_Minh',
          repeatRule: reminderDraft.repeatRule,
          enabled: true,
          createdAt: now,
          updatedAt: now,
        };
        await Promise.all([repositories.notes.put(note), repositories.reminders.put(reminder)]);
      } else {
        await repositories.notes.put(note);
      }
      void requestReminderReconciliation();
      window.close();
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="popup-sticky-app" data-theme={settings?.theme ?? 'system'}>
      {repositories ? (
        <NoteEditor
          compact
          folders={options}
          newNoteHeading="Sticky mới"
          note={null}
          onBack={() => window.close()}
          onOpenSidePanel={() => void showSidePanel()}
          onSave={saveSticky}
          reminder={null}
        />
      ) : (
        <p className="popup-status" role="status">
          {dataStatus === 'error' ? errorMessage ?? 'Không thể tải MochiNote.' : 'Đang chuẩn bị Sticky...'}
        </p>
      )}
      {saving ? <p className="popup-status" role="status">Đang tạo Sticky...</p> : null}
      {panelStatus ? <p className="popup-status" role="status">{panelStatus}</p> : null}
    </main>
  );
}

export function PopupApp({ databaseName }: PopupAppProps) {
  return (
    <MochiDataProvider databaseName={databaseName}>
      <PopupContent />
    </MochiDataProvider>
  );
}
