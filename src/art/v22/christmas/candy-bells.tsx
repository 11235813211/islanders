function Bell({ angle }: { angle: number }) {
  return (
    <g transform={`rotate(${angle})`}>
      <ellipse cy="9" rx="8.5" ry="2.5" fill="#986009" />
      <path d="M-7 7Q-4 2-4-3Q-4-10 1-10Q6-10 6-3Q6 2 9 7Q2 11-7 7Z" fill="#e9a91b" stroke="#a96c0a" strokeWidth=".7" />
      <path d="M-5 6Q-2 0-2-5Q0-10 2-8Q0-2 2 7Z" fill="#ffe57a" />
      <path d="M-7 7Q1 11 9 7" stroke="#ffdd62" strokeWidth="1.8" fill="none" />
      <circle cx="1" cy="10" r="2" fill="#f8c742" stroke="#a96c0a" strokeWidth=".6" />
      <path d="M-1-10q-2-4 2-4t2 4" fill="none" stroke="#a96c0a" strokeWidth="1.3" />
    </g>
  );
}

/** Two golden bells and a small green bow give the gumdrop field its own Christmas detail. */
export function CandyBells() {
  return (
    <g>
      <path d="M-8 2Q-6-8 0-13Q6-8 9 1" fill="none" stroke="#b98516" strokeWidth="1" />
      <g transform="translate(-7 0)">
        <Bell angle={20} />
      </g>
      <g transform="translate(8 3)">
        <Bell angle={-20} />
      </g>
      <path
        d="M0-12Q-12-22-10-13Q-8-8 0-12Q8-22 10-14Q10-9 0-12L-3-3M0-12 5-4"
        fill="#25834c"
        stroke="#1b603c"
        strokeWidth="1"
      />
      <circle cy="-12" r="2" fill="#4aaa67" />
    </g>
  );
}
