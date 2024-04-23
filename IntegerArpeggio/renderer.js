// Copyright Takamitsu Endo
// SPDX-License-Identifier: Apache-2.0

import {Limiter} from "../common/dsp/limiter.js";
import {downSampleLinearPhase} from "../common/dsp/multirate.js";
import {selectFilter} from "../common/dsp/resonantfilter.js";
import {constructIntJustScale} from "../common/dsp/tuning.js"
import {
  clamp,
  computePolynomial,
  lerp,
  uniformDistributionMap,
  uniformIntDistributionMap
} from "../common/util.js";
import {PcgRandom} from "../lib/pcgrandom/pcgrandom.js";

import * as menuitems from "./menuitems.js";

class CutoffEnvelope {
  constructor() { this.reset(8000 / 48000, 1024); }

  reset(base, decayTo, periodSamples) {
    this.vExp = clamp(base, 0, 0.4999);
    this.decay = Math.pow(decayTo, 1.0 / periodSamples);

    this.vLin = this.vExp;
    this.slope = (1 - decayTo) * this.vExp / periodSamples;
  }

  process(curve) {
    this.vExp *= this.decay;
    this.vLin = Math.max(this.vLin - this.slope, 0);
    return lerp(this.vExp, this.vLin, curve);
  }
}

function process(upRate, pv, dsp) {
  if (++dsp.phase >= dsp.periodSamples) {
    dsp.phase = 0;

    if (++dsp.decayCounter > pv.fmUpdateCycle) {
      dsp.decayCounter = 0;
      dsp.fmIndex *= dsp.fmDecay;
    }
  }

  let sig = dsp.wavetable[dsp.phase];

  let index = Math.floor((dsp.fmIndex * sig + 1) * dsp.phase) % dsp.periodSamples;
  if (index < 0) index += dsp.periodSamples;
  sig = dsp.wavetable[index];

  sig *= dsp.gainEnv;
  dsp.gainEnv *= dsp.gainDecay;

  if (pv.useFilter) {
    const cutoff = dsp.cutoffEnv.process(pv.filterCutoffDecayCurve);
    sig = dsp.filter.process(sig, cutoff, pv.filterResonance, 1);
  }

  return sig;
}

function setNote(upRate, pv, dsp, notePeriodSamples) {
  dsp.phase = 0;
  dsp.periodSamples = notePeriodSamples;
  dsp.phaseScale = 1 / (Math.exp(4 * pv.oscSync) * dsp.periodSamples);
  dsp.fmIndex = pv.fmIndex;

  dsp.decayCounter = 0;
  dsp.fmDecay
    = Math.pow(pv.fmDecay, pv.fmUpdateCycle * dsp.periodSamples / dsp.noteSamples);

  dsp.wavetable.length = dsp.periodSamples;
  for (let idx = 0; idx < dsp.wavetable.length; ++idx) {
    dsp.wavetable[idx] = computePolynomial(idx * dsp.phaseScale, pv.a);
    if (pv.saturationGain > 1) {
      dsp.wavetable[idx] = Math.tanh(pv.saturationGain * dsp.wavetable[idx]);
    }
  }
  const tableMax = dsp.wavetable.reduce((p, c) => Math.max(p, Math.abs(c)), 0);
  if (tableMax >= Number.EPSILON) {
    for (let idx = 0; idx < dsp.wavetable.length; ++idx) dsp.wavetable[idx] /= tableMax;
  }

  if (pv.removeDirectCurrent) {
    const dc = dsp.wavetable.reduce((p, c) => p + c, 0) / dsp.wavetable.length;
    for (let idx = 0; idx < dsp.wavetable.length; ++idx) dsp.wavetable[idx] -= dc;
  }

  dsp.gainEnv = 1;
  dsp.gainDecay = Math.pow(pv.arpeggioDecayTo, 1.0 / dsp.noteSamples);

  // Filter.
  const randFloat = (low, high) => uniformDistributionMap(dsp.rng.number(), low, high);

  dsp.filter.reset();
  let cutoffNormalized = dsp.cutoffRatio
    / lerp(dsp.longestPeriodSamples, dsp.periodSamples, pv.filterCutoffKeyFollow);
  dsp.cutoffEnv.reset(
    cutoffNormalized, pv.filterCutoffDecayTo * randFloat(0.125, 1), dsp.noteSamples);
}

