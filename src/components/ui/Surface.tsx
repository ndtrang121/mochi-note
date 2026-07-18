import type { HTMLAttributes, ReactNode } from 'react';

import { classNames } from '../../utils/classNames';

interface SurfaceProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  raised?: boolean;
}

export function Surface({ children, className, raised = false, ...props }: SurfaceProps) {
  return (
    <div
      className={classNames('ui-surface', raised && 'ui-surface--raised', className)}
      {...props}
    >
      {children}
    </div>
  );
}
