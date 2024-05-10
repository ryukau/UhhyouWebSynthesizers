// Copyright Takamitsu Endo (ryukau@gmail.com)
// SPDX-License-Identifier: Apache-2.0

import {downSampleLinearPhase} from "../common/dsp/multirate.js";
import {nextPrime} from "../common/dsp/prime.js";
import {computePolynomial, uniformFloatMap, uniformIntMap} from "../common/util.js";
import {PcgRandom} from "../lib/pcgrandom/pcgrandom.js";

import * as menuitems from "./menuitems.js";

const stereoSeed = 65537;

function process(upRate, pv, dsp) {
  if (++dsp.phase >= dsp.cycleSamples) dsp.phase = 0;

  if (--dsp.noteSamples < 0 && dsp.phase == 0) setNote(upRate, pv, dsp, true);

  let sig = dsp.wavetable[dsp.phase];

  let index = Math.floor((dsp.fmIndex * sig + 1) * dsp.phase) % dsp.cycleSamples;
  if (index < 0) index += dsp.cycleSamples;
  sig = dsp.wavetable[index];

  sig *= dsp.gainEnv;
  dsp.gainEnv *= dsp.gainDecay;

  return sig;
}

function setNote(upRate, pv, dsp, isRandomizing) {
  if (pv.enableProgression && dsp.timeInSixteenthNote > dsp.timeOfNextProgression) {
    dsp.timeOfNextProgression = pv.progressionDuration
      * Math.ceil(dsp.timeInSixteenthNote / pv.progressionDuration);
    const index = Math.floor(dsp.rngProgression.number() * dsp.progressionScale.length);
    const octave
      = dsp.progressionScale[index] + uniformIntMap(dsp.rngProgression.number(), -1, 1);
    dsp.progressionPitch = 2 ** octave;

    if (pv.resetArpeggio) {
      dsp.rng = new PcgRandom(BigInt(pv.seed + pv.channel * stereoSeed));
      isRandomizing = false;
    }
  }

  const randInt = (low, high) => uniformIntMap(dsp.rng.number(), low, high);
  const randFloat = (low, high) => uniformFloatMap(dsp.rng.number(), low, high);

  let frequencyHz = dsp.frequencyHz * dsp.progressionPitch;
  let oscSync = pv.oscSync;
  let fmIndex = pv.fmIndex;

  if (isRandomizing) {
    const soIndex = Math.floor(dsp.rng.number() * dsp.scaleOctave.length);
    const octave = dsp.scaleOctave[soIndex] + randInt(-1, pv.pitchOctaveWrap - 1);
    frequencyHz *= 2 ** octave;

    oscSync = randFloat(pv.oscSync, 1);

    fmIndex *= 2 ** randFloat(-1, 1);
  }

  dsp.phase = 0;
  dsp.cycleSamples = Math.max(1, Math.round(upRate / frequencyHz));
  dsp.phaseScale = 1 / (oscSync * dsp.cycleSamples);
  dsp.fmIndex = fmIndex;

  for (let idx = 1; idx < pv.chordNoteCount; ++idx) {
    if (dsp.rng.number() < pv.chordChance) continue;
    dsp.chordPitch.length = idx;
    break;
  }
  const chordMaxOvertone = pv.chordMaxOvertone % Math.ceil(upRate / 2 / frequencyHz);
  for (let idx = 1; idx < dsp.chordPitch.length; ++idx) {
    dsp.chordPitch[idx] = uniformIntMap(dsp.rng.number(), 1, chordMaxOvertone);
  }

  dsp.wavetable.length = dsp.cycleSamples;
  dsp.wavetable.fill(0);
  for (let idx = 0; idx < dsp.wavetable.length; ++idx) {
    for (let j = 0; j < dsp.chordPitch.length; ++j) {
      const phase = idx * dsp.phaseScale * dsp.chordPitch[j];
      dsp.wavetable[idx] += computePolynomial(phase - Math.floor(phase), pv.a);
    }
    dsp.wavetable[idx] /= dsp.chordPitch.length;
  }
  const tableMax = dsp.wavetable.reduce((p, c) => Math.max(p, Math.abs(c)), 0);
  if (tableMax >= Number.EPSILON) {
    for (let idx = 0; idx < dsp.wavetable.length; ++idx) dsp.wavetable[idx] /= tableMax;
  }

  const durMul = randInt(1, pv.arpeggioDurationVariation);
  dsp.timeInSixteenthNote += durMul;
  dsp.noteSamples += dsp.baseNoteDuration
    * (durMul - Math.ceil(dsp.noteSamples / dsp.baseNoteDuration));

  dsp.gainEnv = dsp.rng.number() < pv.arpeggioRestChance ? 0 : 1;
  dsp.gainDecay = Math.pow(pv.arpeggioDecayTo, 1.0 / dsp.noteSamples);
}

