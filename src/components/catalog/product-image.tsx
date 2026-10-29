import Image, { type ImageProps } from "next/image";

/**
 * next/image, but serves the generated SVG placeholders as-is: SVGs aren't
 * run through the image optimizer.
 */
export function ProductImage(props: ImageProps & { src: string }) {
  const isSvg = props.src.startsWith("/placeholder/") || /\.svg(\?|$)/.test(props.src);
  return <Image {...props} unoptimized={isSvg || props.unoptimized} alt={props.alt} />;
}
