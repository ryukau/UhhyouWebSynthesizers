// Copyright Takamitsu Endo (ryukau@gmail.com)
// SPDX-License-Identifier: Apache-2.0

import {clamp, exponentialMap, lerp, uniformFloatMap} from "../common/util.js";
import {PcgRandom} from "../lib/pcgrandom/pcgrandom.js";
import PocketFFT from "../lib/pocketfft/pocketfft.js";

import * as menuitems from "./menuitems.js";

// import {PcgRandom} from "../lib/pcgrandom/pcgrandom.js";

function signedPower(x, y) {
  const sign = x >= 0 ? 1 : -1;
  return sign * Math.pow(Math.abs(x), y);
}

function alignToOdd(x) {
  x = Math.floor(x);
  return x + x % 2;
}

// Linear regression. `x` and `y` are arrays of the same length.
function linregress(x, y) {
  if (x.length !== y.length) {
    console.warn("Size mismatch between x and y.", new Error());
    return 0;
  }

  const sumX = x.reduce((p, c) => p + c);
  const sumY = y.reduce((p, c) => p + c);
  const dotXX = x.reduce((p, c) => p + c * c);
  const dotXY = x.reduce((p, c, i) => p + c * y[i]);
  const N = x.length;

  const slope = (N * dotXY - sumX * sumY) / (N * dotXX - sumX * sumX);
  // const intercept = (sumY - slope * sumX) / N;

  return slope;
}

// `phase` is in [0, 1).
function generateWave(phase, waveform) {
  if (waveform < 1) {
    // Sin-Tri
    const sin = Math.sin(Math.PI * phase);
    const tri = 2 * phase - 1;
    return lerp(sin, tri, waveform);
  } else if (waveform < 2) {
    // Tri-Pulse
    const frac = waveform - Math.floor(waveform);
    const tri = 2 * phase - 1;
    const pulse = phase < 0.5 ? 1.0 : -1.0;
    return lerp(tri, pulse, frac);
  } else if (waveform < 3) {
    // Pulse.
    const frac = waveform - Math.floor(waveform);
    const duty = 0.5 * (1.0 - frac);
    return phase < duty ? 1.0 : -1.0;
  }
  return phase == 0 ? 1.0 : -1.0;
}

function expInterp(x0, x1, t) {
  const logX0 = Math.log(x0);
  return Math.exp(logX0 + t * (Math.log(x1) - logX0));
};

