// Copyright Takamitsu Endo (ryukau@gmail.com)
// SPDX-License-Identifier: Apache-2.0

import {ExpADEnvelope} from "../common/dsp/envelope.js";
import {Limiter} from "../common/dsp/limiter.js";
import {downSampleLinearPhase} from "../common/dsp/multirate.js";
import {BiquadOsc} from "../common/dsp/recursivesine.js";
import {selectFilter} from "../common/dsp/resonantfilter.js";
import {EMAFilter} from "../common/dsp/smoother.js";
import {SVF} from "../common/dsp/svf.js";
import {constructIntJustScale} from "../common/dsp/tuning.js";
import {
  clamp,
  computePolynomial,
  exponentialMap,
  lerp,
  shuffleArray,
  uniformFloatMap,
  uniformIntMap
} from "../common/util.js";
import {PcgRandom} from "../lib/pcgrandom/pcgrandom.js";

import * as menuitems from "./menuitems.js";

class MultiSine {
  // `baseFreq` is normalized frequency in [0, 0.5).
  constructor(nSine, rng, baseFreq, baseAttackSample, baseDecaySample, sort) {
    // Do not render partials beyond Nyquist frequency.
    if (baseFreq * nSine >= 0.5) nSine = Math.floor(0.5 / baseFreq);

    this.osc = new Array(nSine);
    this.env = new Array(nSine);

    const randomPitch = () => exponentialMap(
      rng.number(), 0.9885140203528962, 1.0116194403019225); // ±20 cents.
    const randomGain = () => exponentialMap(rng.number(), 0.5, 2);

    let oscFreq = new Array(nSine);
    this.oscGain = new Array(nSine);
    let envAttack = new Array(nSine);
    let envDecay = new Array(nSine);
    for (let i = 0; i < nSine; ++i) {
      oscFreq[i] = baseFreq * (i + 1) * randomPitch();
      this.oscGain[i] = baseFreq / oscFreq[i] * randomGain();
      envAttack[i]
        = exponentialMap(rng.number(), baseAttackSample / 16, baseAttackSample);
      envDecay[i] = exponentialMap(rng.number(), baseDecaySample / 16, baseDecaySample);
    }

    const normalizeGain = 1 / this.oscGain.reduce((p, c) => p + c, 0);
    for (let i = 0; i < nSine; ++i) this.oscGain[i] *= normalizeGain;

    const ascend = (a, b) => a - b;
    const descend = (a, b) => b - a;
    if (sort) {
      envAttack.sort(descend);
      envDecay.sort(descend);
    }

    for (let i = 0; i < nSine; ++i) {
      const phase = rng.number();
      this.osc[i] = new BiquadOsc(oscFreq[i], phase);
      this.env[i] = new ExpADEnvelope(envAttack[i], envDecay[i]);
    }
  }

  process() {
    let sum = 0;
    for (let i = 0; i < this.osc.length; ++i) {
      sum += this.oscGain[i] * this.env[i].process() * this.osc[i].process();
    }
    return sum;
  }
}

class CutoffEnvelope {
  constructor() { this.reset(8000 / 48000, 1024); }

  reset(base, decayTo, noteSamples) {
    this.vExp = clamp(base, 0, 0.4999);
    this.decay = Math.pow(decayTo, 1.0 / noteSamples);

    this.vLin = this.vExp;
    this.slope = (1 - decayTo) * this.vExp / noteSamples;
  }

  process(curve) {
    this.vExp *= this.decay;
    this.vLin = Math.max(this.vLin - this.slope, 0);
    return lerp(this.vExp, this.vLin, curve);
  }
}

function process(upRate, pv, dsp) {
  if (++dsp.phase >= dsp.periodSamples) dsp.phase = 0;

  let sig = dsp.wavetable[dsp.phase];

  let index = Math.floor((dsp.fmIndex * sig + 1) * dsp.phase) % dsp.periodSamples;
  if (index < 0) index += dsp.periodSamples;
  sig = dsp.wavetable[index];

  if (pv.oscPolySineMix > 0) sig = lerp(sig, dsp.multisine.process(), pv.oscPolySineMix);

  sig *= dsp.gainEnv;
  dsp.gainEnv *= dsp.gainDecay;

  const cutoff
    = dsp.cutoffSmoother.process(dsp.cutoffEnv.process(pv.filterCutoffDecayCurve));
  sig = dsp.filter.process(sig, cutoff, pv.filterResonance, 1);

  if (pv.dcHighpassHz > 0) sig = dsp.dcHighpass.hp(sig);
  return sig;
}

