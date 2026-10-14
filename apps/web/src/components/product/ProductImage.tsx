import clsx, { type ClassValue } from 'clsx';

export interface ProductImageProps {
  src: string;
  alt: string;
  className?: ClassValue;
  eager?: boolean;
}

/**
 * Plain <img> — the product imagery is generated SVG served by our own
 * route handler, so no optimizer is needed.
 */
export default function ProductImage({ src, alt, className, eager }: ProductImageProps) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      width={1200}
      height={900}
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
      className={clsx('aspect-[4/3] w-full bg-navy-50 object-cover', className)}
    />
  );
}