function randomChord(pv, dsp, rootPeriodSamples) {
  const randInt
    = (low, high) => uniformIntDistributionMap(dsp.rngStereo.number(), low, high);

  let chord = [rootPeriodSamples];
  let gain = [1];
  for (let idx = 1; idx < pv.chordNotePerSection; ++idx) {
    const index = randInt(0, dsp.scaleRatio.length - 1);
    const ratio = dsp.scaleRatio[index] * 2 ** randInt(0, pv.chordMaxOctave);
    const period = Math.round(rootPeriodSamples / ratio);
    if (period <= 2) break;
    chord.push(period);
    gain.push(ratio ** Math.log2(pv.chordGainSlope));
  }

  const sum = gain.reduce((p, c) => p + c, 0);
  if (sum > 0) {
    for (let i = 0; i < gain.length; ++i) gain[i] /= sum;
  }

  // // Maybe add an option to toggle this code path.
  // // Random gain.
  // let gain = new Array(chord.length).fill();
  // for (let idx = 0; idx < gain.length; ++idx) {
  //   gain[idx] = dsp.rngStereo.number();
  // }
  // gain.sort().reverse();

  return chord.map((v, i) => { return {gain: gain[i], period: v}; });
}

function processLimiter(upRate, pv, sound) {
  const limiter = new Limiter(
    Math.floor(upRate * pv.limiterAttackSeconds), 0, 0, pv.limiterThreshold);

  // Followin code is discarding latency part without changing the length of `sound`.
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
  if (pv.a === undefined) pv.a = [];
  if (pv.oscSync < Number.EPSILON) pv.oscSync = Number.EPSILON;

  const upFold = parseInt(menuitems.oversampleItems[pv.overSample]);
  const upRate = upFold * pv.sampleRate;

  const basePeriod = parseInt(menuitems.basePeriodItems[pv.basePeriod]);

  let dsp = {};

  const stereoSeed = 17;
  dsp.rng = new PcgRandom(BigInt(pv.seed + pv.channel));
  dsp.rngStereo = new PcgRandom(BigInt(pv.seed + pv.channel * stereoSeed));

  dsp.wavetable = new Array(1024).fill(0);
  dsp.periodSamples = 0;

  const getArpeggioScale = (arpeggioScaleIndex) => {
    switch (menuitems.arpeggioScaleItems[arpeggioScaleIndex]) {
      default:
      case "\"Notes in Scale\" List":
        return constructIntJustScale(
          basePeriod, pv.octaveStart, pv.octaveRange, pv.arpeggioNotes);
      case "Harmonic Series": {
        const start = Math.max(2, basePeriod * 2 ** -pv.octaveStart);
        const end = Math.max(2, start * 2 ** -pv.octaveRange);
        console.log(basePeriod, start, end);
        let scale = [];
        let overtone = 1;
        let intPeriod = start;
        while (intPeriod >= end) {
          scale.push(intPeriod);
          do {
            intPeriod = Math.round(start / ++overtone);
          } while (scale.at(-1) == intPeriod);
        }
        return scale;
      }
    }
  };
  dsp.targetScale = getArpeggioScale(pv.arpeggioScale);
  console.log(basePeriod, dsp.targetScale);
  dsp.longestPeriodSamples = dsp.targetScale[0];

  dsp.cutoffRatio = 2 ** pv.filterCutoffOctave;
  dsp.cutoffEnv = new CutoffEnvelope();
  dsp.filter = selectFilter(upRate, pv.filterType, pv.filterCascade);

  // Process.
  const getScaleRatio = (pitchScaleIndex) => {
    const wrapOct = ratio => Math.log2(ratio) % 1;

    const scaleLabel = menuitems.pitchScaleItems[pitchScaleIndex];
    switch (scaleLabel) {
      case "\"Notes in Scale\" List": {
        const scale = constructIntJustScale(basePeriod, -16, 1, pv.arpeggioNotes);
        return scale.map(period => period / scale[0]);
      }
      case "Just Intonation [0, 2, 5, 7]":
        return [1 / 1, 9 / 8, 4 / 3, 3 / 2];
      case "Just Intonation [0, 3, 7, 10]":
        return [1 / 1, 6 / 5, 3 / 2, 9 / 5];
      case "Just Intonation [0, 4, 7, 11]":
        return [1 / 1, 5 / 4, 3 / 2, 15 / 8];
      case "ET5":
        return [0, 2.4, 4.8, 7.2, 9.6].map(semitone => 2 ** (semitone / 12));
      case "Harmonic Series <= 16":
        return new Array(16).fill(0).map((_, i) => i + 1);
      case "Harmonic Series Odd <= 15":
        return new Array(8).fill(0).map((_, i) => 2 * i + 1);
      case "Pythagorean [0, 2, 4, 7, 9]":
        return [0, 1, 2, 3, 4].map(x => 2 ** wrapOct(1.5 ** x));
      case "Pythagorean [0, 3, 5, 8, 10]":
        return [0, 1, 2, 3, 4].map(x => 2 ** wrapOct(1.5 ** -x));
      case "Detuned Major":
        return [0, 2, 2.4, 4, 4.8, 7.02].map(v => 2 ** (v / 12));
    }
    return [1, 2, 4, 8]; // Default to octave.
  };
  dsp.scaleRatio = getScaleRatio(pv.chordPitchScale);

  dsp.noteSamples = Math.round(upRate * pv.durationSecondPerSection);

  let marginSamples = pv.addSpace ? Math.floor(upRate * 0.01) : 0;
  const nSection = dsp.targetScale.length;
  const fadeOutLength = Math.floor(0.01 * upRate);
  const noteDuration = dsp.noteSamples + marginSamples;
  const renderDuration = noteDuration * nSection;
  let sound = new Array(Math.floor(renderDuration)).fill(0);
  for (let sct = 0; sct < nSection; ++sct) {
    const sectionStart = noteDuration * sct;

    const rootPeriodSamples = dsp.targetScale[sct];
    const chord = randomChord(pv, dsp, rootPeriodSamples);

    for (let note = 0; note < chord.length; ++note) {
      setNote(upRate, pv, dsp, chord[note].period);

      const gain = chord[note].gain;
      for (let i = 0; i < dsp.noteSamples; ++i) {
        const index = sectionStart + i;
        sound[index] += process(upRate, pv, dsp) * gain;
      }
    }
    for (let i = 0; i < fadeOutLength; ++i) {
      const index = sectionStart + dsp.noteSamples - i - 1;
      sound[index] *= Math.sin(Math.PI * 0.5 * i / fadeOutLength);
    }

    // // Normalize.
    // let maxAmp = 0;
    // for (let i = 0; i < dsp.noteSamples; ++i) {
    //   const index = sectionStart + i;
    //   const absed = Math.abs(sound[index]);
    //   if (maxAmp < absed) maxAmp = absed;
    // }
    // if (maxAmp >= Number.MIN_VALUE) {
    //   for (let i = 0; i < dsp.noteSamples; ++i) {
    //     const index = sectionStart + i;
    //     sound[index] /= maxAmp;
    //   }
    // }
  }

  if (pv.limiterEnable === 1) processLimiter(upRate, pv, sound);
  sound = downSampleLinearPhase(sound, upFold);

  postMessage({sound: sound});
}
