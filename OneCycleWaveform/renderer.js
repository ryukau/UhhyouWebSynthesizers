// Copyright 2022 Takamitsu Endo
// SPDX-License-Identifier: Apache-2.0

import * as util from "../common/util.js";
import PocketFFT from "../lib/pocketfft/pocketfft.js";

// import {PcgRandom} from "../lib/pcgrandom/pcgrandom.js";

function signedPower(x, y) {
  const sign = x >= 0 ? 1 : -1;
  return sign * Math.pow(Math.abs(x), y);
}

function alignToOdd(x) {
  x = Math.floor(x);
  return x + x % 2;
}

// `phase` is in [0, 1).
function generateWave(phase, waveform) {
  if (waveform < 1) {
    // Sin-Tri
    const sin = Math.sin(Math.PI * phase);
    const tri = 2 * phase - 1;
    return util.lerp(sin, tri, waveform);
  } else if (waveform < 2) {
    // Tri-Pulse
    const frac = waveform - Math.floor(waveform);
    const tri = 2 * phase - 1;
    const pulse = phase < 0.5 ? 1.0 : -1.0;
    return util.lerp(tri, pulse, frac);
  } else if (waveform < 3) {
    // Pulse.
    const frac = waveform - Math.floor(waveform);
    const duty = 0.5 * (1.0 - frac);
    return phase < duty ? 1.0 : -1.0;
  }
  return phase == 0 ? 1.0 : -1.0;
}

onmessage = async (event) => {
  const pv = event.data; // Parameter values.

  let sound = new Array(alignToOdd(pv.renderSamples)).fill(0);

  // const rng = new PcgRandom(BigInt(pv.seed));

  let dsp = {};

  // Base waveform.
  const mid = Math.floor(sound.length * (1 - pv.mirrorRange / 2));
  let idx = 0;
  for (; idx < mid; ++idx) {
    let phase = pv.hardSync * idx / mid;
    phase = Math.pow(phase, pv.skew);

    let sinePhase = 2 * Math.sin(Math.PI * phase);

    let sig = generateWave(phase + util.lerp(0, sinePhase, pv.sineShaper), pv.waveform);

    sig = signedPower(sig, pv.powerOf);

    sound[idx] += sig;
  }
  for (; idx < sound.length; ++idx) {
    const mirror = sound[sound.length - 1 - idx];
    const repeat = sound[idx - mid];
    sound[idx] = pv.flip * util.lerp(mirror, repeat, pv.mirrorRepeat);
  }

  // Spectral processing. See `lib/pocketfft/build/test.html` for `fft` usage.
  const fft = await PocketFFT();

  let inVec = new fft.vector_f64();
  inVec.resize(sound.length, 0);
  for (let i = 0; i < sound.length; ++i) inVec.set(i, sound[i]);

  let inSpc = fft.r2c(inVec);
  inVec.delete();

  let outSpc = new fft.vector_complex128();
  outSpc.resize(inSpc.size());

  const lengthWithoutDC = inSpc.size() - 1;
  const start = Math.floor(pv.highpass * lengthWithoutDC);
  const end = Math.floor(pv.lowpass * lengthWithoutDC);
  const notchStart = Math.floor(pv.notchStart * lengthWithoutDC);

  for (let i = 0; i < outSpc.size(); ++i) outSpc.setValue(i, 0, 0);

  for (let idx = start; idx < end; ++idx) {
    if (idx == notchStart) idx += Math.floor(pv.notchRange * lengthWithoutDC);

    const target = pv.spectralSpread * idx + 1;
    const index = Math.floor(target);
    if (index >= inSpc.size()) break;
    const frac = target - index;

    const gain = Math.abs(1 - 2 * frac);

    const reIn = inSpc.getReal(index);
    const imIn = inSpc.getImag(index);

    const len = Math.sqrt(reIn * reIn + imIn * imIn);
    const arg = Math.atan2(imIn, reIn);

    const reVal = len * Math.cos(arg + pv.phaseSlope * len);
    const imVal = len * Math.sin(arg + pv.phaseSlope * len);

    outSpc.setValue(idx + 1, gain * reVal, gain * imVal);
  }
  const lowshelfEnd = Math.floor(pv.lowshelfEnd * lengthWithoutDC);
  for (let idx = 1; idx < lowshelfEnd + 1; ++idx) {
    outSpc.setValue(
      idx, pv.lowshelfGain * outSpc.getReal(idx), pv.lowshelfGain * outSpc.getImag(idx));
  }
  inSpc.delete();

  let outVec = fft.c2r(outSpc);
  outSpc.delete();

  for (let i = 0; i < outVec.size(); ++i) sound[i] = outVec.get(i);
  outVec.delete();

  postMessage(sound);
}
