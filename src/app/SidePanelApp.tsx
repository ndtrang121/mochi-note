import { useState } from 'react';

import { BottomNavigation } from '../components/navigation/BottomNavigation';
import { FoldersScreen } from '../features/folders/FoldersScreen';
import { NotesPreview } from '../features/previews/PreviewScreens';
import { StickyScreen } from '../features/sticky/StickyScreen';
import { TasksScreen } from '../features/tasks/TasksScreen';
import { MochiDataProvider } from './MochiDataProvider';
import type { AppTab } from './tabs';

interface SidePanelAppProps {
  databaseName?: string;
}

function SidePanelContent() {
  const [activeTab, setActiveTab] = useState<AppTab>('tasks');

  let activeScreen;
  if (activeTab === 'tasks') {
    activeScreen = <TasksScreen />;
  } else if (activeTab === 'folders') {
    activeScreen = <FoldersScreen />;
  } else if (activeTab === 'sticky') {
    activeScreen = <StickyScreen />;
  } else {
    activeScreen = <NotesPreview />;
  }

  return (
    <div className="side-panel-app">
      <main className="side-panel-app__content">{activeScreen}</main>
      <BottomNavigation activeTab={activeTab} onTabChange={setActiveTab} />
    </div>
  );
}

export function SidePanelApp({ databaseName }: SidePanelAppProps) {
  return (
    <MochiDataProvider databaseName={databaseName}>
      <SidePanelContent />
    </MochiDataProvider>
  );
}
