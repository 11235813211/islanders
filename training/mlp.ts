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

type Layers = { w: Float64Array[]; b: Float64Array }[];
type Saved = { w: number[][]; b: number[] }[];

export interface SeatDataset {
  /** rows × 6 seats × width features; absent seats are zero and ignored. */
  x: Float32Array;
  /** rows × 6 target chances (0 for absent seats). */
  y: Float32Array;
  /** Seats present per row (1–6); seat 0 is the viewing seat. */
  seats: Uint8Array;
  group: Float64Array;
  width: number;
  rows: number;
}

const SEAT_SLOTS = 6;

/** Split row indexes by a cheap hash of the group, so a game is never on both sides. */
function splitRows(group: Float64Array, rows: number, validation: number) {
  const valid: number[] = [];
  const train: number[] = [];
  for (let i = 0; i < rows; i++) {
    const h = Math.abs(Math.sin(group[i]! * 12.9898) * 43758.5453) % 1;
    (h < validation ? valid : train).push(i);
  }
  return { train, valid };
}

/** Standardize over the given feature vectors (offsets into x), then adopt a warm start's own. */
function standardization(x: Float32Array, offsets: number[], width: number, start: Net | null) {
  const mean = new Array(width).fill(0);
  const scale = new Array(width).fill(0);
  const n = offsets.length || 1;
  for (const o of offsets) for (let j = 0; j < width; j++) mean[j] += x[o + j]! / n;
  for (const o of offsets) for (let j = 0; j < width; j++) scale[j] += (x[o + j]! - mean[j]) ** 2 / n;
  for (let j = 0; j < width; j++) scale[j] = Math.sqrt(scale[j]) || 1;
  if (start) {
    // Keep the old standardization so the loaded weights mean the same thing.
    mean.splice(0, width, ...start.mean);
    scale.splice(0, width, ...start.scale);
  }
  return { mean, scale };
}

/** Random (or warm-started) weights; the start is used only when shapes and inputs match. */
function initLayers(sizes: number[], inputs: string[], options: FitOptions, random: () => number) {
  const start = options.start;
  const matches = !!start && start.layers.length === sizes.length - 1 && start.inputs.join() === inputs.join();
  const layers: Layers = sizes.slice(1).map((out, l) => {
    const fanIn = sizes[l]!;
    const w = Array.from({ length: out }, (_, o) =>
      Float64Array.from({ length: fanIn }, (_, i) =>
        matches ? start!.layers[l]!.w[o]![i]! : ((random() * 2 - 1) * Math.sqrt(6 / (fanIn + out))) / 2,
      ),
    );
    const b = Float64Array.from({ length: out }, (_, o) => (matches ? start!.layers[l]!.b[o]! : 0));
    return { w, b };
  });
  return { layers, start: matches ? start : null };
}

/** Per-layer buffers shaped like the weights (gradients, Adam moments). */
function zerosLike(layers: Layers) {
  return layers.map(l => ({ w: l.w.map(r => new Float64Array(r.length)), b: new Float64Array(l.b.length) }));
}

const snapshot = (layers: Layers): Saved => layers.map(l => ({ w: l.w.map(r => [...r]), b: [...l.b] }));

/** Activations and deltas for one forward/backward pass. */
function workspace(sizes: number[]) {
  return { acts: sizes.map(n => new Float64Array(n)), deltas: sizes.map(n => new Float64Array(n)) };
}

/** Forward pass over acts[0] (already standardized); returns the output (sigmoid if asked, else logit). */
function forwardPass(layers: Layers, acts: Float64Array[], sigmoid: boolean) {
  for (let l = 0; l < layers.length; l++) {
    const layer = layers[l]!;
    const input = acts[l]!;
    const output = acts[l + 1]!;
    const last = l === layers.length - 1;
    for (let o = 0; o < layer.b.length; o++) {
      let sum = layer.b[o]!;
      const w = layer.w[o]!;
      for (let i = 0; i < w.length; i++) sum += w[i]! * input[i]!;
      output[o] = last ? (sigmoid ? 1 / (1 + Math.exp(-sum)) : sum) : Math.tanh(sum);
    }
  }
  return acts[layers.length]![0]!;
}

