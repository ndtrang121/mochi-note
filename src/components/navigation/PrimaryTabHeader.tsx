import type { ReactNode } from 'react';

import { classNames } from '../../utils/classNames';
import { Brand } from '../ui/Brand';
import { PrimaryHeaderActions } from './PrimaryHeaderActions';

interface PrimaryTabHeaderProps {
  actions?: ReactNode;
  actionsClassName?: string;
  children?: ReactNode;
  className?: string;
  onOpenSettings?: () => void;
  settingsLabel?: string;
  syncAction?: ReactNode;
  titleClassName?: string;
}

export function PrimaryTabHeader({
  actions,
  actionsClassName,
  children,
  className,
  onOpenSettings,
  settingsLabel,
  syncAction,
  titleClassName,
}: PrimaryTabHeaderProps) {
  return (
    <header className={classNames('primary-tab-header', className)}>
      <div className={classNames('primary-tab-header__title', titleClassName)}>
        <Brand />
        {children}
      </div>
      <PrimaryHeaderActions
        className={classNames('primary-tab-header__actions', actionsClassName)}
        onOpenSettings={onOpenSettings}
        settingsLabel={settingsLabel}
        syncAction={syncAction}
      >
        {actions}
      </PrimaryHeaderActions>
    </header>
  );
}
