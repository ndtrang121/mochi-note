import type { ButtonHTMLAttributes, ReactNode } from 'react';

import { classNames } from '../../utils/classNames';

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  'aria-label': string;
  children: ReactNode;
  variant?: 'ghost' | 'outlined';
}

export function IconButton({
  children,
  className,
  type = 'button',
  variant = 'ghost',
  ...props
}: IconButtonProps) {
  return (
    <button
      className={classNames(
        'ui-icon-button',
        variant === 'outlined' && 'ui-icon-button--outlined',
        className,
      )}
      type={type}
      {...props}
    >
      {children}
    </button>
  );
}
