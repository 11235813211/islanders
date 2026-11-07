/** Corner list for a pointy-top hexagon centered at the origin, as an SVG `points` string. */
export function hexPoints(radius: number): string {
  return Array.from({ length: 6 }, (_, index) => {
    const angle = ((index * 60 - 30) * Math.PI) / 180;
    return `${Math.cos(angle) * radius},${Math.sin(angle) * radius}`;
  }).join(' ');
}
