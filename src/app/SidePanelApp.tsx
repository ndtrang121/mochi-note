import { useCallback, useEffect, useRef, useState } from 'react';

import { BottomNavigation } from '../components/navigation/BottomNavigation';
import { useTransientStatus } from '../components/hooks/useTransientStatus';
import { UserPreferencesPanel } from '../features/preferences/UserPreferencesPanel';
import { FoldersScreen } from '../features/folders/FoldersScreen';
import { NotesScreen } from '../features/notes/NotesScreen';
import { TasksScreen } from '../features/tasks/TasksScreen';
import { ShortcutHelp } from '../features/shortcuts/ShortcutHelp';
import { resolveKeyboardCommand, type KeyboardCommand } from '../features/shortcuts/keyboardShortcuts';
import { MochiDataProvider } from './MochiDataProvider';
import { useMochiData } from './MochiDataProvider';
import type { AppTab } from './tabs';
import {
  clearNotificationOwnerTarget,
  listenForNotificationOwnerTargets,
  takeNotificationOwnerTarget,
  type NotificationOwnerTarget,
} from '../browser/notificationNavigation';
import type { Note, Task } from '../db/models';

interface SidePanelAppProps {
  copyText?: (text: string) => Promise<void>;
  databaseName?: string;
  initialNavigationTarget?: NotificationOwnerTarget | null;
}

type ResolvedOwnerNavigation =
  | { folderId?: string; note: Note; requestId: string; type: 'note' }
  | { folderId?: string; requestId: string; task: Task; type: 'task' };

