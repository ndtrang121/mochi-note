import type { ButtonHTMLAttributes, ReactNode } from 'react';

import { classNames } from '../../utils/classNames';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  size?: 'default' | 'small';
  variant?: 'danger' | 'ghost' | 'primary' | 'secondary';
}

export function Button({
  children,
  className,
  size = 'default',
  type = 'button',
  variant = 'primary',
  ...props
}: ButtonProps) {
  return (
    <button
      className={classNames(
        'ui-button',
        `ui-button--${variant}`,
        size === 'small' && 'ui-button--small',
        className,
      )}
      type={type}
      {...props}
    >
      {children}
    </button>
  );
}
