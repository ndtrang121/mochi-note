import { CheckCircle2, Folder, StickyNote } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import type { AppTab } from '../../app/tabs';

interface NavigationItem {
  icon: LucideIcon;
  id: AppTab;
  label: string;
}

const NAVIGATION_ITEMS: NavigationItem[] = [
  { id: 'sticky', label: 'Sticky', icon: StickyNote },
  { id: 'tasks', label: 'Tasks', icon: CheckCircle2 },
  { id: 'folders', label: 'Folders', icon: Folder },
];

interface BottomNavigationProps {
  activeTab: AppTab;
  onTabChange: (tab: AppTab) => void;
}

export function BottomNavigation({ activeTab, onTabChange }: BottomNavigationProps) {
  return (
    <nav className="bottom-navigation" aria-label="Điều hướng chính">
      {NAVIGATION_ITEMS.map(({ icon: Icon, id, label }) => {
        const isActive = id === activeTab;

        return (
          <button
            aria-current={isActive ? 'page' : undefined}
            className="bottom-navigation__item"
            data-tab={id}
            key={id}
            onClick={() => onTabChange(id)}
            type="button"
          >
            <span className="bottom-navigation__icon">
              <Icon aria-hidden="true" size={19} strokeWidth={isActive ? 2.5 : 1.8} />
            </span>
            <span>{label}</span>
          </button>
        );
      })}
    </nav>
  );
}