function SidePanelContent({
  copyText,
  initialNavigationTarget,
}: Pick<SidePanelAppProps, 'copyText' | 'initialNavigationTarget'>) {
  const { repositories, settings } = useMochiData();
  const [activeTab, setActiveTab] = useState<AppTab>('tasks');
  const [notesImmersive, setNotesImmersive] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [shortcutHelpOpen, setShortcutHelpOpen] = useState(false);
  const [shortcutCommand, setShortcutCommand] = useState<{ command: KeyboardCommand; nonce: number } | null>(null);
  const [ownerNavigation, setOwnerNavigation] = useState<ResolvedOwnerNavigation | null>(null);
  const [folderReturnId, setFolderReturnId] = useState<string | null>(null);
  const [navigationStatus, setNavigationStatus] = useTransientStatus();
  const handledNavigationIds = useRef(new Set<string>());

  const openNotificationOwner = useCallback(async (target: NotificationOwnerTarget) => {
    if (!repositories || handledNavigationIds.current.has(target.requestId)) return;
    handledNavigationIds.current.add(target.requestId);
    setNotesImmersive(false);
    setSettingsOpen(false);
    setNavigationStatus(null);

    if (target.ownerType === 'note') {
      const note = await repositories.notes.get(target.ownerId);
      if (note) {
        setActiveTab('sticky');
        setOwnerNavigation({ note, requestId: target.requestId, type: 'note' });
      } else {
        setOwnerNavigation(null);
        setNavigationStatus('Ghi chú của lời nhắc này không còn tồn tại.');
      }
    } else {
      const task = await repositories.tasks.get(target.ownerId);
      if (task) {
        setActiveTab('tasks');
        setOwnerNavigation({ requestId: target.requestId, task, type: 'task' });
      } else {
        setOwnerNavigation(null);
        setNavigationStatus('Nhiệm vụ của lời nhắc này không còn tồn tại.');
      }
    }
    await clearNotificationOwnerTarget();
  }, [repositories, setNavigationStatus]);

  useEffect(() => {
    if (!repositories) return;
    const stopListening = listenForNotificationOwnerTargets((target) => {
      void openNotificationOwner(target);
    });
    let active = true;
    const initialNavigationTimer = window.setTimeout(() => {
      if (initialNavigationTarget) {
        void openNotificationOwner(initialNavigationTarget);
      } else {
        void takeNotificationOwnerTarget().then((target) => {
          if (active && target) void openNotificationOwner(target);
        });
      }
    }, 0);
    return () => {
      active = false;
      window.clearTimeout(initialNavigationTimer);
      stopListening();
    };
  }, [initialNavigationTarget, openNotificationOwner, repositories]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const command = resolveKeyboardCommand(event);
      if (!command) return;
      event.preventDefault();
      if (command === 'help') {
        setShortcutHelpOpen(true);
        return;
      }
      if (command === 'close') {
        setShortcutHelpOpen(false);
        setSettingsOpen(false);
        setShortcutCommand({ command, nonce: Date.now() });
        return;
      }
      if (command === 'tasks' || command === 'folders' || command === 'sticky' || command === 'new-note' || command === 'notes-search') {
        const nextTab = command === 'new-note' || command === 'notes-search' ? 'sticky' : command;
        setActiveTab(nextTab);
        setNotesImmersive(false);
        setShortcutCommand({ command, nonce: Date.now() });
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    if (ownerNavigation?.type !== 'task' || !ownerNavigation.folderId) return;
    const timer = window.setTimeout(() => setOwnerNavigation(null), 2_000);
    return () => window.clearTimeout(timer);
  }, [ownerNavigation]);
  let activeScreen;
  if (activeTab === 'tasks') {
    activeScreen = (
      <TasksScreen
        navigationTarget={ownerNavigation?.type === 'task' ? ownerNavigation.task : null}
        onOpenSettings={() => setSettingsOpen(true)}
      />
    );
  } else if (activeTab === 'folders') {
    activeScreen = (
      <FoldersScreen
        initialFolderId={folderReturnId}
        onOpenSettings={() => setSettingsOpen(true)}
        onOpenNote={(note, folderId) => {
          setActiveTab('sticky');
          setOwnerNavigation({ folderId, note, requestId: `folder-note-${note.id}`, type: 'note' });
        }}
        onOpenTask={(task, folderId) => {
          setActiveTab('tasks');
          setOwnerNavigation({ folderId, requestId: `folder-task-${task.id}`, task, type: 'task' });
        }}
      />
    );
  } else {
    activeScreen = (
      <NotesScreen
        copyText={copyText}
        navigationTarget={ownerNavigation?.type === 'note' ? ownerNavigation.note : null}
        onImmersiveChange={setNotesImmersive}
        onOpenSettings={() => setSettingsOpen(true)}
        onReturnToFolder={() => {
          const folderId = ownerNavigation?.type === 'note' ? ownerNavigation.folderId ?? null : null;
          setFolderReturnId(folderId);
          setOwnerNavigation(null);
          setActiveTab('folders');
        }}
        shortcutCommand={shortcutCommand}
      />
    );
  }

  const immersive = activeTab === 'sticky' && notesImmersive;

  function changeTab(tab: AppTab) {
    setActiveTab(tab);
    setNotesImmersive(false);
    setOwnerNavigation(null);
    setNavigationStatus(null);
  }

  return (
    <div
      className={`side-panel-app${immersive ? ' side-panel-app--immersive' : ''}`}
      data-layout={settings?.layout ?? 'grid'}
      data-theme={settings?.theme ?? 'system'}
    >
      <main className="side-panel-app__content">{activeScreen}</main>
      {navigationStatus ? <p className="data-operation-status side-panel-navigation-status" role="status">{navigationStatus}</p> : null}
      {immersive ? null : <BottomNavigation activeTab={activeTab} onTabChange={changeTab} />}
      {settingsOpen ? <UserPreferencesPanel onClose={() => setSettingsOpen(false)} /> : null}
      {shortcutHelpOpen ? <ShortcutHelp onClose={() => setShortcutHelpOpen(false)} /> : null}
    </div>
  );
}

export function SidePanelApp({ copyText, databaseName, initialNavigationTarget }: SidePanelAppProps) {
  return (
    <MochiDataProvider databaseName={databaseName}>
      <SidePanelContent copyText={copyText} initialNavigationTarget={initialNavigationTarget} />
    </MochiDataProvider>
  );
}