function setNote(upRate, pv, dsp, notePeriodSamples, noteDurationSamples, startPhase) {
  dsp.phase = Math.max(0, Math.floor(startPhase * notePeriodSamples));
  dsp.periodSamples = notePeriodSamples;
  dsp.fmIndex = pv.fmIndex;

  dsp.wavetable.length = dsp.periodSamples;
  for (let idx = 0; idx < dsp.wavetable.length; ++idx) {
    dsp.wavetable[idx] = computePolynomial(idx / dsp.periodSamples, pv.polynomial);
    if (pv.saturationGain > 1) {
      dsp.wavetable[idx] = Math.tanh(pv.saturationGain * dsp.wavetable[idx]);
    }
  }
  const tableMax = dsp.wavetable.reduce((p, c) => Math.max(p, Math.abs(c)), 0);
  if (tableMax >= Number.EPSILON) {
    for (let idx = 0; idx < dsp.wavetable.length; ++idx) dsp.wavetable[idx] /= tableMax;
  }

  const dc = dsp.wavetable.reduce((p, c) => p + c, 0) / dsp.wavetable.length;
  for (let idx = 0; idx < dsp.wavetable.length; ++idx) dsp.wavetable[idx] -= dc;

  dsp.gainEnv = 1;
  dsp.gainDecay = Math.pow(dsp.decayTo, 1.0 / noteDurationSamples);

  // MultiSine oscillator.
  const multiSineBaseFreq
    = pv.oscSinePitchMod == 0 ? (1 / dsp.periodSamples) : dsp.periodSamples / upRate;
  dsp.multisine = new MultiSine(
    64,
    dsp.rngStereo,
    multiSineBaseFreq * dsp.oscSinePitch,
    upRate * 0.01,
    upRate * pv.oscSineDecaySeconds,
    false,
  );

  // Filter.
  const randFloat = (low, high) => uniformFloatMap(dsp.rng.number(), low, high);
  dsp.filter.reset();
  let cutoffNormalized = dsp.cutoffRatio
    / lerp(dsp.longestPeriodSamples, dsp.periodSamples, pv.filterCutoffKeyFollow);
  dsp.cutoffEnv.reset(
    cutoffNormalized, dsp.filterCutoffDecayTo * randFloat(0.125, 1), noteDurationSamples);

  // DC highpass.
  dsp.dcHighpass.reset();
}

function randomChord(pv, dsp, chordMaxOctave) {
  const randInt = (low, high) => uniformIntMap(dsp.rngStereo.number(), low, high);

  let chord = [];
  let gain = [];
  for (let idx = 0; idx < dsp.chordRatio.length; ++idx) {
    let baseRatio = dsp.chordRatio[idx];
    const fallbackRatio = Math.round(dsp.rootPeriodSamples * baseRatio);
    if (fallbackRatio < 2) continue;

    // Try several times until `period` is sufficiently large.
    let period;
    for (let i = 0; i < 4; ++i) {
      const octaveShift = idx < 1 ? 1 : 2 ** randInt(0, -chordMaxOctave);
      period = Math.round(dsp.rootPeriodSamples * baseRatio * octaveShift);
      if (period >= 2) break;
    }
    if (period < 2) period = fallbackRatio;

    chord.push(period);
    gain.push((period / dsp.rootPeriodSamples) ** -Math.log2(pv.chordGainSlope));
  }

  const sum = gain.reduce((p, c) => p + c, 0);
  if (sum > 0) {
    for (let i = 0; i < gain.length; ++i) gain[i] /= sum;
  }

  return chord.map((v, i) => { return {gain: gain[i], period: v}; });
}

function processLimiter(upRate, pv, sound) {
  const limiter = new Limiter(
    Math.floor(upRate * pv.limiterAttackSeconds), 0, 0, pv.limiterThreshold);

  // Discard latency part without changing the length of `sound`.
  if (limiter.latency <= sound.length) {
    for (let i = 0; i < limiter.latency; ++i) limiter.process(sound[i]);

    for (let i = limiter.latency; i < sound.length; ++i) {
      sound[i - limiter.latency] = limiter.process(sound[i]);
    }

    for (let i = 0; i < limiter.latency; ++i) {
      sound[sound.length - limiter.latency + i] = limiter.process(0);
    }
  } else {
    for (let i = 0; i < sound.length; ++i) limiter.process(sound[i]);

    const preFillLength = limiter.length - sound.length;
    for (let i = 0; i < preFillLength; ++i) limiter.process(0);

    for (let i = 0; i < sound.length; ++i) sound[i] = limiter.process(0);
  }
}

