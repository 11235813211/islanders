/**
 * A small fully connected network: inputs are standardized, hidden layers use tanh, and the one
 * output is a logit (squashed to 0–1 by `predict`). Plain arrays so weights load from JSON.
 * Training (training/fit.ts) writes this shape; this file only evaluates it.
 */
export interface Net {
  /** Feature names, in input order (a check that weights match the feature code). */
  inputs: string[];
  mean: number[];
  scale: number[];
  /** layers[i].w is [outputs][inputs]. */
  layers: { w: number[][]; b: number[] }[];
}

/** The network's output logit for one input vector. */
export function logit(net: Net, x: readonly number[]): number {
  let a = x.map((v, i) => (v - net.mean[i]!) / net.scale[i]!);
  net.layers.forEach((layer, l) => {
    const last = l === net.layers.length - 1;
    a = layer.w.map((row, j) => {
      let sum = layer.b[j]!;
      for (let i = 0; i < row.length; i++) sum += row[i]! * a[i]!;
      return last ? sum : Math.tanh(sum);
    });
  });
  return a[0]!;
}

/** The network's output as a 0–1 score (a predicted share of wins). */
export const predict = (net: Net, x: readonly number[]): number => 1 / (1 + Math.exp(-logit(net, x)));