function generateTable(renderSamples, tableIndex, freqIdx, pv, wf, rng, fft) {
  let sound = new Array(renderSamples).fill(0);

  const interpRatio = pv.nWaveform > 1 ? tableIndex / (pv.nWaveform - 1) : 1;

  const waveform = wf.waveform.randomize(rng, interpRatio);
  const powerOf = wf.powerOf.randomize(rng, interpRatio);
  const skew = wf.skew.randomize(rng, interpRatio);
  const sineShaper = wf.sineShaper.randomize(rng, interpRatio);
  const sineRatio = wf.sineRatio.randomize(rng, interpRatio);
  const hardSync = wf.hardSync.randomize(rng, interpRatio);
  const mirrorRange = wf.mirrorRange.randomize(rng, interpRatio);
  const mirrorRepeat = wf.mirrorRepeat.randomize(rng, interpRatio);
  const flip = wf.flip.randomize(rng, interpRatio);

  const spectralSpread = wf.spectralSpread.randomize(rng, interpRatio);
  const phaseSlope = wf.phaseSlope.randomize(rng, interpRatio);

  const highpass = wf.highpass.randomize(rng, interpRatio);
  const lowpass = wf.lowpass.randomize(rng, interpRatio);
  const notchStart = wf.notchStart.randomize(rng, interpRatio);
  const notchRange = wf.notchRange.randomize(rng, interpRatio);
  const lowshelfEnd = wf.lowshelfEnd.randomize(rng, interpRatio);
  const lowshelfGain = wf.lowshelfGain.randomize(rng, interpRatio);

  // Base waveform.
  const mid = Math.floor(sound.length * (1 - mirrorRange / 2));
  let idx = 0;
  let maxAmp = 1;
  for (; idx < mid; ++idx) {
    let phase = hardSync * idx / mid;
    phase = Math.pow(phase, skew);

    let sinePhase = 2 * Math.sin(Math.PI * phase * sineRatio);

    let sig = generateWave(phase + lerp(0, sinePhase, sineShaper), waveform);
    sig = signedPower(sig, powerOf);

    sound[idx] += Number.isFinite(sig) ? sig : 0;

    const absed = Math.abs(sound[idx]);
    if (maxAmp < absed) maxAmp = absed;
  }
  for (let i = 0; i < sound.length; ++i) sound[i] /= maxAmp;
  for (; idx < sound.length; ++idx) {
    const mirror = sound[sound.length - 1 - idx];
    const repeat = sound[idx - mid];
    sound[idx] = flip * lerp(mirror, repeat, mirrorRepeat);
  }

  // Spectral processing. See `lib/pocketfft/build/test.html` for `fft` usage.
  let inVec = new fft.vector_f64();
  inVec.resize(sound.length, 0);
  for (let i = 0; i < sound.length; ++i) inVec.set(i, sound[i]);

  let inSpc = fft.r2c(inVec);
  inVec.delete();

  let powerSpc = new Array(inSpc.size()).fill(0);
  let outSpc = new fft.vector_complex128();
  outSpc.resize(inSpc.size());

  const lengthWithoutDC = inSpc.size() - 1;
  const start = Math.floor(highpass * lengthWithoutDC);
  const end = Math.floor(lowpass * lengthWithoutDC);
  const notchStartIndex = Math.floor(notchStart * lengthWithoutDC);

  for (let i = 0; i < outSpc.size(); ++i) outSpc.setValue(i, 0, 0);

  for (let idx = start; idx < end; ++idx) {
    if (idx == notchStartIndex) idx += Math.floor(notchRange * lengthWithoutDC);

    const target = spectralSpread * idx + 1;
    const index = Math.floor(target);
    if (index >= inSpc.size()) break;
    const frac = target - index;

    const gain = Math.abs(1 - 2 * frac);

    const reIn = inSpc.getReal(index);
    const imIn = inSpc.getImag(index);

    const len = Math.sqrt(reIn * reIn + imIn * imIn);
    const arg = Math.atan2(imIn, reIn);

    const reVal = len * Math.cos(arg + phaseSlope * len);
    const imVal = len * Math.sin(arg + phaseSlope * len);

    powerSpc[idx] = gain * Math.sqrt(reVal * reVal + imVal * imVal);
    outSpc.setValue(idx + 1, gain * reVal, gain * imVal);
  }
  const lowshelfEndIndex = Math.floor(lowshelfEnd * lengthWithoutDC);
  for (let idx = 1; idx < lowshelfEndIndex + 1; ++idx) {
    outSpc.setValue(
      idx, lowshelfGain * outSpc.getReal(idx), lowshelfGain * outSpc.getImag(idx));
  }
  inSpc.delete();

  let outVec = fft.c2r(outSpc);
  outSpc.delete();

  for (let i = 0; i < outVec.size(); ++i) sound[i] = outVec.get(i);
  outVec.delete();

  // Normalize amplitude.
  const maxSample = sound.reduce((p, c) => Math.max(p, Math.abs(c)), 0);
  if (maxSample > Number.EPSILON) {
    for (let idx = 0; idx < sound.length; ++idx) sound[idx] /= maxSample;
  }

  return {data: sound, slope: -linregress(freqIdx, powerSpc) / maxSample};
}

class ParamLin {
  constructor(base, defaultValue, lower, upper, range, startFromDefault) {
    this.base = base;
    this.defaultValue = defaultValue;
    this.lower = lower;
    this.upper = upper;
    this.range = range;
    this.startFromDefault = startFromDefault; // boolean, unlike ParamExp.
  }

  randomize(rng, interpRatio) {
    let bs = this.base;
    if (this.startFromDefault) bs = lerp(this.defaultValue, bs, interpRatio);

    const random = uniformFloatMap(rng.number(), -this.range, this.range);
    return clamp(bs + random, this.lower, this.upper);
  }
}

class ParamExp {
  constructor(base, defaultValue, lower, upper, range, startFromDefault) {
    this.base = base;
    this.defaultValue = defaultValue;
    this.lower = lower;
    this.upper = upper;
    this.range = range;
    this.startFromDefault = startFromDefault; // 0: off, 1: linear, 2: exponential.

    // Disable exponential automation scaling when the result may become NaN.
    if (this.startFromDefault === 2 && base === 0 && defaultValue === 0) {
      this.startFromDefault = 0;
    }
  }

  randomize(rng, interpRatio) {
    let bs = this.base;
    if (this.startFromDefault === 1) {
      bs = lerp(this.defaultValue, bs, interpRatio);
    } else if (this.startFromDefault === 2) {
      bs = expInterp(
        Math.max(this.defaultValue, this.lower), Math.max(bs, this.lower), interpRatio);
    }
    const logRange = this.range * Math.log(this.upper / this.lower);
    const low = Math.max(this.lower, bs * Math.exp(-logRange));
    const high = Math.min(this.upper, bs * Math.exp(logRange));
    return exponentialMap(rng.number(), low, high);
  }
}

