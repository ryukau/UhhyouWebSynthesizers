// Copyright Takamitsu Endo (ryukau@gmail.com)
// SPDX-License-Identifier: Apache-2.0

import * as adaa from "../common/dsp/adaa/adaa.js";
import {CubicDelay, IntDelay, LongAllpass, MultiTapDelay} from "../common/dsp/delay.js";
import {SurgeEnvelope} from "../common/dsp/envelope.js";
import {downSampleIIR} from "../common/dsp/multirate.js";
import {AP1TPT, HP1, LP1} from "../common/dsp/onepole.js";
import {EMAFilter} from "../common/dsp/smoother.js";
import {SerialSosEqualizer} from "../common/dsp/sos.js";
import {
  SVFHP,
  SvfNormalizedBandpass,
  SvfNormalizedHighpass,
  SvfNormalizedLowpass,
  SvfNormalizedNotch,
} from "../common/dsp/svf.js";
import {clamp, lerp} from "../common/util.js";
import {PcgRandom} from "../lib/pcgrandom/pcgrandom.js";
import createSpecialMath from "../lib/specialmath/specialmath.js";

import * as menuitems from "./menuitems.js";

// Calculates continuous L2 energy of SurgeEnvelope. Depending on `lib/specialmath`.
//
// @param {SurgeEnvelope} env - Configured SurgeEnvelope instance
// @param {object} specialMath - Instantiated Emscripten WASM module
// @returns {number} The calculated energy integral from 0 to totalLengthSamples
export function calculateSurgeEnergyWasm(env, specialMath) {
  const a = env.a;
  const b = env.b;
  const c = env.c;
  const T = env.totalLengthSamples;

  const s = 2.0 * a + 1.0;
  const x = 2.0 * b * T;

  const P = specialMath.gamma_p(s, x);
  if (P <= 0.0 || !Number.isFinite(P)) { return 0.0; }

  const logEnergy = 2.0 * c - s * Math.log(2.0 * b) + specialMath.lgamma(s) + Math.log(P);
  return Math.exp(logEnergy);
}

// Normalizes the SurgeEnvelope's energy in-place to targetEnergy.
//
// Directly updates `env.c`, giving zero per-sample CPU overhead during processing.
//
// @param {SurgeEnvelope} env - The SurgeEnvelope instance
// @param {object} specialMath - Instantiated Emscripten WASM module
// @param {number} [targetEnergy=1.0] - Desired total energy (default: 1.0 for unit energy)
// @returns {number} The applied linear gain factor g
export function normalizeSurgeEnergy(env, specialMath, targetEnergy = 1.0) {
  const currentEnergy = calculateSurgeEnergyWasm(env, specialMath);
  if (currentEnergy <= 0.0 || !Number.isFinite(currentEnergy)) { return 1.0; }

  const gain = Math.sqrt(targetEnergy / currentEnergy);

  // Shifting `c` by ln(gain) scales calcEnvelope(t) by `gain` for all t
  env.c += Math.log(gain);
  env.reset();

  return gain;
}

function dampedLinear(x, p, a) { return x <= p ? x : p + (x - p) / (1 + Math.log1p((x - p) / a)); }

// Cache WASM module initialization across worker invocations
let specialMathPromise = null;
function getSpecialMath() {
  if (!specialMathPromise) {
    specialMathPromise = createSpecialMath().catch((err) => {
      console.warn("Failed to load specialMath WASM module:", err);
      return null;
    });
  }
  return specialMathPromise;
}

// 2nd order critically damped lowpass.
class SoftDecay {
  constructor(amount, decaySeconds, sampleRate) {
    this.set(amount, decaySeconds, sampleRate);
    this.reset();
  }

  set(amount, decaySeconds, sampleRate) {
    this.amount = amount;
    const tauSamples = Math.max(1, decaySeconds * sampleRate);
    this.p = Math.exp(-1.0 / tauSamples);
    this.invTau = 1.0 / tauSamples;
  }

  reset() {
    this.eState = 1.0;
    this.yState = 0.0;
  }

  process() {
    if (this.amount === 0) { return 0.0; }
    const out = this.amount * (this.eState + this.invTau * this.yState);
    this.yState = this.p * (this.yState + this.eState);
    this.eState = this.p * this.eState;
    return out;
  }
}

