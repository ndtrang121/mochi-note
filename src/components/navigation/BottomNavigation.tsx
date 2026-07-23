import { CheckCircle2, Folder, StickyNote } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import type { AppTab } from '../../app/tabs';
import { useI18n } from '../../i18n/I18nProvider';
import type { MessageKey } from '../../i18n/messages';

interface NavigationItem {
  icon: LucideIcon;
  id: AppTab;
  labelKey: MessageKey;
}

const NAVIGATION_ITEMS: NavigationItem[] = [
  { id: 'sticky', labelKey: 'nav.sticky', icon: StickyNote },
  { id: 'tasks', labelKey: 'nav.tasks', icon: CheckCircle2 },
  { id: 'folders', labelKey: 'nav.folders', icon: Folder },
];

interface BottomNavigationProps {
  activeTab: AppTab;
  onTabChange: (tab: AppTab) => void;
}

export function BottomNavigation({ activeTab, onTabChange }: BottomNavigationProps) {
  const { t } = useI18n();
  return (
    <nav className="bottom-navigation" aria-label={t('nav.primary')}>
      {NAVIGATION_ITEMS.map(({ icon: Icon, id, labelKey }) => {
        const isActive = id === activeTab;
        const label = t(labelKey);

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
