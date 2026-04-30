import React from 'react';

/**
 * Logo — Not In Paris wordmark or icon.
 *
 * Assets live in /public (served from site root), so no Vite import
 * is needed. Drop the three PNGs into the public/ folder at repo root:
 *   /public/nip_logo_transparent_black_2.png  (wordmark, black)
 *   /public/nip_logo_transparent_white.png    (wordmark, white)
 *   /public/icon512.png                       (square icon)
 *
 * Props:
 *   variant : 'wordmark' | 'icon'  — default 'wordmark'
 *   color   : 'black' | 'white'    — default 'black' (wordmark only)
 *   height  : number (px)          — default 22 wordmark / 32 icon
 */

export default function Logo({
  variant = 'wordmark',
  color   = 'black',
  height,
  className = '',
  style,
  ...rest
}) {
  const isIcon = variant === 'icon';
  const src = isIcon
    ? '/icon512.png'
    : color === 'white'
      ? '/nip_logo_transparent_white.png'
      : '/nip_logo_transparent_black_2.png';
  const h = height ?? (isIcon ? 32 : 22);

  return (
    <img
      src={src}
      alt="Not In Paris"
      className={('nip-logo ' + className).trim()}
      draggable={false}
      style={{
        height: h,
        width: 'auto',
        display: 'block',
        userSelect: 'none',
        pointerEvents: 'none',
        ...style,
      }}
      {...rest}
    />
  );
}
