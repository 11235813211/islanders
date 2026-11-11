import { describe, expect, it } from 'vitest';
import { seatChances } from '../shared/bots/advanced/net';
import { type SeatDataset, trainSeatNet } from '../training/mlp';
import { seeded } from '../training/sim';

const net = {
  inputs: ['a', 'b'],
  mean: [0, 0],
  scale: [1, 1],
  layers: [
    {
      w: [
        [0.7, -0.3],
        [0.2, 0.9],
      ],
      b: [0.1, -0.2],
    },
    { w: [[1.1, -0.6]], b: [0.05] },
  ],
};

describe('seatChances', () => {
  it('sums to 1 and does not depend on seat order', () => {
    const seats = [
      [1, 2],
      [-3, 0.5],
      [0.2, 0.2],
      [4, -1],
    ];
    const p = seatChances(net, seats);
    expect(p.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 10);
    const swapped = seatChances(net, [seats[3]!, seats[1]!, seats[0]!, seats[2]!]);
    expect(swapped[0]).toBeCloseTo(p[3]!, 10);
    expect(swapped[1]).toBeCloseTo(p[1]!, 10);
    expect(swapped[2]).toBeCloseTo(p[0]!, 10);
    expect(swapped[3]).toBeCloseTo(p[2]!, 10);
  });
});

/** Seats with the highest feature 0 win with probability 0.8; the rest share 0.2. */
function synthetic(rows: number): SeatDataset {
  const random = seeded(7);
  const width = 2;
  const x = new Float32Array(rows * 6 * width);
  const y = new Float32Array(rows * 6);
  const seats = new Uint8Array(rows);
  const group = new Float64Array(rows);
  for (let r = 0; r < rows; r++) {
    const n = 3 + Math.floor(random() * 2);
    seats[r] = n;
    group[r] = r;
    let top = 0;
    for (let s = 0; s < n; s++) {
      x[(r * 6 + s) * width] = random();
      x[(r * 6 + s) * width + 1] = random();
      if (x[(r * 6 + s) * width]! > x[(r * 6 + top) * width]!) top = s;
    }
    for (let s = 0; s < n; s++) y[r * 6 + s] = s === top ? 0.8 : 0.2 / (n - 1);
  }
  return { x, y, seats, group, width, rows };
}

describe('trainSeatNet', () => {
  it('beats the uniform baseline on a learnable dataset', () => {
    const data = synthetic(4000);
    const fit = trainSeatNet(data, ['a', 'b'], {
      hidden: [8],
      epochs: 15,
      batch: 64,
      rate: 0.01,
      decay: 0,
      validation: 0.2,
      seed: 1,
    });
    expect(fit.validLoss).toBeLessThan(fit.baseLoss - 0.1);
    expect(fit.net.layers.length).toBe(2);
  });
});
