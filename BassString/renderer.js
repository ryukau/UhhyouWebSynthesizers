// Copyright Takamitsu Endo (ryukau@gmail.com)
// SPDX-License-Identifier: Apache-2.0

import * as adaa from "../common/dsp/adaa/adaa.js";
import {CubicDelay, IntDelay, MultiTapDelay} from "../common/dsp/delay.js";
import {SurgeEnvelope} from "../common/dsp/envelope.js";
import {downSampleIIR} from "../common/dsp/multirate.js";
import {AP1TPT, HP1, LP1} from "../common/dsp/onepole.js";
import {EMAFilter} from "../common/dsp/smoother.js";
import {
  SVFHP,
  SvfNormalizedBandpass,
  SvfNormalizedHighpass,
  SvfNormalizedLowpass,
  SvfNormalizedNotch,
} from "../common/dsp/svf.js";
import {clamp, lerp} from "../common/util.js";
import {PcgRandom} from "../lib/pcgrandom/pcgrandom.js";

import * as menuitems from "./menuitems.js";

function renderTrisawPulseNaive(rampLength, shape) {
  const buffer = new Array(rampLength);
  const p = shape * rampLength;
  const q = rampLength * (1 - shape);

  for (let i = 0; i < rampLength; ++i) {
    if (shape === 0) {
      buffer[i] = 1.0 - i / rampLength;
    } else if (shape === 1) {
      buffer[i] = i / rampLength;
    } else {
      buffer[i] = (i < p) ? (i / p) : ((rampLength - i) / q);
    }
  }
  return buffer;
}

