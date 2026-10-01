// Copyright Takamitsu Endo (ryukau@gmail.com)
// SPDX-License-Identifier: Apache-2.0

import {CubicDelay, IntDelay, MultiTapDelay} from "../common/dsp/delay.js";
import {SurgeEnvelope, SurgeEnvelopeBiased} from "../common/dsp/envelope.js";
import {downSampleIIR} from "../common/dsp/multirate.js";
import {HP1, LP1} from "../common/dsp/onepole.js";
import {sosBiquadLowpass, SosFilterImmediate} from "../common/dsp/sos.js";
import {
  SvfNormalizedBandpass,
  SvfNormalizedHighpass,
  SvfNormalizedLowpass,
  SvfNormalizedNotch,
} from "../common/dsp/svf.js";
import {clamp} from "../common/util.js";
import {PcgRandom} from "../lib/pcgrandom/pcgrandom.js";

import * as menuitems from "./menuitems.js";

function dampedLinear(x, p, a) { return x <= p ? x : p + (x - p) / (1 + Math.log1p((x - p) / a)); }

export class ExcitationComb {
  #stages;
  #feedback;
  bypass;

  constructor(
    sampleRate,
    frequency,
    timeScalar,
    pickCombFB,
    rnd,
    nFilter = 8,
    baseRate = 44100,
    bypass = false,
  ) {
    this.bypass = bypass;
    const rateRatio = sampleRate / baseRate;

    const maxTimeSamplesBase = (timeScalar * baseRate) / Math.max(frequency, 1e-4);
    const maxLoopDelayBase = maxTimeSamplesBase + 1;

    const maxDelaySamples = Math.ceil(maxLoopDelayBase * rateRatio - 1);
    const requiredSize = Math.max(maxDelaySamples + 2, 4);

    this.#feedback = clamp(pickCombFB, -0.9999, 0.9999);
    this.#stages = new Array(nFilter);

    for (let i = 0; i < nFilter; ++i) {
      const r = typeof rnd.random === "function" ? rnd.random() : rnd.number();

      const delayInSamplesBase = r * maxTimeSamplesBase;
      const loopDelayBase = delayInSamplesBase + 1;

      const targetDelay = loopDelayBase * rateRatio - 1;
      const delayInSamples = clamp(targetDelay, 0, requiredSize - 2);
      const timeInt = Math.floor(delayInSamples);

      this.#stages[i] = {
        buf: new Float64Array(requiredSize),
        wptr: 0,
        timeInt,
        rFraction: delayInSamples - timeInt,
        combBuf: 0,
      };
    }
  }

  reset() {
    for (let i = 0; i < this.#stages.length; ++i) {
      const stage = this.#stages[i];
      stage.buf.fill(0);
      stage.wptr = 0;
      stage.combBuf = 0;
    }
  }

  process(input) {
    if (this.bypass) return input;

    let sig = input;
    const stages = this.#stages;
    const fb = this.#feedback;
    const n = stages.length;

    for (let i = 0; i < n; ++i) {
      const stage = stages[i];
      const buf = stage.buf;
      const bufLen = buf.length;

      const u = sig - fb * stage.combBuf;

      if (++stage.wptr >= bufLen) stage.wptr = 0;
      buf[stage.wptr] = u;

      let rptr0 = stage.wptr - stage.timeInt;
      let rptr1 = rptr0 - 1;
      if (rptr0 < 0) rptr0 += bufLen;
      if (rptr1 < 0) rptr1 += bufLen;

      stage.combBuf = buf[rptr0] + stage.rFraction * (buf[rptr1] - buf[rptr0]);
      sig = -u;
    }

    return sig;
  }
}