class SerialAllpass {
  constructor(gain, delaySamples, feedback, sampleRate, buzzerEq = {}) {
    this.allpass = new Array(delaySamples.length);
    for (let idx = 0; idx < delaySamples.length; ++idx) {
      this.allpass[idx] = new LongAllpass(delaySamples[idx], CubicDelay);
      this.allpass[idx].prepare(delaySamples[idx], gain);
    }

    this.gain = feedback / delaySamples.length;
    this.inputGain = 1.0 - Math.abs(this.gain);
    this.norm = 1.0 / (1.0 + delaySamples.length);
    this.buffer = 0;

    this.filter = new SerialSosEqualizer(sampleRate, buzzerEq);
  }

  process(input) {
    const v = this.filter.process(input * this.inputGain + this.buffer);
    let sum = v;
    let apOut = v;
    for (let idx = 0; idx < this.allpass.length; ++idx) {
      apOut = this.allpass[idx].process(apOut);
      sum += apOut;
    }
    this.buffer = apOut * this.gain;
    return sum * this.norm;
  }
}

// 1st-order Thiran Allpass filter for sub-sample fractional delay tuning.
// H(z) = (a + z^-1) / (1 + a * z^-1), where a = (1 - d) / (1 + d).
class FractionalAllpass {
  #a = 0.0;
  #x1 = 0.0;
  #y1 = 0.0;

  constructor(delaySamples = 0.0) { this.setDelay(delaySamples); }

  reset() {
    this.#x1 = 0.0;
    this.#y1 = 0.0;
  }

  setDelay(d) {
    const clamped = clamp(d, 0.0, 1.0);
    this.#a = (1.0 - clamped) / (1.0 + clamped + 1e-9);
  }

  process(x0) {
    const y0 = this.#a * (x0 - this.#y1) + this.#x1;
    this.#x1 = x0;
    this.#y1 = y0;
    return y0;
  }
}

// Bidirectional Digital Waveguide Segment connecting two spatial nodes.
class WaveguideSegment {
  #delayP;
  #delayM;
  #nominalDelay;
  #internalDelay;

  constructor(delaySamples, isInteger = false) {
    this.#nominalDelay = delaySamples;
    const maxDelay = Math.max(Math.ceil(delaySamples * 2), 4);
    const DelayClass = isInteger ? IntDelay : CubicDelay;
    this.#delayP = new DelayClass(maxDelay);
    this.#delayM = new DelayClass(maxDelay);
    this.setTime(delaySamples);
  }

