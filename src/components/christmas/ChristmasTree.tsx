import { CHRISTMAS } from '../../art';

/** The logo's mark at Christmas: a decorated tree in place of the boat. */
export default function ChristmasTree({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="-15 -32 30 44" aria-hidden="true" className="christmas-tree">
      <CHRISTMAS.LogoTree />
    </svg>
  );
}