function constructScale(pv, scaleIndex) {
  let scaleOct = generateScaleOctave(pv, scaleIndex);

  const maxOvertone = 2 ** Math.floor(pv.pitchVariation);
  let primes = [];
  let p = 2;
  do {
    primes.push(p);
    p = nextPrime(p);
  } while (p < maxOvertone);

  let wrappedOctave = primes.map((v) => Math.log2(v) % 1.0);

  let octave = [];
  const halfRange = pv.pitchDriftCent / 2400;
  for (let idx = 0; idx < pv.equalTemperament; ++idx) {
    let etOct = idx / pv.equalTemperament;

    for (let wpOct of wrappedOctave) {
      let testOct = (etOct + wpOct) % pv.pitchOctaveWrap;
      for (let bucket = 0; bucket < scaleOct.length; ++bucket) {
        if (Math.abs(testOct - scaleOct[bucket]) > halfRange) continue;
        octave.push(testOct);
        break;
      }
    }
  }
  return octave;
}

function iota(n) {
  let array = new Array(n);
  for (let i = 0; i < array.length; ++i) array[i] = i;
  return array;
}

function rangeInt(start, end) {
  let array = new Array(end - start);
  for (let i = 0; i < array.length; ++i) array[i] = start + i;
  return array;
}

function generateScaleOctave(pv, scaleIndex) {
  const scale = menuitems.pitchScaleItems[scaleIndex];
  switch (scale) {
    default:
    case "Chromatic":
      return iota(pv.equalTemperament).map(v => v / pv.equalTemperament);
    case "Octave":
      return [0];
    case "ET 5 Chromatic":
      return [0, 1 / 5, 2 / 5, 3 / 5, 4 / 5];
    case "ET 12 Chromatic":
      return iota(12).map(v => v / 12);
    case "ET 12 Major":
      return [0, 2, 4, 5, 7, 9, 11].map(v => v / 12);
    case "ET 12 Minor":
      return [0, 2, 3, 5, 7, 8, 10].map(v => v / 12);
    case "ET 12 Crowded":
      return [0, 2, 3, 4, 5, 7, 9, 10, 11].map(v => v / 12);
    case "ET 12 Blues":
      return [0, 3, 5, 6, 7, 10].map(v => v / 12);
    case "ET 12 Prometheus":
      return [0, 2, 4, 6, 9, 10].map(v => v / 12);
    case "ET 12 Major Persian":
      return [0, 1, 4, 5, 6, 8, 11].map(v => v / 12);
    case "ET 12 Iwato":
      return [0, 1, 5, 6, 10].map(v => v / 12);
    case "ET 12 Whole Tone 2":
      return [0, 2, 4, 6, 8, 10].map(v => v / 12);
    case "ET 12 Whole Tone 3":
      return [0, 3, 6, 9].map(v => v / 12);
    case "ET 12 Whole Tone 4":
      return [0, 4, 8].map(v => v / 12);
    case "ET 12 Suspended 4":
      return [0, 5, 7].map(v => v / 12);
    case "ET 12 [0, 1, 2, 5, 7]":
      return [0, 1, 2, 5, 7].map(v => v / 12);
    case "ET 12 [0, 1, 2, 3, 6, 8, 10]":
      return [0, 1, 2, 3, 6, 8, 10].map(v => v / 12);
    case "ET 12 [0, 2, 5, 7]":
      return [0, 2, 5, 7].map(v => v / 12);
    case "ET 12 [0, 2, 7, 9]":
      return [0, 2, 7, 9].map(v => v / 12);
    case "ET 12 [0, 3, 4, 5, 7]":
      return [0, 3, 4, 5, 7].map(v => v / 12);
    case "ET 12 [0, 3, 6, 7, 10]":
      return [0, 3, 6, 7, 10].map(v => v / 12);
    case "ET 12 [0, 3, 7]":
      return [0, 3, 7].map(v => v / 12);
    case "ET 12 [0, 5, 7, 10, 11]":
      return [0, 5, 7, 10, 11].map(v => v / 12);
    case "ET 12 [0, 4, 7]":
      return [0, 4, 7].map(v => v / 12);
    case "ET 12 [0, 4, 7, 11, 14, 18, 21]":
      return [0, 4, 7, 11, 14, 18, 21].map(v => v / 12);
    case "ET 12 [0, 7]":
      return [0, 7].map(v => v / 12);
    case "Wild 3":
      return [
        0,    0, 0, 0, 2, 2.2, 2.4,  2.8, 3, 3.2, 3.5, 3.8, 4,  4.2,   4.4,   4.8,
        4.98, 5, 5, 5, 7, 7,   7.02, 7.2, 9, 9.1, 9.4, 9.6, 11, 11.02, 11.04, 11.2,
      ].map(v => v / 12);
    case "Overtone 4 to 7":
      return rangeInt(4, 8).map(v => (Math.log2(v) % 1.0));
    case "Overtone 8 to 15":
      return rangeInt(8, 16).map(v => (Math.log2(v) % 1.0));
    case "Overtone 16 to 31":
      return rangeInt(16, 32).map(v => (Math.log2(v) % 1.0));
    case "The 42 melody":
      return [2, 10, 34, 40, 42].map(v => (Math.log2(v) % 1.0));
  }
  return [0]; // Shouldn't reach here.
}

