import type { ButtonHTMLAttributes, ReactNode } from 'react';

import { classNames } from '../../utils/classNames';

interface ChipProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-pressed'> {
  children: ReactNode;
  selected?: boolean;
}

export function Chip({ children, className, selected = false, type = 'button', ...props }: ChipProps) {
  return (
    <button
      aria-pressed={selected}
      className={classNames('ui-chip', className)}
      type={type}
      {...props}
    >
      {children}
    </button>
  );
}