  get delay() { return this.#nominalDelay; }

  reset() {
    this.#delayP.reset();
    this.#delayM.reset();
  }

  setTime(timeInSample) {
    this.#nominalDelay = timeInSample;
    const internal = Math.max(0.0, timeInSample - 1.0);
    this.#internalDelay = internal;
    const t = Math.max(1.0, internal);
    this.#delayP.setTime(t);
    this.#delayM.setTime(t);
  }

  process(inP, inM) {
    const d = this.#internalDelay;
    if (d <= 0.0) {
      this.#delayP.process(inP);
      this.#delayM.process(inM);
      return [inP, inM];
    }
    if (d < 1.0) {
      const outP = this.#delayP.process(inP);
      const outM = this.#delayM.process(inM);
      return [inP + d * (outP - inP), inM + d * (outM - inM)];
    }
    return [this.#delayP.process(inP), this.#delayM.process(inM)];
  }
}

class PointMicSummation {
  #numNodes;
  #weights;

  constructor(nodes, L_samples, pv) {
    this.#numNodes = nodes.length;
    const N = this.#numNodes;

    const L_meters = 0.864; // Standard 34-inch bass scale length
    const pickupPosRatio = clamp(pv.pickupPosition, 0.0, 1.0);
    const x_mic = pickupPosRatio * L_meters;
    const d_perp = Math.max(pv.pickupDistance, 0.001); // Perpendicular distance in meters

    this.#weights = new Float64Array(N);

    const X = new Float64Array(N);
    const dX = new Float64Array(N);
    for (let k = 0; k < N; ++k) { X[k] = (nodes[k].pos / L_samples) * L_meters; }

    for (let k = 0; k < N; ++k) {
      const prev = k === 0 ? X[0] : X[k - 1];
      const next = k === N - 1 ? X[N - 1] : X[k + 1];
      dX[k] = Math.max(0.5 * (next - prev), 1e-6);
    }

    let sumWeights = 0.0;
    for (let k = 0; k < N; ++k) {
      const dx = X[k] - x_mic;
      const r2 = dx * dx + d_perp * d_perp;
      const r3 = r2 * Math.sqrt(r2);
      const w = (d_perp * dX[k]) / r3;
      this.#weights[k] = w;
      sumWeights += w;
    }

    const invSum = sumWeights > 1e-12 ? 1.0 / sumWeights : 1.0 / N;
    for (let k = 0; k < N; ++k) { this.#weights[k] *= invSum; }
  }

  process(nodeInP, nodeInM) {
    let out = 0.0;
    for (let k = 0; k < this.#numNodes; ++k) {
      out += this.#weights[k] * (nodeInP[k] + nodeInM[k]);
    }
    return out;
  }
}

class FeedbackPhaser {
  constructor(pv, sampleRate) {
    this.allpass = Array.from({length: pv.phaserStage}, () => new AP1TPT());
    this.fbMix = Math.abs(pv.phaserMix);
    this.inMixSign = pv.phaserMix >= 0 ? 1.0 : -1.0;
    this.fbGain = pv.phaserFeedback;
    this.fbClip = 1.0;
    this.outGain = 1.0;

    this.feedbackHighpass = new SVFHP(5.0 / sampleRate, Math.SQRT1_2);
    this.outputHighpass = new SVFHP(5.0 / sampleRate, Math.SQRT1_2);

    this.apCenterCut = pv.phaserAllpassCenterHz / sampleRate;
    this.apSpread = pv.phaserAllpassSpread;
    this.modAmt = pv.phaserModAmount;

    this.modLowpass = new EMAFilter();
    if (pv.phaserModLowpassHz >= 100000) {
      this.modLowpass.alpha = 1.0;
    } else {
      this.modLowpass.setCutoff(pv.phaserModLowpassHz / sampleRate);
    }

    this.reset();
  }

  reset() {
    this.feedbackBuffer = 0.0;
    this.feedbackHighpass.reset();
    this.outputHighpass.reset();
    this.modLowpass.reset();
    for (const ap of this.allpass) ap.reset();
  }

  process(input, modulation) {
    const clipAmp = 256.0;
    const apMod = clamp(this.modAmt * modulation, -clipAmp, clipAmp);
    let apCut = Math.min(2 ** apMod * this.apCenterCut, 1.0 - 1.1920928955078125e-7);
    apCut = this.modLowpass.process(apCut);

    let sig = input + this.fbGain * this.feedbackBuffer;

    for (let idx = 0; idx < this.allpass.length; ++idx) {
      const multiplier = 1.0 + idx * this.apSpread;
      sig = this.allpass[idx].processMod(sig, apCut * multiplier);
    }

    const apOut = sig;
    const out = lerp(this.inMixSign * input, apOut, this.fbMix);

    const fbOut = this.feedbackHighpass.process(out);
    this.feedbackBuffer = clamp(fbOut, -this.fbClip, this.fbClip);

    return this.outGain * this.outputHighpass.process(out);
  }
}

function renderTrisawPulseNaive(rampLength, shape) {
  const buffer = new Array(rampLength);
  const p = shape * rampLength;
  const q = rampLength * (1 - shape);
  for (let i = 0; i < rampLength; ++i) {
    buffer[i] = shape === 0 ? 1.0 - i / rampLength
      : shape === 1         ? i / rampLength
      : i < p               ? i / p
                            : (rampLength - i) / q;
  }
  return buffer;
}

// Triangular-sawtooth pulse generator. 2 sample latency.
//
// - `length` in samples.
// - `shape` in [0, 1]. 0: downward ramp, 0.5: triangle, 1: upward ramp.
function renderTrisawPulsePoly(length, shape) {
  if (shape < 0 || shape > 1) { throw new RangeError("Requires 0 <= shape <= 1"); }

  let signal;
  let corners;
  let m;

  if (shape === 0) {
    m = Math.ceil(length);
    const k = 1 / length;
    const mainPart = Array.from({length: m}, (_, i) => 1 - i * k);
    signal = [0.0, 0.0].concat(mainPart).concat([0.0, 0.0, 0.0]);

    signal[1] += 1 / 24;
    signal[2] -= 0.5;
    signal[3] -= 1 / 24;

    corners = [[0, -k], [length, k]];
  } else if (shape === 1) {
    m = Math.ceil(length);
    const k = 1 / length;
    const mainPart = Array.from({length: m}, (_, i) => i * k);
    signal = [0.0, 0.0].concat(mainPart).concat([0.0, 0.0, 0.0]);

    const b = m - length;
    const b2 = b * b;
    const c = 1.0 - b;
    const c2 = c * c;
    const x = 1.0 + b + b;
    const tb2 = 3.0 * b2;

    const r0 = b2 * b2;
    const r1 = (x - b2) * (x + tb2);
    const r2 = (b2 - 2.0) * (tb2 - 8.0 * b + 6.0);
    const r3 = -c2 * c2;

    const r_vals = [r0, r1, r2, r3];
    for (let i = 0; i < 4; i++) { signal[m + i] -= r_vals[i] / 24; }

    corners = [
      [0, k],
      [length, -k],
    ];
  } else {
    const p = shape * length;
    const q = length * (1 - shape);
    m = Math.ceil(length);

    signal = Array(m + 5).fill(0.0);
    for (let i = 0; i < m; i++) { signal[i + 2] = i < p ? i / p : (length - i) / q; }

    corners = [
      [0, 1 / p],
      [p, -(1 / p + 1 / q)],
      [length, 1 / q],
    ];
  }

  for (const [tc, ds] of corners) {
    const n = Math.ceil(tc);

    const d = n - tc;
    const d2 = d * d;
    const d4 = d2 * d2;
    const d5 = d4 * d;

    const v = 10.0 * d2;
    const w = 5.0 * d4 + v + 1.0;
    const x = (v + 5.0) * d;

    const r0 = d5;
    const r1 = w + x - 3.0 * d5;
    const r3 = w - x - d5;
    const r2 = 60.0 * (d2 - d) + 30.0 - r0 - r1 - r3;

    const ds_s = ds / 120;
    const shift = 0;

    const r_vals = [r0, r1, r2, r3];
    for (let idx = 0; idx < 4; idx++) { signal[n + idx + shift] += ds_s * r_vals[idx]; }
  }

  return signal;
}

function renderSurgePulse(freq, upRate, upFold, shape, specialMath) {
  const noteFrequencyNormalized = freq / upRate;
  const totalLengthSamples = 0.5 / noteFrequencyNormalized;
  const attackSamples = Math.max(1, Math.min(totalLengthSamples - 1, shape * totalLengthSamples));

  const envelope = new SurgeEnvelope(attackSamples, totalLengthSamples + 8 * upFold);

  if (specialMath) {
    const energy = Math.ceil(upRate / freq) / 3.0; // Energy of tri-saw at shape=0.5.
    normalizeSurgeEnergy(envelope, specialMath, energy);
  }

  const envLength = 2 * Math.ceil(totalLengthSamples);
  const buffer = new Array(envLength);
  for (let i = 0; i < envLength; ++i) buffer[i] = envelope.env();
  return buffer;
}

function renderLoadedAudio(loadedAudios, shape, upRate, upFold) {
  const loaded = loadedAudios?.[0];
  if (!loaded?.data?.length) return [];

  const {data} = loaded;
  const channels = loaded.channels || 1;
  const srcFrames = Math.floor(data.length / channels);
  const totalSamples = srcFrames * upFold;
  const buffer = new Array(totalSamples);
  const decay = Math.pow(1e-3, 1 / (shape * upRate));
  let decayEnv = 1;

  for (let i = 0; i < totalSamples; ++i) {
    const srcPos = i / upFold;
    const idx0 = Math.floor(srcPos);
    const idx1 = Math.min(idx0 + 1, srcFrames - 1);
    const frac = srcPos - idx0;

    let s0 = 0;
    let s1 = 0;
    for (let c = 0; c < channels; ++c) {
      s0 += data[idx0 * channels + c];
      s1 += data[idx1 * channels + c];
    }

    buffer[i] = ((s0 + frac * (s1 - s0)) / channels) * decayEnv;
    decayEnv *= decay;
  }
  return buffer;
}

function renderThumbSlapPulse(upRate, shape) {
  const durSec = 0.0008 + 0.004 * shape;
  const durSamples = Math.max(4, Math.ceil(upRate * durSec));
  const buffer = new Array(durSamples);
  const inv = 1.0 / (durSamples - 1);

  for (let i = 0; i < durSamples; ++i) {
    const t = i * inv;
    buffer[i] = -(Math.sin(Math.PI * t) ** 2);
  }
  return buffer;
}

function renderFingerPopPulse(upRate, shape) {
  const durSec = 0.001 + 0.005 * shape;
  const durSamples = Math.max(6, Math.ceil(upRate * durSec));
  const buffer = new Array(durSamples);

  const riseSamples = Math.max(2, Math.floor(0.25 * durSamples));
  const fallSamples = durSamples - riseSamples;

  for (let i = 0; i < riseSamples; ++i) {
    buffer[i] = Math.sin(0.5 * Math.PI * (i / (riseSamples - 1)));
  }
  for (let i = 0; i < fallSamples; ++i) {
    const t = i / (fallSamples - 1);
    buffer[riseSamples + i] = Math.cos(0.5 * Math.PI * t) ** 4;
  }
  return buffer;
}

function renderPulseExcitation(
  pv,
  upRate,
  upFold,
  delaySamples,
  specialMath,
  type = pv.excitationType,
  shape = pv.excitationShape,
) {
  const excType = Math.floor(type);
  const rampLength = Math.ceil(delaySamples);
  if (excType === 0) {
    return (pv.integerPitch) === 1 ? renderTrisawPulseNaive(rampLength, shape)
                                   : renderTrisawPulsePoly(rampLength, shape);
  }
  if (excType === 1) { return renderSurgePulse(pv.notePitch, upRate, upFold, shape, specialMath); }
  if (excType === 2) { return renderLoadedAudio(pv.loadedAudios ?? null, shape, upRate, upFold); }
  if (excType === 3) { return renderThumbSlapPulse(upRate, shape); }
  if (excType === 4) { return renderFingerPopPulse(upRate, shape); }
  return [];
}

function renderNoiseExcitation(pv, upRate) {
  const minCycleSeconds = 0.01;
  const cycleSamples = upRate / pv.notePitch;
  const noiseLength = Math.floor(Math.max(pv.noiseDecay * cycleSamples, minCycleSeconds * upRate));
  const rng = new PcgRandom(pv.noiseSeed >>> 0);

  let filter, cutoffStart, cutoffEnd;
  if (pv.bypassNoiseFilter === 0) {
    const svfClasses = [
      SvfNormalizedLowpass,
      SvfNormalizedHighpass,
      SvfNormalizedBandpass,
      SvfNormalizedNotch,
    ];
    const FilterClass = svfClasses[Math.floor(pv.noiseFilterType)] || SvfNormalizedLowpass;
    cutoffStart = pv.noiseFilterCutoffStart;
    cutoffEnd = dampedLinear(pv.noiseFilterCutoffEnd, 1000, 2000);
    filter = new FilterClass((pv.notePitch * 2 ** (cutoffStart / 12)) / upRate, pv.noiseFilterQ);
  }

  const fadeLength = Math.min(noiseLength, Math.floor(0.5 * cycleSamples));
  const fadeStart = noiseLength - fadeLength;
  const invNoiseLen = noiseLength > 1 ? 1 / (noiseLength - 1) : 0;
  const cutoffDiff = cutoffEnd - cutoffStart;

  const threshold = 1e-3;
  const noiseDecay = threshold ** (1 / noiseLength);
  let noiseEnvelope = (1 / threshold) ** ((2 * cycleSamples) / noiseLength);

  const noiseExcitation = new Array(noiseLength);
  for (let i = 0; i < noiseLength; ++i) {
    let s = i === 0 ? 1.0 : 2.0 * rng.number() - 1.0;

    s *= Math.tanh(noiseEnvelope);
    noiseEnvelope *= noiseDecay;

    if (pv.bypassNoiseFilter === 0) {
      const st = cutoffStart + cutoffDiff * (i * invNoiseLen);
      const cut = (pv.notePitch * 2 ** (st / 12)) / upRate;
      filter.setParams(Math.min(cut, 0.48), pv.noiseFilterQ, noiseLength);
      s = filter.process(s);
    }

    if (i >= fadeStart) { s *= Math.cos((0.5 * Math.PI * (i - fadeStart)) / fadeLength); }

    noiseExcitation[i] = s;
  }

  return noiseExcitation;
}

function processFFComb(inputBuffer, pv, delaySamples) {
  const {ffCombPoint, ffCombGain, ffCombTaps} = pv;
  const nFFComb = Math.min(Math.floor(ffCombTaps), ffCombPoint.length, ffCombGain.length);
  if (nFFComb === 0) return Array.from(inputBuffer);

  const combDelays = Array.from({length: nFFComb}, (_, i) => ffCombPoint[i] * delaySamples);
  const combGains = Array.from({length: nFFComb}, (_, i) => -ffCombGain[i]);
  const maxDelay = Math.max(...combDelays, 0);
  const delay = new MultiTapDelay(maxDelay, nFFComb);
  delay.setTime(combDelays);

  let totalEnergy = 0;
  for (let i = 0; i < nFFComb; i++) {
    const g = typeof combGains[i] === "number" ? combGains[i] : -1.0 / nFFComb;
    totalEnergy += g * g;
  }
  const gain = totalEnergy > Number.EPSILON ? 1.0 / Math.sqrt(totalEnergy) : 0.0;

  const len = inputBuffer.length;
  const totalCombLength = len + Math.ceil(maxDelay);
  const combOut = new Array(totalCombLength);
  for (let i = 0; i < totalCombLength; ++i) {
    const x = i < len ? inputBuffer[i] : 0.0;
    const d = delay.processSplit(x);
    let s = 0;
    for (let j = 0; j < d.length; ++j) s += combGains[j] * d[j];
    combOut[i] = gain * (x + s);
  }
  return combOut;
}

function processSlapBass(pv, upRate, upFold, durationSamples, specialMath) {
  let sound = new Array(durationSamples);

  const freq = pv.notePitch;
  const targetPeriodSamples = pv.integerPitch === 1 ? Math.round(upRate / freq) : upRate / freq;
  const L_samples = targetPeriodSamples * 0.5;

  const numFrets = clamp(Math.floor(pv.fretCount), 0, 24);
  const actionMin = Number.EPSILON;
  const actionMax = 2 / Number.EPSILON;
  const action = pv.bypassFretCollision ? actionMax : Math.max(pv.fretAction, actionMin);
  const targetAction
    = pv.bypassFretCollision ? actionMax : Math.max(pv.fretActionTarget, actionMin);
  const actionDecaySeconds = Math.max(pv.fretActionDecay, 0.0);
  const actionDecay = new SoftDecay(action - targetAction, actionDecaySeconds, upRate);

  const restitution = pv.fretRestitution;
  const slapPosRatio = clamp(pv.slapPosition, 0.5, 0.95);
  const pickupPosRatio = clamp(pv.pickupPosition, 0.05, 0.98);

  const rawNodes = [{pos: 0.0, barrierFactor: null, isStrike: false, isPickup: false}];

  for (let k = 1; k <= numFrets; ++k) {
    const fretRatio = 1.0 - 2.0 ** (-k / 12.0);
    const pos = fretRatio * L_samples;
    const barrierFactor = 0.8 + 1.6 * (k / 24.0);
    rawNodes.push({pos, barrierFactor, isStrike: false, isPickup: false});
  }

  rawNodes.push(
    {pos: slapPosRatio * L_samples, barrierFactor: null, isStrike: true, isPickup: false});
  rawNodes.push(
    {pos: pickupPosRatio * L_samples, barrierFactor: null, isStrike: false, isPickup: true});
  rawNodes.push({pos: L_samples, barrierFactor: null, isStrike: false, isPickup: false});

  rawNodes.sort((a, b) => a.pos - b.pos);

  const nodes = [rawNodes[0]];
  for (let i = 1; i < rawNodes.length; ++i) {
    const current = rawNodes[i];
    const prev = nodes[nodes.length - 1];
    if (Math.abs(current.pos - prev.pos) < 0.95 && current.pos < L_samples) {
      if (current.barrierFactor !== null) prev.barrierFactor = current.barrierFactor;
      if (current.isStrike) prev.isStrike = true;
      if (current.isPickup) prev.isPickup = true;
    } else {
      nodes.push(current);
    }
  }

  const numNodes = nodes.length;
  const numSegments = numNodes - 1;

  const barrierFactors = new Float64Array(numNodes);
  for (let i = 0; i < numNodes; ++i) {
    barrierFactors[i] = nodes[i].barrierFactor;
    nodes[i].barrier = nodes[i].barrierFactor !== null ? -action * nodes[i].barrierFactor : null;
  }

  let strikeNodeIdx = 0;
  let pickupNodeIdx = 0;
  for (let i = 0; i < numNodes; ++i) {
    if (nodes[i].isStrike) strikeNodeIdx = i;
    if (nodes[i].isPickup) pickupNodeIdx = i;
  }
  if (pickupNodeIdx === 0) pickupNodeIdx = Math.min(numNodes - 2, Math.floor(0.85 * numNodes));
  if (strikeNodeIdx === 0) strikeNodeIdx = Math.min(numNodes - 2, Math.floor(0.75 * numNodes));

  const segDelays = new Array(numSegments);
  for (let i = 0; i < numSegments; ++i) {
    segDelays[i] = Math.max(1, Math.round(nodes[i + 1].pos - nodes[i].pos));
  }

  const adaaDelay = 0.5;
  let intSum = segDelays.reduce((acc, v) => acc + v, 0);
  let residualDelay = targetPeriodSamples - 2.0 * intSum - adaaDelay;

  while (residualDelay < 0.0 || residualDelay >= 2.0) {
    const isNegative = residualDelay < 0.0;
    const step = isNegative ? -1 : 1;

    let targetIdx = 0;
    for (let i = 1; i < numSegments; ++i) {
      const isBetter
        = isNegative ? segDelays[i] > segDelays[targetIdx] : segDelays[i] < segDelays[targetIdx];
      if (isBetter) targetIdx = i;
    }

    segDelays[targetIdx] += step;
    intSum += step;
    residualDelay = targetPeriodSamples - 2.0 * intSum - adaaDelay;
  }

  const isInteger = pv.integerPitch === 1;
  const bridgeIntDelay = Math.floor(residualDelay);
  const fractionalDelay = isInteger ? 0.0 : residualDelay - bridgeIntDelay;

  const segments = segDelays.map((d) => new WaveguideSegment(d, isInteger));

  const allpass = new FractionalAllpass();
  allpass.setDelay(fractionalDelay);

  const bridgeSaturator = new adaa.TanhAdaa1();
  const buzzerSaturatorFb = new adaa.TanhAdaa1();
  const buzzerSaturatorOut
    = new adaa.BiasedSaturatorAdaa(new adaa.TanhAdaa1(), 4.0, 2.0, 0.4, 0.37);

  const lpCutoffHz = freq * Math.pow(2, pv.lpCutoffRelative / 12);
  const lpFilter = new LP1(lpCutoffHz / upRate);

  const dcHighpassHz = freq * Math.pow(2, pv.dcHighpassCutoffRelative / 12);
  const dcHighpass = new HP1(dcHighpassHz / upRate);
  const excDcHighpass = new HP1(dcHighpassHz / upRate);

  const loopGain = Math.sign(pv.feedback) * Math.pow(Math.abs(pv.feedback), 1 / freq);
  const nutReflection = -0.998;

  const pulseExcitation
    = renderPulseExcitation(pv, upRate, upFold, targetPeriodSamples, specialMath);
  const noiseExcitation = renderNoiseExcitation(pv, upRate);

  const mix = pv.excitationMix;
  const rawExcitationLength = Math.max(pulseExcitation.length, noiseExcitation.length);
  let excitation = new Array(rawExcitationLength);
  for (let i = 0; i < rawExcitationLength; ++i) {
    const excPulse = pulseExcitation[i] ?? 0.0;
    const excNoise = noiseExcitation[i] ?? 0.0;
    excitation[i] = excPulse + mix * (excNoise - excPulse);
  }

  if (pv.bypassFFCombFilter === 0) {
    excitation = processFFComb(excitation, pv, targetPeriodSamples);
  }

  const buzzer = new SerialAllpass(
    pv.buzzerGain, pv.buzzerDelaySeconds.map((d) => d * upRate), pv.buzzerFeedback, upRate,
    pv.buzzerEq);

  const phaser = new FeedbackPhaser(pv, upRate);
  const micSum = new PointMicSummation(nodes, L_samples, pv);

  const nodeInP = new Float64Array(numNodes);
  const nodeInM = new Float64Array(numNodes);
  const nodeOutP = new Float64Array(numNodes);
  const nodeOutM = new Float64Array(numNodes);

  let buzzOut = 0;

  let bridgeDelayState = 0.0;
  let tensionState = 0.0;
  const tensionAlpha = Math.min(1.0, (4.0 * freq) / upRate);
  const tensionModScaled = pv.tensionMod * 100.0;

  let gainEnv = 1.0;
  const decay = Math.pow(pv.decayTo, 1.0 / sound.length);

  for (let i = 0; i < durationSamples; ++i) {
    const excSig = i < excitation.length ? pv.excitationGain * excitation[i] : 0.0;
    const transverseSig = excDcHighpass.process(excSig) - buzzerSaturatorFb.process(buzzOut);

    for (let s = 0; s < numSegments; ++s) {
      const [outP, outM] = segments[s].process(nodeOutP[s], nodeOutM[s + 1]);
      nodeInP[s + 1] = outP;
      nodeInM[s] = outM;
    }

    nodeInP[strikeNodeIdx] += 0.5 * transverseSig;
    nodeInM[strikeNodeIdx] += 0.5 * transverseSig;

    const currentAction = Math.max(targetAction + actionDecay.process(), Number.EPSILON);

    let sumDelta = 0;
    for (let n = 1; n < numNodes - 1; ++n) {
      const yNode = nodeInP[n] + nodeInM[n];
      const bf = barrierFactors[n];

      if (bf > 0.0) {
        const barrier = -currentAction * bf;
        if (yNode < barrier) {
          const delta = (1.0 + restitution) * 0.5 * (yNode - barrier);
          nodeOutP[n] = nodeInP[n] - delta;
          nodeOutM[n] = nodeInM[n] - delta;
          sumDelta += delta;
          continue;
        }
      }
      nodeOutP[n] = nodeInP[n];
      nodeOutM[n] = nodeInM[n];
    }

    nodeOutP[0] = nutReflection * nodeInM[0];

    let bridgeRefl = -loopGain * nodeInP[numNodes - 1];
    bridgeRefl = lpFilter.process(bridgeRefl);

    if (tensionModScaled !== 0) {
      tensionState += tensionAlpha * (bridgeRefl * bridgeRefl - tensionState);
      const modFactor = 1.0 / Math.sqrt(1.0 + tensionModScaled * tensionState);
      for (let s = 0; s < numSegments; ++s) { segments[s].setTime(segDelays[s] * modFactor); }
    }

    if (bridgeIntDelay === 1) {
      const tmp = bridgeRefl;
      bridgeRefl = bridgeDelayState;
      bridgeDelayState = tmp;
    }

    bridgeRefl = allpass.process(2 * bridgeSaturator.process(0.5 * bridgeRefl));
    nodeOutM[numNodes - 1] = bridgeRefl;

    buzzOut = pv.bypassBuzzer === 1 ? 0.0 : buzzer.process(sumDelta);
    const stringOut = micSum.process(nodeInP, nodeInM);

    let outSig;
    if (pv.bypassBassString === 1) {
      outSig = transverseSig;
    } else {
      outSig = stringOut + pv.buzzerMix * buzzerSaturatorOut.process(10 * buzzOut);
    }

    if (pv.bypassFeedbackPhaser === 0) { outSig = phaser.process(outSig, outSig); }
    outSig = dcHighpass.process(outSig) * gainEnv;

    sound[i] = outSig;
    gainEnv *= decay;
  }

  return sound;
}

onmessage = async (event) => {
  const pv = event.data;

  const specialMath = await getSpecialMath();

  const upFold = parseInt(menuitems.oversampleItems[pv.overSample]);
  const upRate = upFold * pv.sampleRate;
  const durationSamples = Math.floor(upRate * pv.renderDuration);

  let sound = processSlapBass(pv, upRate, upFold, durationSamples, specialMath);

  if (upFold > 1) sound = downSampleIIR(sound, upFold);

  postMessage({sound});
};
