import { useEffect, useState } from 'react';

import { BottomNavigation } from '../components/navigation/BottomNavigation';
import { UserPreferencesPanel } from '../features/preferences/UserPreferencesPanel';
import { FoldersScreen } from '../features/folders/FoldersScreen';
import { NotesScreen } from '../features/notes/NotesScreen';
import { StickyScreen } from '../features/sticky/StickyScreen';
import { TasksScreen } from '../features/tasks/TasksScreen';
import { ShortcutHelp } from '../features/shortcuts/ShortcutHelp';
import { resolveKeyboardCommand, type KeyboardCommand } from '../features/shortcuts/keyboardShortcuts';
import { MochiDataProvider } from './MochiDataProvider';
import { useMochiData } from './MochiDataProvider';
import type { AppTab } from './tabs';

interface SidePanelAppProps {
  copyText?: (text: string) => Promise<void>;
  databaseName?: string;
}

function SidePanelContent({ copyText }: Pick<SidePanelAppProps, 'copyText'>) {
  const { settings } = useMochiData();
  const [activeTab, setActiveTab] = useState<AppTab>('tasks');
  const [notesImmersive, setNotesImmersive] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [shortcutHelpOpen, setShortcutHelpOpen] = useState(false);
  const [shortcutCommand, setShortcutCommand] = useState<{ command: KeyboardCommand; nonce: number } | null>(null);

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
        const nextTab = command === 'new-note' || command === 'notes-search' ? 'notes' : command;
        setActiveTab(nextTab);
        setNotesImmersive(false);
        setShortcutCommand({ command, nonce: Date.now() });
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  let activeScreen;
  if (activeTab === 'tasks') {
    activeScreen = <TasksScreen onOpenSettings={() => setSettingsOpen(true)} />;
  } else if (activeTab === 'folders') {
    activeScreen = <FoldersScreen />;
  } else if (activeTab === 'sticky') {
    activeScreen = <StickyScreen onOpenSettings={() => setSettingsOpen(true)} />;
  } else {
    activeScreen = <NotesScreen copyText={copyText} onImmersiveChange={setNotesImmersive} shortcutCommand={shortcutCommand} />;
  }

  const immersive = activeTab === 'notes' && notesImmersive;

  function changeTab(tab: AppTab) {
    setActiveTab(tab);
    setNotesImmersive(false);
  }

  return (
    <div
      className={`side-panel-app${immersive ? ' side-panel-app--immersive' : ''}`}
      data-layout={settings?.layout ?? 'grid'}
      data-theme={settings?.theme ?? 'system'}
    >
      <main className="side-panel-app__content">{activeScreen}</main>
      {immersive ? null : <BottomNavigation activeTab={activeTab} onTabChange={changeTab} />}
      {settingsOpen ? <UserPreferencesPanel onClose={() => setSettingsOpen(false)} /> : null}
      {shortcutHelpOpen ? <ShortcutHelp onClose={() => setShortcutHelpOpen(false)} /> : null}
    </div>
  );
}

export function SidePanelApp({ copyText, databaseName }: SidePanelAppProps) {
  return (
    <MochiDataProvider databaseName={databaseName}>
      <SidePanelContent copyText={copyText} />
    </MochiDataProvider>
  );
}
