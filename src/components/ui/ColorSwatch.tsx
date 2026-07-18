import type { ButtonHTMLAttributes, CSSProperties } from 'react';

import { classNames } from '../../utils/classNames';

interface ColorSwatchProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label' | 'aria-pressed' | 'style'> {
  color: string;
  label: string;
  selected?: boolean;
}

type SwatchStyle = CSSProperties & { '--swatch-color': string };

export function ColorSwatch({
  className,
  color,
  label,
  selected = false,
  type = 'button',
  ...props
}: ColorSwatchProps) {
  const style: SwatchStyle = { '--swatch-color': color };

  return (
    <button
      aria-label={label}
      aria-pressed={selected}
      className={classNames('ui-color-swatch', className)}
      style={style}
      type={type}
      {...props}
    />
  );
}