/** Backprop one pass whose output delta is already in deltas[last]; adds into grads. */
function backwardPass(layers: Layers, ws: ReturnType<typeof workspace>, grads: ReturnType<typeof zerosLike>) {
  for (let l = layers.length - 1; l >= 0; l--) {
    const layer = layers[l]!;
    const input = ws.acts[l]!;
    const delta = ws.deltas[l + 1]!;
    const below = ws.deltas[l]!;
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

/** One Adam step on summed gradients averaged over `count`; L2 decay on weights only. */
function adamStep(
  layers: Layers,
  adam: { mw: Float64Array[]; vw: Float64Array[]; mb: Float64Array; vb: Float64Array }[],
  grads: ReturnType<typeof zerosLike>,
  count: number,
  step: number,
  options: FitOptions,
) {
  const [b1, b2] = [0.9, 0.999];
  const fix1 = 1 - b1 ** step;
  const fix2 = 1 - b2 ** step;
  const update = (value: number, g: number, mArr: Float64Array, vArr: Float64Array, k: number, decay: number) => {
    const grad = g / count + decay * value;
    mArr[k] = b1 * mArr[k]! + (1 - b1) * grad;
    vArr[k] = b2 * vArr[k]! + (1 - b2) * grad * grad;
    return value - (options.rate * (mArr[k]! / fix1)) / (Math.sqrt(vArr[k]! / fix2) + 1e-8);
  };
  layers.forEach((layer, l) => {
    const m = adam[l]!;
    layer.w.forEach((row, o) => {
      for (let i = 0; i < row.length; i++)
        row[i] = update(row[i]!, grads[l]!.w[o]![i]!, m.mw[o]!, m.vw[o]!, i, options.decay);
    });
    for (let o = 0; o < layer.b.length; o++) layer.b[o] = update(layer.b[o]!, grads[l]!.b[o]!, m.mb, m.vb, o, 0);
  });
}

/**
 * The shared epoch loop: shuffle, minibatch (`accumulate` adds one row's gradient), validate,
 * stop after 4 epochs without improvement, and leave the best weights in `layers`.
 */
function optimize(
  layers: Layers,
  train: number[],
  options: FitOptions,
  random: () => number,
  accumulate: (row: number) => void,
  grads: ReturnType<typeof zerosLike>,
  validate: () => number,
  baseLoss: number,
) {
  const adam = layers.map(l => {
    const m = zerosLike([l])[0]!;
    const v = zerosLike([l])[0]!;
    return { mw: m.w, vw: v.w, mb: m.b, vb: v.b };
  });
  let best = { loss: Infinity, layers: snapshot(layers), epoch: 0 };
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
      const end = Math.min(s + options.batch, train.length);
      for (let k = s; k < end; k++) accumulate(train[k]!);
      adamStep(layers, adam, grads, end - s, ++step, options);
    }
    const v = validate();
    options.log?.(`  epoch ${epoch}: valid loss ${v.toFixed(5)} (base ${baseLoss.toFixed(5)})`);
    if (v < best.loss) best = { loss: v, layers: snapshot(layers), epoch };
    else if (epoch - best.epoch >= 4) break;
  }
  best.layers.forEach((saved, l) => {
    saved.w.forEach((row, o) => {
      layers[l]!.w[o]!.set(row);
    });
    layers[l]!.b.set(saved.b);
  });
  return best;
}

