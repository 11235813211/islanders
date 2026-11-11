import type { Net } from '../shared/bots/advanced/net';
import { seeded } from './sim';

/**
 * Trains the small networks the bots use (shared/bots/advanced/net.ts evaluates them): inputs
 * standardized, tanh hidden layers, one sigmoid output, binary cross-entropy against soft labels
 * (0–1), Adam, L2 weight decay, early stopping on a validation split. `hidden: []` is logistic
 * regression, the baseline any network has to beat.
 */

export interface Dataset {
  x: Float32Array;
  y: Float32Array;
  /** Rows sharing a group (one game) stay on the same side of the validation split. */
  group: Float64Array;
  width: number;
  rows: number;
}

export interface FitOptions {
  hidden: number[];
  epochs: number;
  batch: number;
  rate: number;
  decay: number;
  /** Share of groups held out for validation. */
  validation: number;
  seed: number;
  /** Start from these weights instead of random ones (to keep training a saved network). */
  start?: Net | null;
  log?: (line: string) => void;
}

export interface FitResult {
  net: Net;
  trainLoss: number;
  validLoss: number;
  /** Loss of always predicting the average label: the bar to beat. */
  baseLoss: number;
  epochs: number;
}

/** Fit a network; `inputs` names the features. */
export function trainNet(data: Dataset, inputs: string[], options: FitOptions): FitResult {
  const random = seeded(options.seed);
  const { width } = data;
  const valid: number[] = [];
  const train: number[] = [];
  for (let i = 0; i < data.rows; i++) {
    // A cheap hash of the group decides the split, so a game is never on both sides.
    const h = Math.abs(Math.sin(data.group[i]! * 12.9898) * 43758.5453) % 1;
    (h < options.validation ? valid : train).push(i);
  }
  const mean = new Array(width).fill(0);
  const scale = new Array(width).fill(0);
  for (const i of train) for (let j = 0; j < width; j++) mean[j] += data.x[i * width + j]! / train.length;
  for (const i of train)
    for (let j = 0; j < width; j++) scale[j] += (data.x[i * width + j]! - mean[j]) ** 2 / train.length;
  for (let j = 0; j < width; j++) scale[j] = Math.sqrt(scale[j]) || 1;

  const sizes = [width, ...options.hidden, 1];
  const start = options.start;
  const matches = start && start.layers.length === sizes.length - 1 && start.inputs.join() === inputs.join();
  const layers = sizes.slice(1).map((out, l) => {
    const fanIn = sizes[l]!;
    const w = Array.from({ length: out }, (_, o) =>
      Float64Array.from({ length: fanIn }, (_, i) =>
        matches ? start.layers[l]!.w[o]![i]! : ((random() * 2 - 1) * Math.sqrt(6 / (fanIn + out))) / 2,
      ),
    );
    const b = Float64Array.from({ length: out }, (_, o) => (matches ? start.layers[l]!.b[o]! : 0));
    return { w, b };
  });
  if (matches) {
    // Keep the old standardization so the loaded weights mean the same thing.
    mean.splice(0, width, ...start.mean);
    scale.splice(0, width, ...start.scale);
  }

  const adam = layers.map(l => ({
    mw: l.w.map(r => new Float64Array(r.length)),
    vw: l.w.map(r => new Float64Array(r.length)),
    mb: new Float64Array(l.b.length),
    vb: new Float64Array(l.b.length),
  }));
  const grads = layers.map(l => ({ w: l.w.map(r => new Float64Array(r.length)), b: new Float64Array(l.b.length) }));
  const acts = sizes.map(n => new Float64Array(n));
  const deltas = sizes.map(n => new Float64Array(n));

  const forward = (row: number) => {
    const a0 = acts[0]!;
    for (let j = 0; j < width; j++) a0[j] = (data.x[row * width + j]! - mean[j]) / scale[j];
    layers.forEach((layer, l) => {
      const input = acts[l]!;
      const output = acts[l + 1]!;
      const last = l === layers.length - 1;
      for (let o = 0; o < layer.b.length; o++) {
        let sum = layer.b[o]!;
        const w = layer.w[o]!;
        for (let i = 0; i < w.length; i++) sum += w[i]! * input[i]!;
        output[o] = last ? 1 / (1 + Math.exp(-sum)) : Math.tanh(sum);
      }
    });
    return acts[sizes.length - 1]![0]!;
  };
  const bce = (p: number, y: number) => -(y * Math.log(p + 1e-7) + (1 - y) * Math.log(1 - p + 1e-7));
  const loss = (rows: number[]) => rows.reduce((s, i) => s + bce(forward(i), data.y[i]!), 0) / (rows.length || 1);
  const avg = train.reduce((s, i) => s + data.y[i]!, 0) / train.length;
  const baseLoss = valid.reduce((s, i) => s + bce(avg, data.y[i]!), 0) / (valid.length || 1);

  let best = { loss: Infinity, layers: layers.map(l => ({ w: l.w.map(r => [...r]), b: [...l.b] })), epoch: 0 };
  let step = 0;
  for (let epoch = 1; epoch <= options.epochs; epoch++) {
    for (let i = train.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [train[i], train[j]] = [train[j]!, train[i]!];
    }
    for (let s = 0; s < train.length; s += options.batch) {
      for (const g of grads) {
        for (const r of g.w) r.fill(0);
        g.b.fill(0);
      }
      const batch = train.slice(s, s + options.batch);
      for (const row of batch) {
        const p = forward(row);
        // Sigmoid + cross-entropy: the output delta is just p - y.
        deltas[sizes.length - 1]![0] = p - data.y[row]!;
        for (let l = layers.length - 1; l >= 0; l--) {
          const layer = layers[l]!;
          const input = acts[l]!;
          const delta = deltas[l + 1]!;
          const below = deltas[l]!;
          below.fill(0);
          for (let o = 0; o < layer.b.length; o++) {
            const d = delta[o]!;
            grads[l]!.b[o]! += d;
            const w = layer.w[o]!;
            const gw = grads[l]!.w[o]!;
            for (let i = 0; i < w.length; i++) {
              gw[i]! += d * input[i]!;
              below[i]! += d * w[i]!;
            }
          }
          if (l > 0) for (let i = 0; i < below.length; i++) below[i]! *= 1 - input[i]! ** 2;
        }
      }
      step++;
      const lr = options.rate;
      const [b1, b2] = [0.9, 0.999];
      const fix1 = 1 - b1 ** step;
      const fix2 = 1 - b2 ** step;
      layers.forEach((layer, l) => {
        const m = adam[l]!;
        const update = (value: number, g: number, mArr: Float64Array, vArr: Float64Array, k: number, decay: number) => {
          const grad = g / batch.length + decay * value;
          mArr[k] = b1 * mArr[k]! + (1 - b1) * grad;
          vArr[k] = b2 * vArr[k]! + (1 - b2) * grad * grad;
          return value - (lr * (mArr[k]! / fix1)) / (Math.sqrt(vArr[k]! / fix2) + 1e-8);
        };
        layer.w.forEach((row, o) => {
          for (let i = 0; i < row.length; i++)
            row[i] = update(row[i]!, grads[l]!.w[o]![i]!, m.mw[o]!, m.vw[o]!, i, options.decay);
        });
        for (let o = 0; o < layer.b.length; o++) layer.b[o] = update(layer.b[o]!, grads[l]!.b[o]!, m.mb, m.vb, o, 0);
      });
    }
    const v = loss(valid);
    options.log?.(`  epoch ${epoch}: valid loss ${v.toFixed(5)} (base ${baseLoss.toFixed(5)})`);
    if (v < best.loss) best = { loss: v, layers: layers.map(l => ({ w: l.w.map(r => [...r]), b: [...l.b] })), epoch };
    else if (epoch - best.epoch >= 4) break;
  }
  best.layers.forEach((saved, l) => {
    saved.w.forEach((row, o) => {
      layers[l]!.w[o]!.set(row);
    });
    layers[l]!.b.set(saved.b);
  });
  return {
    net: { inputs, mean, scale, layers: best.layers },
    trainLoss: loss(train.slice(0, 20000)),
    validLoss: best.loss,
    baseLoss,
    epochs: best.epoch,
  };
}
