import { classNames } from '../../utils/classNames';

interface BrandProps {
  className?: string;
  compact?: boolean;
}

export function Brand({ className, compact = false }: BrandProps) {
  return (
    <div className={classNames('brand-lockup', compact && 'brand-lockup--compact', className)}>
      <img className="brand-lockup__mascot" src="/brand/mochi-mascot.png" alt="" />
      <span className="brand-lockup__name">MochiNote</span>
    </div>
  );
}