function applyPickComb(excitation, pickPosition, delaySamples, isIntegerPitch) {
  if (pickPosition <= 0.0 || excitation.length === 0) return excitation;
  const tauBeta = pickPosition * delaySamples;

  if (isIntegerPitch) {
    const intTau = Math.floor(tauBeta);
    const totalCombLength = excitation.length + intTau;
    const combOut = new Array(totalCombLength).fill(0.0);
    // Two writes per sample on excitation
    for (let i = 0; i < excitation.length; ++i) {
      const v = 0.5 * excitation[i];
      combOut[i] += v;
      combOut[i + intTau] -= v;
    }
    return combOut;
  }

  const combDelay = new CubicDelay(tauBeta);
  combDelay.setTime(tauBeta);
  const totalCombLength = excitation.length + Math.ceil(tauBeta) + 4;
  const combOut = new Array(totalCombLength);
  for (let i = 0; i < totalCombLength; ++i) {
    const x = i < excitation.length ? excitation[i] : 0.0;
    combDelay.write(x);
    combOut[i] = 0.5 * (x - combDelay.read(tauBeta));
  }
  return combOut;
}

class TransverseDelay {
  constructor(stringParams, sampleRate) {
    const freq = stringParams.stringFreq;
    const loopDelay = 1.0;
    this.delaySamples = (stringParams.integerPitch === 1)
      ? Math.round(sampleRate / freq - loopDelay)
      : sampleRate / freq - loopDelay;
    this.delayLine = (stringParams.integerPitch === 1) ? new IntDelay(this.delaySamples)
                                                       : new CubicDelay(this.delaySamples);
    this.delayLine.setTime(this.delaySamples);

    this.lpFilter = new LP1((freq * 2 ** (stringParams.lpCutoffRelative / 12)) / sampleRate);
    this.excDcHighpass
      = new HP1((freq * 2 ** (stringParams.dcHighpassCutoffRelative / 12)) / sampleRate);

    this.loopGain
      = Math.sign(stringParams.feedback) * Math.pow(Math.abs(stringParams.feedback), 1 / freq);
    this.tensionMod = stringParams.tensionMod;
    this.tensionAlpha = Math.min(1.0, (4.0 * freq) / sampleRate);
    this.tensionState = 0.0;
    this.feedback = 0.0;
    this.sampleIdx = 0;

    const pPos = stringParams.pickPosition ?? stringParams.pickupPosition;
    this.pickPosition = (pPos !== undefined) ? clamp(pPos, 0.0, 0.5) : 0.2;
    this.twoWrites = stringParams.pickPositionMethod;

    this.attackNonlinearDamping = stringParams.attackNonlinearDamping;
    this.attackLpOpenCycles = stringParams.attackLpOpenCycles;
    this.attackLpOpenSamples = Math.round(this.attackLpOpenCycles * this.delaySamples);
    this.attackFeedbackCycles = stringParams.attackFeedbackCycles;

    if (this.attackFeedbackCycles > 0) {
      const atkDuration = Math.max(1, Math.round(this.attackFeedbackCycles * this.delaySamples));
      const fNorm = Math.min(0.49, 1.0 / atkDuration);
      const sos = sosBiquadLowpass(fNorm, 0.125);
      this.fbAttackFilter = new SosFilterImmediate(sos);
    } else {
      this.fbAttackFilter = null;
    }
  }

  reset() {
    this.tensionState = 0.0;
    this.feedback = 0.0;
    this.sampleIdx = 0;
    this.delayLine.reset?.();
    this.lpFilter.reset?.();
    this.excDcHighpass.reset?.();
    this.fbAttackFilter?.reset?.();
  }

