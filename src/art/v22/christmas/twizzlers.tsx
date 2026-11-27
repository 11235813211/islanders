/** A bent licorice tube with continuous helical grooves, rather than horizontal candy stripes. */
function Twizzler({ height, bend, phase }: { height: number; bend: number; phase: number }) {
  const center = (t: number) => ({ x: bend * Math.sin(t * Math.PI), y: 10 - height * t });
  const body = Array.from({ length: 33 }, (_, i) => {
    const p = center(i / 32);
    return `${i ? 'L' : 'M'}${p.x} ${p.y}`;
  }).join(' ');
  // A ridge disappears around the far side of the tube, then emerges again on the next turn.
  const ridge = (offset: number) => {
    let drawing = false;
    return Array.from({ length: 97 }, (_, i) => {
      const t = i / 96;
      const turn = t * Math.PI * 5.6 + offset + phase;
      if (Math.sin(turn) < 0) {
        drawing = false;
        return '';
      }
      const p = center(t);
      const command = `${drawing ? 'L' : 'M'}${p.x + 2.7 * Math.cos(turn)} ${p.y}`;
      drawing = true;
      return command;
    }).join(' ');
  };
  return (
    <g>
      <path d={body} fill="none" stroke="#9d1936" strokeWidth="7" strokeLinecap="round" />
      <path d={body} fill="none" stroke="#d92b43" strokeWidth="5.8" strokeLinecap="round" />
      {[0, 1, 2].map(i => (
        <g key={i}>
          <path d={ridge((i * Math.PI * 2) / 3)} fill="none" stroke="#a71d36" strokeWidth="1.7" strokeLinecap="round" />
          <path
            d={ridge((i * Math.PI * 2) / 3 + 0.38)}
            fill="none"
            stroke="#f75a66"
            strokeWidth="1.05"
            strokeLinecap="round"
          />
        </g>
      ))}
      <ellipse cy={10 - height} rx="3.2" ry="1.65" fill="#f25a64" stroke="#a51d36" strokeWidth=".65" />
      <path
        d="m0-1.15 .55.55 1-.05-.35.65.35.65-1-.05L0 1.15-.55.6l-1 .05.35-.65-.35-.65 1 .05Z"
        transform={`translate(0 ${10 - height})`}
        fill="#8d1830"
      />
    </g>
  );
}

/** Small, uneven bunches of two to five twists, with differing lengths and leaning stems. */
export function TwizzlerBunch({ count, lean = 0 }: { count: number; lean?: number }) {
  return (
    <g transform={`rotate(${lean})`} data-twizzler-count={count}>
      {Array.from({ length: count }, (_, i) => (
        <g
          key={i}
          transform={`translate(${(i - (count - 1) / 2) * 6.2} ${i % 2 ? 1.5 : 0}) rotate(${(i - (count - 1) / 2) * 5})`}
        >
          <Twizzler height={33 + ((i * 7 + count * 3) % 12)} bend={(i % 2 ? 1 : -1) * 1.8} phase={i * 0.7} />
        </g>
      ))}
    </g>
  );
}
