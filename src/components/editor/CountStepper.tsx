import { Minus, Plus } from 'lucide-react';

/** A − count + control for small whole numbers (setup rounds, points, pieces). */
export default function CountStepper({
  label,
  value,
  min,
  max,
  set,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  set: (value: number) => void;
}) {
  return (
    <div className="count-stepper" role="group" aria-label={label}>
      <button type="button" aria-label={`Fewer ${label}`} disabled={value <= min} onClick={() => set(value - 1)}>
        <Minus size={14} />
      </button>
      <output aria-live="polite">{value}</output>
      <button type="button" aria-label={`More ${label}`} disabled={value >= max} onClick={() => set(value + 1)}>
        <Plus size={14} />
      </button>
    </div>
  );
}