  process(input) {
    let transverseSig = this.excDcHighpass.process(input);

    transverseSig += this.feedback;
    const filteredSig = this.lpFilter.process(transverseSig);

    if (this.attackLpOpenCycles > 0 && this.sampleIdx < this.attackLpOpenSamples) {
      const progress = this.sampleIdx / this.attackLpOpenSamples;
      const blend = 0.5 * (1.0 + Math.cos(Math.PI * progress));
      transverseSig = blend * transverseSig + (1.0 - blend) * filteredSig;
    } else {
      transverseSig = filteredSig;
    }

    let dynamicDelay = this.delaySamples;
    if (this.tensionMod !== 0) {
      this.tensionState += this.tensionAlpha * (transverseSig * transverseSig - this.tensionState);
      dynamicDelay = this.delaySamples / Math.sqrt(1.0 + this.tensionMod * this.tensionState);
      this.delayLine.setTime(dynamicDelay);
    }

    const transDelayOut = this.delayLine.process(transverseSig);
    let fb = this.loopGain * transDelayOut;

    if (this.fbAttackFilter) { fb *= this.fbAttackFilter.process(1.0); }

    if (this.attackNonlinearDamping > 0) {
      fb = fb / (1.0 + this.attackNonlinearDamping * fb * fb);
    }

    this.feedback = fb;
    this.sampleIdx++;

    // Only do the 2nd read if in 2-reads mode (twoWrites is disabled)
    if (!this.twoWrites && this.pickPosition > 0.0) {
      const tauBeta = this.pickPosition * dynamicDelay;
      const read2 = this.delayLine.read(tauBeta);
      return 0.5 * (transverseSig - read2);
    }

    return transverseSig;
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
  for (let i = 0; i < envLength; ++i) buffer[i] = envelope.process();
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

function renderPulseExcitation(stringParams, upRate, upFold, delaySamples) {
  const excType = Math.floor(stringParams.excitationType);
  const shape = stringParams.excitationShape;
  const rampLength = Math.ceil(delaySamples);
  if (excType === 0) {
    return stringParams.integerPitch === 1 ? renderTrisawPulseNaive(rampLength, shape)
                                           : renderTrisawPulsePoly(rampLength, shape);
  }
  if (excType === 1) { return renderSurgePulse(stringParams.stringFreq, upRate, upFold, shape); }
  if (excType === 2) {
    return renderLoadedAudio(stringParams.loadedAudios ?? null, shape, upRate, upFold);
  }
  if (excType === 3) { return renderThumbSlapPulse(upRate, shape); }
  if (excType === 4) { return renderFingerPopPulse(upRate, shape); }
  return [];
}

function renderNoiseExcitation(stringParams, upRate, rng) {
  const minCycleSeconds = 0.01;
  const cycleSamples = upRate / stringParams.stringFreq;
  const noiseLength
    = Math.floor(Math.max(stringParams.noiseDecay * cycleSamples, minCycleSeconds * upRate));

  const svfClasses = [
    SvfNormalizedLowpass,
    SvfNormalizedHighpass,
    SvfNormalizedBandpass,
    SvfNormalizedNotch,
  ];
  const FilterClass = svfClasses[Math.floor(stringParams.noiseFilterType)] || SvfNormalizedLowpass;
  const cutoffStart = stringParams.noiseFilterCutoffStart;
  const cutoffPeak = stringParams.noiseFilterCutoffPeak;
  const cutoffEnd = dampedLinear(stringParams.noiseFilterCutoffEnd, 1000, 2000);

  const attackSamples = Math.max(1, Math.round(stringParams.noiseFilterAttackTime * cycleSamples));
  const totalLengthSamples = Math.max(noiseLength, attackSamples + 1);

  const diffStart = cutoffStart - cutoffEnd;
  const diffPeak = cutoffPeak - cutoffEnd;
  const range = Math.max(Math.abs(diffStart), Math.abs(diffPeak));

  const bias = range > 0 ? diffStart / range : 0.0;
  const targetPeak = range > 0 ? diffPeak / range : 0.0;

  const filterEnv
    = new SurgeEnvelopeBiased(attackSamples, totalLengthSamples, 1e-5, bias, targetPeak);

  const filter = new FilterClass(
    (stringParams.stringFreq * 2 ** (cutoffStart / 12)) / upRate,
    stringParams.noiseFilterQ,
  );

  const fadeLength = Math.min(noiseLength, Math.floor(0.5 * cycleSamples));
  const fadeStart = noiseLength - fadeLength;

  const threshold = 1e-3;
  const noiseDecay = threshold ** (1 / noiseLength);
  let noiseEnvelope = (1 / threshold) ** (2 * cycleSamples / noiseLength);

  const noiseExcitation = new Array(noiseLength);
  for (let i = 0; i < noiseLength; ++i) {
    let s = (i === 0) ? 1.0 : (2.0 * rng.number() - 1.0);

    s *= Math.tanh(noiseEnvelope);
    noiseEnvelope *= noiseDecay;

    const envVal = filterEnv.process();
    const st = cutoffEnd + range * envVal;
    const cut = (stringParams.stringFreq * 2 ** (st / 12)) / upRate;
    filter.setParams(Math.min(cut, 0.48), stringParams.noiseFilterQ, noiseLength);
    s = filter.process(s);

    if (i >= fadeStart) { s *= Math.cos((0.5 * Math.PI * (i - fadeStart)) / fadeLength); }

    noiseExcitation[i] = s;
  }

  return noiseExcitation;
}

function processFFComb(inputBuffer, stringParams, delaySamples) {
  const {ffCombPoint, ffCombGain, ffCombTaps} = stringParams;
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

function renderSinglePluckString(
  renderParams,
  stringFreq,
  upRate,
  upFold,
  durationSamples,
  feedback,
  lpCutoffRelative,
  pickPosition,
  rng,
) {
  const stringParams = Object.assign({}, renderParams, {
    stringFreq,
    feedback,
    lpCutoffRelative,
    pickPosition,
  });

  const transverseDelay = new TransverseDelay(stringParams, upRate);
  const dcHighpass
    = new HP1((stringFreq * 2 ** (renderParams.dcHighpassCutoffRelative / 12)) / upRate);

  const pulseExcitation
    = renderPulseExcitation(stringParams, upRate, upFold, transverseDelay.delaySamples);
  const noiseExcitation = renderNoiseExcitation(stringParams, upRate, rng);

  const mix = renderParams.excitationMix;
  const rawExcitationLength = Math.max(pulseExcitation.length, noiseExcitation.length);
  let excitation = new Array(rawExcitationLength);
  for (let i = 0; i < rawExcitationLength; ++i) {
    const excPulse = pulseExcitation[i] ?? 0.0;
    const excNoise = noiseExcitation[i] ?? 0.0;
    excitation[i] = excPulse + mix * (excNoise - excPulse);
  }

  excitation = processFFComb(excitation, stringParams, transverseDelay.delaySamples);

  // If 2 writes method is enabled, apply pick comb filter to excitation
  if (transverseDelay.twoWrites) {
    excitation = applyPickComb(
      excitation, transverseDelay.pickPosition, transverseDelay.delaySamples,
      stringParams.integerPitch === 1);
  }

  const {nFilter, pickCombTime, pickCombFB} = stringParams;
  const isBypassed = Boolean(stringParams.pickCombBypass ?? stringParams.excitationCombBypass);
  const excitationAllpass = (!isBypassed && pickCombFB > 0 && nFilter > 0)
    ? new ExcitationComb(
        upRate, stringFreq, pickCombTime * Math.exp(1 - rng.number()), pickCombFB, rng, nFilter)
    : null;

  const stringSound = new Array(durationSamples);
  for (let i = 0; i < durationSamples; ++i) {
    let excSig = (i < excitation.length) ? renderParams.excitationGain * excitation[i] : 0.0;
    if (excitationAllpass) excSig = excitationAllpass.process(excSig);
    const outSig = transverseDelay.process(excSig);
    stringSound[i] = dcHighpass.process(outSig);
  }

  return stringSound;
}

function processPluckChord(renderParams, upRate, upFold, durationSamples, rng) {
  const notes = renderParams.chord || [];
  if (notes.length === 0) { return new Array(durationSamples).fill(0.0); }

  const noteCount = notes.length;

  const sorted = notes.map((note, originalIndex) => ({note, originalIndex}))
                   .sort((a, b) => a.note.frequencyHz - b.note.frequencyHz);

  const pitchRanks = new Array(noteCount);
  sorted.forEach((item, rank) => { pitchRanks[item.originalIndex] = rank; });

  const maxDetune = renderParams.randomDetune;
  const bias = renderParams.detuneBias;

  const rawDetunes = new Array(noteCount);
  for (let n = 0; n < noteCount; ++n) { rawDetunes[n] = (2.0 * rng.number() - 1.0) * maxDetune; }

  let masterSound = new Array(durationSamples).fill(0.0);
  const feedbackScalar = renderParams.feedbackScalar;
  const lpCutoffOffset = renderParams.lpCutoff ?? renderParams.lpCutoffOffset ?? 0;

  for (let n = 0; n < noteCount; ++n) {
    const note = notes[n];
    const startOffset = Math.max(0, Math.floor(note.delaySeconds * upRate));
    if (startOffset >= durationSamples) continue;

    const remainingDuration = durationSamples - startOffset;

    let freq = note.frequencyHz;
    if (maxDetune !== 0) {
      const noteIndex = pitchRanks[n];
      const u = noteCount > 1 ? noteIndex / (noteCount - 1) : 0.0;
      const biasWeight = (bias >= 0) ? (1.0 - bias * (1.0 - u)) : (1.0 + bias * u);
      const effectiveDetune = rawDetunes[n] * biasWeight;
      freq *= 2 ** (effectiveDetune / 1200);
    }

    const stringSound = renderSinglePluckString(
      renderParams, freq, upRate, upFold, remainingDuration, feedbackScalar * note.feedback,
      note.lpCutoffRelative + lpCutoffOffset, note.pickPosition, rng);

    const amp = note.amplitude;
    for (let i = 0; i < stringSound.length; ++i) {
      masterSound[startOffset + i] += amp * stringSound[i];
    }
  }

  let gainEnv = 1;
  const decay = Math.pow(renderParams.decayTo, 1.0 / masterSound.length);

  for (let i = 0; i < masterSound.length; ++i) {
    masterSound[i] *= gainEnv;
    gainEnv *= decay;
  }

  return masterSound;
}

function processPluckBass(renderParams, upRate, upFold, durationSamples, rng) {
  let stringFreq = renderParams.chordBass;
  if (renderParams.randomDetune !== 0) {
    const rawDetune = (2.0 * rng.number() - 1.0) * renderParams.randomDetune;
    const bias = renderParams.detuneBias;
    const biasWeight = (bias >= 0) ? (1.0 - bias) : 1.0;
    stringFreq *= 2 ** ((rawDetune * biasWeight) / 1200);
  }

  const bassFeedback = renderParams.feedbackScalar * renderParams.feedback;
  const lpCutoffOffset = renderParams.lpCutoff ?? renderParams.lpCutoffOffset ?? 0;
  const bassPickPosition = renderParams.chordPickPositions?.[0] ?? renderParams.pickPosition ?? 0.2;
  const sound = renderSinglePluckString(
    renderParams, stringFreq, upRate, upFold, durationSamples, bassFeedback,
    renderParams.lpCutoffRelative + lpCutoffOffset, bassPickPosition, rng);

  let gainEnv = 1;
  const decay = Math.pow(renderParams.decayTo, 1.0 / sound.length);
  for (let i = 0; i < sound.length; ++i) {
    sound[i] *= gainEnv;
    gainEnv *= decay;
  }

  return sound;
}

onmessage = async (event) => {
  const renderParams = event.data;

  const upFold = parseInt(menuitems.oversampleItems[renderParams.overSample]);
  const upRate = upFold * renderParams.sampleRate;
  const durationSamples = Math.floor(upRate * renderParams.renderDuration);

  const channel = renderParams.channel ?? 0;
  const channelSeedOffset = (renderParams.stereoNoise === 1) ? channel * 0x9e3779b9 : 0;
  const rng = new PcgRandom((renderParams.noiseSeed + channelSeedOffset) >>> 0);

  let sound = (renderParams.chord !== undefined)
    ? processPluckChord(renderParams, upRate, upFold, durationSamples, rng)
    : processPluckBass(renderParams, upRate, upFold, durationSamples, rng);

  if (upFold > 1) sound = downSampleIIR(sound, upFold);

  postMessage({sound});
};
