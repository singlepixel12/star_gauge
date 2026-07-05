// src/regions.js — stylized, display-only colour regions.
// NOT a scholarly cell map: an approximation by Chebyshev distance from centre.
// Swapping in a verified cell-by-cell map later only touches regionAt().
export const REGION_IDS = ['center', 'band-inner', 'band-mid', 'band-outer', 'band-far', 'border'];

export function regionAt(row, col) {
  const ring = Math.max(Math.abs(row - 14), Math.abs(col - 14)); // 0..14
  if (ring === 0) return 'center';
  if (ring === 14) return 'border';
  if (ring <= 3) return 'band-inner';
  if (ring <= 6) return 'band-mid';
  if (ring <= 9) return 'band-outer';
  return 'band-far'; // rings 10..13
}
