import { useState } from 'react';

import { BottomNavigation } from '../components/navigation/BottomNavigation';
import { FoldersScreen } from '../features/folders/FoldersScreen';
import { NotesScreen } from '../features/notes/NotesScreen';
import { StickyScreen } from '../features/sticky/StickyScreen';
import { TasksScreen } from '../features/tasks/TasksScreen';
import { MochiDataProvider } from './MochiDataProvider';
import type { AppTab } from './tabs';

interface SidePanelAppProps {
  copyText?: (text: string) => Promise<void>;
  databaseName?: string;
}

function SidePanelContent({ copyText }: Pick<SidePanelAppProps, 'copyText'>) {
  const [activeTab, setActiveTab] = useState<AppTab>('tasks');
  const [notesImmersive, setNotesImmersive] = useState(false);

  let activeScreen;
  if (activeTab === 'tasks') {
    activeScreen = <TasksScreen />;
  } else if (activeTab === 'folders') {
    activeScreen = <FoldersScreen />;
  } else if (activeTab === 'sticky') {
    activeScreen = <StickyScreen />;
  } else {
    activeScreen = <NotesScreen copyText={copyText} onImmersiveChange={setNotesImmersive} />;
  }

  const immersive = activeTab === 'notes' && notesImmersive;

  function changeTab(tab: AppTab) {
    setActiveTab(tab);
    setNotesImmersive(false);
  }

  return (
    <div className={`side-panel-app${immersive ? ' side-panel-app--immersive' : ''}`}>
      <main className="side-panel-app__content">{activeScreen}</main>
      {immersive ? null : <BottomNavigation activeTab={activeTab} onTabChange={changeTab} />}
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
