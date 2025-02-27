// Copyright Takamitsu Endo (ryukau@gmail.com)
// SPDX-License-Identifier: Apache-2.0

import {selectCzOscillator} from "../common/dsp/czoscillator.js";
import {lerp, shuffleArray} from "../common/util.js";
import {PcgRandom} from "../lib/pcgrandom/pcgrandom.js";

import * as menuitems from "./menuitems.js";

// Fast Walsh Hadamard transform ported from `sympy.discrete.transforms.fwht`.
// `seq.length` must equal to 2^n.
function fwht(seq, inverse = true) {
  const n = seq.length;
  for (let h = 2; h <= n; h *= 2) {
    const hf = Math.floor(h / 2);
    for (let i = 0; i < n; i += h) {
      for (let j = 0; j < hf; ++j) {
        const u = seq[i + j];
        const v = seq[i + j + hf];
        seq[i + j] = u + v;
        seq[i + j + hf] = u - v;
      }
    }
  }
  if (inverse) {
    for (let i = 0; i < seq.length; ++i) seq[i] /= n;
  }
  return seq;
}

// No scaling on forward transform. As same as typical FFT convention.
function haarTransformForward(x) {
  let y = new Array(x.length).fill(0);
  for (let v of x) y[0] += v;

  let size = x.length;
  let half = size / 2;
  let start = 0;
  for (let row = 1; row < x.length; ++row) {
    for (let idx = 0; idx < size; ++idx) {
      const w = x[start + idx];
      y[row] += idx < half ? w : -w;
    }

    start += size;
    if (start >= x.length) {
      start = 0;
      size /= 2;
      half /= 2;
    }
  }
  return y;
}

function haarTransformBackward(x) {
  let scaler = 1 / x.length;

  let y = new Array(x.length).fill(scaler * x[0]);

  let size = x.length;
  let half = size / 2;
  let start = 0;
  for (let row = 1; row < x.length; ++row) {
    for (let idx = 0; idx < size; ++idx) {
      const w = scaler * x[row];
      y[start + idx] += idx < half ? w : -w;
    }

    start += size;
    if (start >= x.length) {
      start = 0;
      size /= 2;
      half /= 2;
      scaler *= 2;
    }
  }
  return y;
}

function bitReversal(n, k) {
  let r = 0;
  for (let i = 0; i < k; ++i) r |= ((n >> i) & 1) << (k - i - 1);
  return r;
}

function binaryToGrayCode(n) { return n ^ (n >> 1); }

function grayCodeToBinary(n) {
  let mask = n;
  while (mask) {
    mask >>= 1;
    n ^= mask;
  }
  return n;
}

function renderWavetable(
  dsp, samplesPerCycle, waveformType, phaseOffset, oscMod, fmIndex) {
  const oscFunc = selectCzOscillator(waveformType);
  let table = new Array(samplesPerCycle).fill(0);
  let sum = 0;
  for (let i = 0; i < table.length; ++i) {
    let phase = i / table.length + phaseOffset;
    phase -= Math.floor(phase);
    phase += fmIndex * oscFunc(phase, oscMod);
    phase -= Math.floor(phase);

    table[i] = oscFunc(phase, oscMod);

    sum += table[i];
  }
  sum /= table.length;
  for (let i = 0; i < table.length; ++i) table[i] -= sum;
  return dsp.transformForward(table);
}

function getTransformFunctionPair(transformTypeIndex) {
  const transformType = menuitems.transformTypeItems[transformTypeIndex];
  if (transformType === "Haar") return [haarTransformForward, haarTransformBackward];
  return [x => fwht(x, false), x => fwht(x, true)];
}

onmessage = async (event) => {
  const pv = event.data; // Parameter values.

  const useStereoEffect = pv.channel % 2 == 1;
  const samplesPerCycle = Math.floor(2 ** pv.samplesPerCycleLog2);

  let dsp = {};
  dsp.rng = new PcgRandom(BigInt(pv.seed + pv.channel * 17));

  [dsp.transformForward, dsp.transformBackward]
    = getTransformFunctionPair(pv.transformType);

  if (useStereoEffect && pv.stereoSwapWaveform) {
    [pv.firstWaveform, pv.lastWaveform] = [pv.lastWaveform, pv.firstWaveform];
    [pv.firstPhaseOffset, pv.lastPhaseOffset] = [pv.lastPhaseOffset, pv.firstPhaseOffset];
    [pv.firstOscMod, pv.lastOscMod] = [pv.lastOscMod, pv.firstOscMod];
    [pv.firstFmIndex, pv.lastFmIndex] = [pv.lastFmIndex, pv.firstFmIndex];
  }
  dsp.source = renderWavetable(
    dsp, samplesPerCycle, pv.firstWaveform, pv.firstPhaseOffset, pv.firstOscMod,
    pv.firstFmIndex);
  dsp.target = renderWavetable(
    dsp, samplesPerCycle, pv.lastWaveform, pv.lastPhaseOffset, pv.lastOscMod,
    pv.lastFmIndex);
  dsp.buffer = new Array(samplesPerCycle).fill(0);

  // Prepare frequency indices. Do nothing on `indexingType === "Natural"`. "Natural" is
  // the default ordering of `fwht`.
  dsp.indices = new Array(samplesPerCycle).fill(0).map((_, i) => i);
  const indexingType = menuitems.indexingTypeItems[pv.indexingType];
  if (indexingType === "Sequency") {
    for (let i = 0; i < dsp.indices.length; ++i) {
      dsp.indices[i]
        = grayCodeToBinary(bitReversal(dsp.indices[i], pv.samplesPerCycleLog2));
    }
  } else if (indexingType === "Dyadic") {
    for (let i = 0; i < dsp.indices.length; ++i) {
      dsp.indices[i] = bitReversal(dsp.indices[i], pv.samplesPerCycleLog2);
    }
  } else if (indexingType === "Random") {
    shuffleArray(dsp.rng, dsp.indices);
  }
  if (indexingType.includes("Reversed")) dsp.indices.reverse();

  if (useStereoEffect && pv.stereoReverseIndexing) dsp.indices.reverse();

  let sound = new Array(Math.floor(samplesPerCycle * pv.nCycle)).fill(0);
  const getBound = (cycle) => {
    const ratio = cycle / (pv.nCycle - 1);
    const linCurve = samplesPerCycle * ratio;
    let logCurve
      = Math.min(Math.ceil(2 ** (pv.samplesPerCycleLog2 * ratio)), samplesPerCycle);
    return Math.round(lerp(linCurve, logCurve, pv.morphingCurve));
  };
  for (let cycle = 0; cycle < pv.nCycle; ++cycle) {
    if (cycle >= 1) {
      const end = getBound(cycle);
      for (let i = getBound(cycle - 1); i < end; ++i) {
        const index = dsp.indices[i];
        dsp.source[index] = dsp.target[index];
      }
    }

    dsp.buffer = dsp.source.slice(0);
    dsp.buffer = dsp.transformBackward(dsp.buffer);

    const jdx = samplesPerCycle * cycle;
    for (let i = 0; i < samplesPerCycle; ++i) sound[jdx + i] = dsp.buffer[i];

    if (pv.normalizeSection) {
      let max = 0;
      for (let i = 0; i < samplesPerCycle; ++i) {
        max = Math.max(max, Math.abs(sound[jdx + i]));
      }
      if (max != 0) {
        for (let i = 0; i < samplesPerCycle; ++i) sound[jdx + i] /= max;
      }
    }
  }

  postMessage({sound: sound});
}
