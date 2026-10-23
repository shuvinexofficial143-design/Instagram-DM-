type BrandMarkProps = { size?: number; className?: string };

/** One scalable mark for navigation, authentication and the launch screen. */
export const BrandMark = ({ size = 36, className = '' }: BrandMarkProps) => (
  <img
    className={`brand-mark ${className}`.trim()}
    src="/auto-replys-brand.svg?v=2"
    width={size}
    height={size}
    alt=""
    aria-hidden="true"
    decoding="sync"
    draggable={false}
    style={{ display: 'block', flexShrink: 0, width: size, height: size }}
  />
);
