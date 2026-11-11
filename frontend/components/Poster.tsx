import Image, { type ImageProps } from 'next/image';

// next/image throws on an empty src, and TMDB has no poster for some films.
// Poster renders a blank printed plate in that case, sized like the image.
export function Poster({ src, alt, ...rest }: ImageProps) {
  if (src) return <Image src={src} alt={alt} {...rest} />;
  const { fill, width, height } = rest;
  return (
    <div
      role="img"
      aria-label={alt}
      className={`${fill ? 'absolute inset-0' : ''} bg-panel flex items-center justify-center`}
      style={fill ? undefined : { width: Number(width), height: Number(height) }}
    >
      <span className="font-sans text-label text-ink2">No plate</span>
    </div>
  );
}