function prepareWaveformParameter(pv) {
  const rnd = pv.randomAmount;
  const readMenu = (item) => {
    const sfd = pv.startFromDefault[menuitems.startFromDefaultItems.indexOf(item)];
    return sfd ? pv.automationScaling : 0;
  };
  return {
    waveform: new ParamLin(pv.waveform, 0, 0, 3, rnd, readMenu("Sine-Saw-Pulse")),
    powerOf: new ParamExp(pv.powerOf, 1, 0.01, 100, rnd, readMenu("Power")),
    skew: new ParamExp(pv.skew, 1, 0.01, 100, rnd, readMenu("Skew")),
    sineShaper: new ParamLin(pv.sineShaper, 0, 0, 1, rnd, readMenu("Sine Shaper")),
    sineRatio: new ParamExp(pv.sineRatio, 1, 1, 1024, rnd, readMenu("Sine Ratio")),
    hardSync: new ParamExp(pv.hardSync, 1, 0.1, 10, rnd, readMenu("Hard Sync.")),
    mirrorRange: new ParamLin(pv.mirrorRange, 1, 0, 1, rnd, readMenu("Mirror Range")),
    mirrorRepeat: new ParamLin(pv.mirrorRepeat, 0, 0, 1, rnd, readMenu("Mirror/Repeat")),
    flip: new ParamLin(pv.flip, -1, -1, 1, rnd, readMenu("Flip")),

    spectralSpread:
      new ParamExp(pv.spectralSpread, 1, 0.01, 100, rnd, readMenu("Spectral Spread")),
    phaseSlope: new ParamExp(pv.phaseSlope, 0, 0.001, 1000, rnd, readMenu("Phase Slope")),

    highpass: new ParamExp(pv.highpass, 0, 0.001, 1, rnd, readMenu("Highpass")),
    lowpass: new ParamExp(pv.lowpass, 1, 0.001, 1, rnd, readMenu("Lowpass")),
    notchStart: new ParamExp(pv.notchStart, 1, 0.001, 1, rnd, readMenu("Notch Start")),
    notchRange: new ParamExp(pv.notchRange, 0.01, 0.001, 1, rnd, readMenu("Notch Range")),
    lowshelfEnd: new ParamExp(pv.lowshelfEnd, 0, 0.001, 1, rnd, readMenu("Lowshelf End")),
    lowshelfGain:
      new ParamExp(pv.lowshelfGain, 1, 0.01, 100, rnd, readMenu("Lowshelf Gain")),
  };
}

onmessage = async (event) => {
  const pv = event.data; // Parameter values.
  const fft = await PocketFFT();
  const rng = new PcgRandom(BigInt(pv.seed));
  const renderSamples = alignToOdd(pv.renderSamples);

  const spcLength = Math.floor(renderSamples / 2 + 1);
  const freqIdx = new Array(spcLength).fill(0).map((_, i) => i);

  const wf = prepareWaveformParameter(pv); // WaveForm.

  let tables = [];
  for (let i = 0; i < pv.nWaveform; ++i) {
    tables.push(generateTable(renderSamples, i, freqIdx, pv, wf, rng, fft));
  }
  if (pv.automationScaling === menuitems.automationScalingItems.indexOf("Off")) {
    tables.sort((a, b) => a.slope < b.slope ? -1 : a.slope > b.slope ? 1 : 0);
  }

  if (pv.reduceGlitch !== 0) {
    // Rotate each wavetable to minimize discontinuity.
    for (let idx = 1; idx < tables.length; ++idx) {
      const targetAmp = tables[idx - 1].data.at(-1);
      const targetSlope = targetAmp - tables[idx - 1].data.at(-2);

      const tbl = tables[idx].data;
      let previousError = Number.MAX_VALUE;
      let anchor = 0;
      for (let jdx = 0; jdx < tbl.length; ++jdx) {
        const amp = tbl[jdx];
        const slope = amp - tbl.at(jdx - 1);
        if (slope * targetSlope < 0) continue;

        const ampDist = amp - targetAmp;
        const slopeDist = slope - targetSlope;

        // `currentError` is arbitrary tuned.
        const currentError = ampDist * ampDist + Math.sqrt(slopeDist * slopeDist);
        if (currentError < previousError) {
          previousError = currentError;
          anchor = jdx;
        }
      }
      tables[idx].data = tbl.slice(anchor, tbl.length).concat(tbl.slice(0, anchor));
    }
  }

  let sound = tables.flatMap(v => v.data);
  postMessage({sound: sound});
}
