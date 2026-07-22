import type { ReactNode } from 'react';

import { Brand } from '../ui/Brand';

interface PrimaryHeaderProps {
  accountAction: ReactNode;
  actions?: ReactNode;
  heading?: string;
  headingId?: string;
}

export function PrimaryHeader({
  accountAction,
  actions,
  heading,
  headingId,
}: PrimaryHeaderProps) {
  return (
    <header className="primary-header">
      <div className="primary-header__brand">
        <Brand />
        {heading && headingId ? <h1 className="sr-only" id={headingId}>{heading}</h1> : null}
      </div>
      <div className="primary-header__actions">
        {actions}
        {accountAction}
      </div>
    </header>
  );
}
