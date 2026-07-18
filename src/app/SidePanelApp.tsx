import { useState } from 'react';

import { BottomNavigation } from '../components/navigation/BottomNavigation';
import { PreviewScreens } from '../features/previews/PreviewScreens';
import { TasksScreen } from '../features/tasks/TasksScreen';
import type { AppTab } from './tabs';

export function SidePanelApp() {
  const [activeTab, setActiveTab] = useState<AppTab>('tasks');

  return (
    <div className="side-panel-app">
      <main className="side-panel-app__content">
        {activeTab === 'tasks' ? (
          <TasksScreen />
        ) : (
          <PreviewScreens activeTab={activeTab} />
        )}
      </main>
      <BottomNavigation activeTab={activeTab} onTabChange={setActiveTab} />
    </div>
  );
}
