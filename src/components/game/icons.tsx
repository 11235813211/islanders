export function CityIcon({ size = 24 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 21V7l5-5 5 5v7l4-4 5 4v7ZM3 8h10M8 12v4m9 0v5" />
    </svg>
  );
}

/** A relay station: a small station house on a road, with a pennant on its post. */
export function RelayIcon({ size = 24 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinejoin="round"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M2 21h20M6 21v-8l5-4 5 4v8M10 21v-4h2v4M16 12V2l5 2-5 2" />
    </svg>
  );
}

export function KnightIcon({ size = 21 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7 21h14l-2-4 1-7-5-6-4-2-1 5-5 6 4 3 4-4-2 5Z" fill="currentColor" />
      <circle cx="14" cy="8" r="1.2" fill="#fff" />
    </svg>
  );
}

/** Small card-shaped count badge (resource or development cards). */
export function CardCount({ count, development = false }: { count: number; development?: boolean }) {
  return (
    <span className={`stat-card ${development ? 'stat-dev' : ''}`}>
      <strong>{count}</strong>
    </span>
  );
}