onmessage = async (event) => {
  const pv = event.data; // Parameter values.
  if (pv.a === undefined) pv.a = [];
  if (pv.oscSync < Number.EPSILON) pv.oscSync = Number.EPSILON;

  const upFold = parseInt(menuitems.oversampleItems[pv.overSample]);
  const upRate = upFold * pv.sampleRate;

  let dsp = {};

  dsp.rngProgression = new PcgRandom(BigInt(pv.seed + pv.channel));
  dsp.rng = new PcgRandom(BigInt(pv.seed + pv.channel * stereoSeed));

  dsp.timeInSixteenthNote = 0;
  dsp.timeOfNextProgression = -1;
  dsp.progressionScale = generateScaleOctave(pv, pv.progressionScale);
  dsp.progressionPitch = 1;

  dsp.frequencyHz = pv.frequencyHz * 2 ** pv.oscOctave;
  dsp.wavetable = new Array(1024).fill(0);
  dsp.chordPitch = new Array(pv.chordNoteCount).fill(0);
  dsp.chordPitch[0] = 1;
  dsp.noteSamples = 0;
  if (pv.tempoBpm <= 0) {
    console.info("Tempo must be positive non 0.");
    postMessage({sound: [0]});
    return;
  }
  dsp.baseNoteDuration = Math.round(upRate * 15 / pv.tempoBpm);
  dsp.scaleOctave = constructScale(pv, pv.pitchScale);
  setNote(upRate, pv, dsp, false);

  // Process.
  let sound
    = new Array(Math.floor(4 * dsp.baseNoteDuration * pv.renderDurationBeat)).fill(0);
  for (let i = 0; i < sound.length; ++i) sound[i] = process(upRate, pv, dsp);
  sound = downSampleLinearPhase(sound, upFold);

  // Post effect.
  let gainEnv = 1;
  let decay = Math.pow(pv.decayTo, 1.0 / sound.length);
  for (let i = 0; i < sound.length; ++i) {
    sound[i] *= gainEnv;
    gainEnv *= decay;
  }

  postMessage({sound: sound});
}