/** Fit a network; `inputs` names the features. */
export function trainNet(data: Dataset, inputs: string[], options: FitOptions): FitResult {
  const random = seeded(options.seed);
  const { width } = data;
  const { train, valid } = splitRows(data.group, data.rows, options.validation);
  const init0 = initLayers([width, ...options.hidden, 1], inputs, options, random);
  const { layers } = init0;
  const sizes = [width, ...options.hidden, 1];
  const { mean, scale } = standardization(
    data.x,
    train.map(i => i * width),
    width,
    init0.start,
  );
  const ws = workspace(sizes);
  const grads = zerosLike(layers);
  const out = sizes.length - 1;

  const forward = (row: number) => {
    const a0 = ws.acts[0]!;
    for (let j = 0; j < width; j++) a0[j] = (data.x[row * width + j]! - mean[j]) / scale[j];
    return forwardPass(layers, ws.acts, true);
  };
  const bce = (p: number, y: number) => -(y * Math.log(p + 1e-7) + (1 - y) * Math.log(1 - p + 1e-7));
  const loss = (rows: number[]) => rows.reduce((s, i) => s + bce(forward(i), data.y[i]!), 0) / (rows.length || 1);
  const avg = train.reduce((s, i) => s + data.y[i]!, 0) / train.length;
  const baseLoss = valid.reduce((s, i) => s + bce(avg, data.y[i]!), 0) / (valid.length || 1);

  const accumulate = (row: number) => {
    const p = forward(row);
    // Sigmoid + cross-entropy: the output delta is just p - y.
    ws.deltas[out]![0] = p - data.y[row]!;
    backwardPass(layers, ws, grads);
  };
  const best = optimize(layers, train, options, random, accumulate, grads, () => loss(valid), baseLoss);
  return {
    net: { inputs, mean, scale, layers: best.layers },
    trainLoss: loss(train.slice(0, 20000)),
    validLoss: best.loss,
    baseLoss,
    epochs: best.epoch,
  };
}

/**
 * Fit a per-seat softmax network: one shared network scores each seat's features, a softmax over
 * the seats present gives win chances, and the loss is cross-entropy against `data.y`.
 */
export function trainSeatNet(data: SeatDataset, inputs: string[], options: FitOptions): FitResult {
  const random = seeded(options.seed);
  const { width } = data;
  const { train, valid } = splitRows(data.group, data.rows, options.validation);
  const sizes = [width, ...options.hidden, 1];
  const init0 = initLayers(sizes, inputs, options, random);
  const { layers } = init0;
  const offsets: number[] = [];
  for (const row of train) for (let s = 0; s < data.seats[row]!; s++) offsets.push((row * SEAT_SLOTS + s) * width);
  const { mean, scale } = standardization(data.x, offsets, width, init0.start);
  const slots = Array.from({ length: SEAT_SLOTS }, () => workspace(sizes));
  const grads = zerosLike(layers);
  const out = sizes.length - 1;
  const p = new Float64Array(SEAT_SLOTS);

  // Fills p with the softmax over the row's present seats; leaves each seat's activations in slots.
  const forward = (row: number) => {
    const n = data.seats[row]!;
    let top = -Infinity;
    for (let s = 0; s < n; s++) {
      const a0 = slots[s]!.acts[0]!;
      const base = (row * SEAT_SLOTS + s) * width;
      for (let j = 0; j < width; j++) a0[j] = (data.x[base + j]! - mean[j]) / scale[j];
      p[s] = forwardPass(layers, slots[s]!.acts, false);
      if (p[s]! > top) top = p[s]!;
    }
    let total = 0;
    for (let s = 0; s < n; s++) total += p[s] = Math.exp(p[s]! - top);
    for (let s = 0; s < n; s++) p[s]! /= total;
    return n;
  };
  const rowLoss = (row: number) => {
    const n = forward(row);
    let sum = 0;
    for (let s = 0; s < n; s++) sum -= data.y[row * SEAT_SLOTS + s]! * Math.log(p[s]! + 1e-7);
    return sum;
  };
  const loss = (rows: number[]) => rows.reduce((sum, i) => sum + rowLoss(i), 0) / (rows.length || 1);
  let baseSum = 0;
  for (const row of valid) {
    const n = data.seats[row]!;
    for (let s = 0; s < n; s++) baseSum -= data.y[row * SEAT_SLOTS + s]! * Math.log(1 / n);
  }
  const baseLoss = baseSum / (valid.length || 1);

  const accumulate = (row: number) => {
    const n = forward(row);
    for (let s = 0; s < n; s++) {
      // Softmax + cross-entropy: the logit delta is p - y.
      slots[s]!.deltas[out]![0] = p[s]! - data.y[row * SEAT_SLOTS + s]!;
      backwardPass(layers, slots[s]!, grads);
    }
  };
  const best = optimize(layers, train, options, random, accumulate, grads, () => loss(valid), baseLoss);
  return {
    net: { inputs, mean, scale, layers: best.layers },
    trainLoss: loss(train.slice(0, 20000)),
    validLoss: best.loss,
    baseLoss,
    epochs: best.epoch,
  };
}
