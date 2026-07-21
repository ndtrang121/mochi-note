import { Settings } from 'lucide-react';
import type { ReactNode } from 'react';

import { IconButton } from '../ui/IconButton';

interface PrimaryHeaderActionsProps {
  children?: ReactNode;
  className: string;
  onOpenSettings?: () => void;
  settingsLabel?: string;
  syncAction?: ReactNode;
}

export function PrimaryHeaderActions({
  children,
  className,
  onOpenSettings,
  settingsLabel = 'Cài đặt',
  syncAction,
}: PrimaryHeaderActionsProps) {
  return (
    <div className={className}>
      {syncAction}
      <IconButton aria-label={settingsLabel} onClick={onOpenSettings}>
        <Settings aria-hidden="true" size={18} />
      </IconButton>
      {children}
    </div>
  );
}
