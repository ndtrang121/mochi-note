import { classNames } from '../../utils/classNames';

interface BrandProps {
  className?: string;
  compact?: boolean;
}

export function Brand({ className, compact = false }: BrandProps) {
  return (
    <div className={classNames('brand-lockup', compact && 'brand-lockup--compact', className)}>
      <img
        className={compact ? 'brand-lockup__mascot' : 'brand-lockup__logo'}
        src={compact ? '/brand/mochi-mascot.png' : '/brand/full_logo_h.png'}
        alt={compact ? '' : 'MochiNote'}
      />
    </div>
  );
}