/*
Triangular-sawtooth pulse generator. 2 sample latency.

- `length` in samples.
- `shape` in [0, 1]. 0: downward ramp, 0.5: triangle, 1: upward ramp.
*/
function renderTrisawPulsePoly(length, shape) {
  if (shape < 0 || shape > 1) { throw new RangeError("Requires 0 <= shape <= 1"); }

  let signal;
  let corners;
  let m;

  if (shape === 0) {
    // polyBLEP.
    m = Math.ceil(length);
    const k = 1 / length;
    const mainPart = Array.from({length: m}, (_, i) => 1 - i * k);
    signal = [0.0, 0.0].concat(mainPart).concat([0.0, 0.0, 0.0]);

    signal[1] += 1 / 24;
    signal[2] -= 0.5;
    signal[3] -= 1 / 24;

    corners = [[0, -k], [length, k]];

  } else if (shape === 1) {
    // polyBLEP.
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

    corners = [[0, k], [length, -k]];

  } else {
    const p = shape * length;
    const q = length * (1 - shape);
    m = Math.ceil(length);

    signal = Array(m + 5).fill(0.0);
    for (let i = 0; i < m; i++) { signal[i + 2] = (i < p) ? (i / p) : ((length - i) / q); }

    corners = [[0, 1 / p], [p, -(1 / p + 1 / q)], [length, 1 / q]];
  }

  for (const [tc, ds] of corners) {
    // polyBLAMP.
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

function renderSurgePulse(freq, upRate, upFold, shape) {
  const noteFrequencyNormalized = freq / upRate;
  const totalLengthSamples = 0.5 / noteFrequencyNormalized;
  const attackSamples = Math.max(1, Math.min(totalLengthSamples - 1, shape * totalLengthSamples));

  const envelope = new SurgeEnvelope(attackSamples, totalLengthSamples + 8 * upFold);
  const envLength = 2 * Math.ceil(totalLengthSamples);
  const buffer = new Array(envLength);

  for (let i = 0; i < envLength; ++i) { buffer[i] = envelope.env(); }
  return buffer;
}

function renderLoadedAudio(loadedAudios, shape, upRate, upFold) {
  const loaded = loadedAudios?.[0];
  if (!loaded || !loaded.data || loaded.data.length === 0) { return []; }

  const data = loaded.data;
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

function dampedLinear(x, p, a) { return x <= p ? x : p + (x - p) / (1 + Math.log1p((x - p) / a)); }

function getFFCombGain(delayTimeSamples, combGains) {
  if (!delayTimeSamples?.length) return 1.0;

  const N = delayTimeSamples.length;
  let totalEnergy = 0;
  for (let i = 0; i < N; i++) {
    const g = typeof combGains?.[i] === 'number' ? combGains[i] : -1.0 / N;
    totalEnergy += g * g;
  }
  return totalEnergy > Number.EPSILON ? 1.0 / Math.sqrt(totalEnergy) : 0.0;
}

function tanhBiased(x, gain = 4, bias = 2, dryMix = 0.4) {
  const y = 0.37 * (Math.tanh(gain * x + bias) - Math.tanh(bias));
  return y + dryMix * (x - y);
}

export class FeedbackPhaser {
  #allpass;
  #feedbackHighpass;
  #outputHighpass;
  #modLowpass = new EMAFilter();
  #feedbackBuffer = 0.0;

  #outGain = 1.0;
  #fbMix = 1.0;
  #inMixSign = 1.0;
  #fbGain = 0.5;
  #fbClip = 1.0;
  #apSpread = 1.0;
  #apCenterCut = 0.0;
  #modAmt = 1.0;

  constructor(
    sampleRate,
    stage,
    mix,
    feedback,
    allpassCenterHz,
    allpassSpread,
    modAmount,
    modLowpassHz,
  ) {
    this.#allpass = Array.from({length: stage}, () => new AP1TPT());

    this.#fbMix = Math.abs(mix);
    this.#inMixSign = mix >= 0 ? 1.0 : -1.0;

    this.#fbGain = feedback;

    const fbHpHz = 5.0;
    const outHpHz = 5.0;
    this.#feedbackHighpass = new SVFHP(fbHpHz / sampleRate, Math.SQRT1_2);
    this.#outputHighpass = new SVFHP(outHpHz / sampleRate, Math.SQRT1_2);

    const apCenterHz = allpassCenterHz;
    this.#apCenterCut = apCenterHz / sampleRate;
    this.#apSpread = allpassSpread;

    this.#modAmt = modAmount;

    const modLpHz = modLowpassHz;
    if (modLpHz >= 100000) {
      this.#modLowpass.alpha = 1.0;
    } else {
      this.#modLowpass.setCutoff(modLpHz / sampleRate);
    }

    this.reset();
  }

  reset() {
    this.#feedbackBuffer = 0.0;
    this.#feedbackHighpass.reset();
    this.#outputHighpass.reset();
    this.#modLowpass.reset();
    for (let i = 0; i < this.#allpass.length; ++i) { this.#allpass[i].reset(); }
  }

  process(input, modulation) {
    const clipAmp = 256.0;
    const apMod = clamp(this.#modAmt * modulation, -clipAmp, clipAmp);
    let apCut = Math.min(2 ** apMod * this.#apCenterCut, 1.0 - 1.1920928955078125e-7);
    apCut = this.#modLowpass.process(apCut);

    let sig = input + this.#fbGain * this.#feedbackBuffer;

    for (let idx = 0; idx < this.#allpass.length; ++idx) {
      const multiplier = 1.0 + idx * this.#apSpread;
      sig = this.#allpass[idx].processMod(sig, apCut * multiplier);
    }

    const apOut = sig;
    const out = lerp(this.#inMixSign * input, apOut, this.#fbMix);

    const fbOut = this.#feedbackHighpass.process(out);
    this.#feedbackBuffer = clamp(fbOut, -this.#fbClip, this.#fbClip);

    return this.#outGain * this.#outputHighpass.process(out);
  }
}

onmessage = async (event) => {
  const pv = event.data;

  const upFold = parseInt(menuitems.oversampleItems[pv.overSample]);
  const upRate = upFold * pv.sampleRate;

  const durationSamples = upRate * pv.renderDuration;
  let sound = new Array(Math.floor(durationSamples));

  const loopDelay = 1.0;

  // Transverse delay.
  const freq = pv.notePitch;
  const delaySamples
    = (pv.integerPitch === 1) ? Math.round(upRate / freq - loopDelay) : upRate / freq - loopDelay;
  const maxDelaySamples = delaySamples;

  const delayLine
    = (pv.integerPitch === 1) ? new IntDelay(maxDelaySamples) : new CubicDelay(maxDelaySamples);
  delayLine.setTime(delaySamples);

  const lpCutoffHz = freq * Math.pow(2, pv.lpCutoffRelative / 12);
  const lpFilter = new LP1(lpCutoffHz / upRate);

  const dcHighpassHz = freq * Math.pow(2, pv.dcHighpassCutoffRelative / 12);
  const dcHighpass = new HP1(dcHighpassHz / upRate);
  const excDcHighpass = new HP1(dcHighpassHz / upRate);

  const loopGain = Math.sign(pv.feedback) * Math.pow(Math.abs(pv.feedback), 1 / freq);

  // Pulse excitation.
  const excType = Math.floor(pv.excitationType);
  const rampLength = Math.ceil(delaySamples);
  const renderPulseExcitation = () => {
    const shape = pv.excitationShape;
    if (excType === 0) {
      if (pv.integerPitch === 1) { return renderTrisawPulseNaive(rampLength, shape); }
      return renderTrisawPulsePoly(rampLength, shape);
    }
    if (excType === 1) { return renderSurgePulse(freq, upRate, upFold, shape); }
    if (excType === 2) { return renderLoadedAudio(pv.loadedAudios, shape, upRate, upFold); }
    return [];
  };
  const pulseExcitation = renderPulseExcitation();

  // Noise excitation.
  const minCycleSeconds = 0.01;
  const cycleSamples = upRate / freq;
  const noiseLength = Math.floor(Math.max(pv.noiseDecay * cycleSamples, minCycleSeconds * upRate));
  const rng = new PcgRandom(pv.noiseSeed >>> 0);

  let filter, cutoffStart, cutoffEnd;
  if (pv.bypassNoiseFilter === 0) {
    const svfClasses =
      [SvfNormalizedLowpass, SvfNormalizedHighpass, SvfNormalizedBandpass, SvfNormalizedNotch];
    const FilterClass = svfClasses[Math.floor(pv.noiseFilterType)] || SvfNormalizedLowpass;
    cutoffStart = pv.noiseFilterCutoffStart;
    cutoffEnd = dampedLinear(pv.noiseFilterCutoffEnd, 1000, 2000);
    filter = new FilterClass((freq * Math.pow(2, cutoffStart / 12)) / upRate, pv.noiseFilterQ);
  }

  const fadeLength = Math.min(noiseLength, Math.floor(0.5 * cycleSamples));
  const fadeStart = noiseLength - fadeLength;
  const invNoiseLen = noiseLength > 1 ? 1 / (noiseLength - 1) : 0;
  const cutoffDiff = cutoffEnd - cutoffStart;

  const threshold = 1e-3;
  const noiseDecay = threshold ** (1 / noiseLength);
  let noiseEnvelope = (1 / threshold) ** (2 * cycleSamples / noiseLength);

  const noiseExcitation = new Array(noiseLength);
  for (let i = 0; i < noiseLength; ++i) {
    let s = (i === 0) ? 1.0 : (2.0 * rng.number() - 1.0);

    s *= Math.tanh(noiseEnvelope);
    noiseEnvelope *= noiseDecay;

    if (pv.bypassNoiseFilter === 0) {
      const st = cutoffStart + cutoffDiff * (i * invNoiseLen);
      const cut = (freq * Math.pow(2, st / 12)) / upRate;
      filter.setParams(Math.min(cut, 0.48), pv.noiseFilterQ, noiseLength);
      s = filter.process(s);
    }

    if (i >= fadeStart) { s *= Math.cos((0.5 * Math.PI * (i - fadeStart)) / fadeLength); }

    noiseExcitation[i] = s;
  }

  // Sum excitations.
  const mix = pv.excitationMix;
  const rawExcitationLength = Math.max(pulseExcitation.length, noiseExcitation.length);
  let excitation = new Array(rawExcitationLength);
  for (let i = 0; i < rawExcitationLength; ++i) {
    const excPulse = (i < pulseExcitation.length) ? pulseExcitation[i] : 0.0;
    const excNoise = (i < noiseExcitation.length) ? noiseExcitation[i] : 0.0;
    let sig = excPulse + mix * (excNoise - excPulse);
    excitation[i] = sig;
  }

  // Pickup position filter (feed-forward comb).
  if (pv.bypassPickupFilter === 0) {
    const pickupArray = pv.pickupPoint;
    const gainArray = pv.pickupGain;
    const nPickup = Math.min(Math.floor(pv.pickupTaps), pickupArray.length);
    if (nPickup > 0) {
      const combDelays = Array.from({length: nPickup}, (_, i) => pickupArray[i] * delaySamples);
      const combGains = Array.from({length: nPickup}, (_, i) => -gainArray[i]); // Must be negative.
      const maxCombDelay = Math.max(...combDelays, 0);
      const delay = new MultiTapDelay(maxCombDelay, nPickup);
      delay.setTime(combDelays);

      const excLength = excitation.length;
      const totalCombLength = excLength + Math.ceil(maxCombDelay);
      const gain = getFFCombGain(combDelays, combGains);
      const combOut = new Array(totalCombLength);
      for (let i = 0; i < totalCombLength; ++i) {
        const x = i < excLength ? excitation[i] : 0;
        const d = delay.processSplit(x);
        let s = 0;
        for (let j = 0; j < d.length; ++j) { s += combGains[j] * d[j]; }
        combOut[i] = gain * (x + s);
      }
      excitation = combOut;
    }
  }

  let tensionState = 0.0;
  const tensionAlpha = Math.min(1.0, (4.0 * freq) / upRate);

  // Feedback phaser initialization.
  let phaser = new FeedbackPhaser(
    upRate,
    pv.phaserStage,
    pv.phaserMix,
    pv.phaserFeedback,
    pv.phaserAllpassCenterHz,
    pv.phaserAllpassSpread,
    pv.phaserModAmount,
    pv.phaserModLowpassHz,
  );

  // Main processing loop.
  let feedback = 0;
  let gainEnv = 1;
  const decay = Math.pow(pv.decayTo, 1.0 / sound.length);

  for (let i = 0; i < sound.length; ++i) {
    const excSig = (i < excitation.length) ? pv.excitationGain * excitation[i] : 0.0;
    let transverseSig = excDcHighpass.process(excSig);

    // Transverse string forward path.
    if (pv.bypassBassString === 0) {
      transverseSig += feedback;
      transverseSig = lpFilter.process(transverseSig);

      if (pv.tensionMod !== 0) {
        tensionState += tensionAlpha * (transverseSig * transverseSig - tensionState);
        const dynamicDelay = delaySamples / Math.sqrt(1.0 + pv.tensionMod * tensionState);
        delayLine.setTime(dynamicDelay);
      }
    }

    const transDelayOut = (pv.bypassBassString === 0) ? delayLine.process(transverseSig) : 0.0;
    feedback = loopGain * transDelayOut;

    // Output signal mix & filtering.
    let outSig = transverseSig;
    if (pv.bypassFeedbackPhaser === 0) { outSig = phaser.process(outSig, outSig); }
    outSig = tanhBiased(outSig);
    outSig = dcHighpass.process(outSig) * gainEnv;
    sound[i] = outSig;
    gainEnv *= decay;
  }

  if (upFold > 1) { sound = downSampleIIR(sound, upFold); }

  postMessage({sound: sound});
};
