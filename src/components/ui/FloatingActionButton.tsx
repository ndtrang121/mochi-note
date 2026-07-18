import { Plus } from 'lucide-react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';

import { classNames } from '../../utils/classNames';

interface FloatingActionButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  'aria-label': string;
  children?: ReactNode;
}

export function FloatingActionButton({
  children,
  className,
  type = 'button',
  ...props
}: FloatingActionButtonProps) {
  return (
    <button className={classNames('ui-fab', className)} type={type} {...props}>
      {children ?? <Plus aria-hidden="true" size={24} strokeWidth={2} />}
    </button>
  );
}