onmessage = async (event) => {
  const pv = event.data; // Parameter values.
  if (pv.polynomial === undefined) pv.polynomial = [];

  const upFold = parseInt(menuitems.oversampleItems[pv.overSample]);
  const upRate = upFold * pv.sampleRate;

  const renderSamples = Math.floor(upRate * pv.renderDuration);

  let dsp = {};

  const stereoSeed = 17;
  dsp.rng = new PcgRandom(BigInt(pv.seed)); // Linked between channels.
  dsp.rngStereo = new PcgRandom(BigInt(pv.seed + pv.channel * stereoSeed));

  const rootHz = pv.frequencyHz * 2 ** pv.oscOctave;
  dsp.rootPeriodSamples = Math.max(2, upRate / rootHz);
  dsp.wavetable = new Array(1024).fill(0);
  dsp.oscSinePitch = 2 ** (pv.oscSinePitch / 12);

  dsp.cutoffRatio = 2 ** pv.filterCutoffOctave;
  dsp.cutoffEnv = new CutoffEnvelope();
  dsp.cutoffSmoother = new EMAFilter();
  dsp.cutoffSmoother.setCutoffFromTime(64 / 48000 * upRate);
  dsp.filter = selectFilter(upRate, pv.filterType, pv.filterCascade);

  dsp.decayTo = 10 ** (-3 * renderSamples / (pv.noteDecayT60 * upRate));
  dsp.filterCutoffDecayTo = pv.filterCutoffDecayT60 >= 100
    ? 1
    : 10 ** (-3 * renderSamples / (pv.filterCutoffDecayT60 * upRate));

  dsp.dcHighpass = new SVF(pv.dcHighpassHz / upRate, Math.SQRT1_2);

  // Process.
  const scale = constructIntJustScale(2, -24, 1, pv.chordNotes);
  dsp.chordRatio = scale.map(period => period / scale[0]);

  let chord;
  if (pv.chordPitchStackUp <= 0) {
    chord = randomChord(pv, dsp, pv.chordMaxOctave);
  } else {
    dsp.chordRatio.pop();
    const baseRatio = dsp.chordRatio.slice(1);
    for (let idx = 1; idx < pv.chordPitchStackUp; ++idx) {
      const lastRatio = dsp.chordRatio.at(-1);
      dsp.chordRatio = dsp.chordRatio.concat(baseRatio.map(v => lastRatio * v));
    }
    chord = randomChord(pv, dsp, 0);
  }

  const arpeggioDirection = menuitems.arpeggioDirectionItems[pv.arpeggioDirection];
  if (arpeggioDirection === "Down") {
    chord.sort((a, b) => a.period - b.period);
  } else if (arpeggioDirection === "Random") {
    // Lowest note (root) comes first.
    let root = chord.reduce((i, _, j, arr) => arr[i].period > arr[j].period ? i : j, 0);
    if (root != 0) [chord[0], chord[root]] = [chord[root], chord[0]];
    shuffleArray(dsp.rngStereo, chord, 1, chord.length);
  } else { // arpeggioDirection === "Up", or default.
    chord.sort((a, b) => b.period - a.period);
  }

  dsp.longestPeriodSamples = chord[0].period;

  let sound = new Array(renderSamples).fill(0);
  let startIndex = 0;
  const getPhase = (phase) => {
    if (pv.chordPhaseOffset == 0) return phase;
    if (pv.chordPhaseOffset > 0) return pv.chordPhaseOffset * phase;
    const phi = -pv.chordPhaseOffset * dsp.rngStereo.number();
    return phi - Math.floor(phi);
  };
  for (let note = 0; note < chord.length; ++note) {
    const phase = getPhase(note / chord.length);
    const duration = sound.length - startIndex;
    for (let unison = 0; unison < pv.nUnison; ++unison) {
      const ratio = pv.nUnison <= 1 ? 1 : unison / (pv.nUnison - 1);

      // `pv.unisonDetuneType` relates to `unisonDetuneTypeItems` in `menuitems.js`.
      const detuneCent
        = (pv.unisonDetuneType === 0 ? ratio : unison) * pv.unisonDetuneCent;
      const period = Math.floor(chord[note].period * 0.5 ** (detuneCent / 1200));
      if (period <= 1) break;

      const phs = phase + pv.unisonPhaseSpread * ratio;
      setNote(upRate, pv, dsp, period, duration, phs - Math.floor(phs));

      for (let i = startIndex + 1; i < sound.length; ++i) {
        sound[i] += process(upRate, pv, dsp) * chord[note].gain;
      }
    }

    startIndex += uniformIntMap(
      dsp.rngStereo.number(), 0, Math.floor(upRate * pv.chordRandomStartSeconds));
  }

  if (pv.limiterEnable === 1) processLimiter(upRate, pv, sound);
  sound = downSampleLinearPhase(sound, upFold);

  postMessage({sound: sound});
}
