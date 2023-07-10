// Copyright 2023 Takamitsu Endo
// SPDX-License-Identifier: Apache-2.0

import * as multirate from "../common/dsp/multirate.js";
import {nextPrime} from "../common/dsp/prime.js";
import {
  exponentialMap,
  uniformDistributionMap,
  uniformIntDistributionMap
} from "../common/util.js";
import {PcgRandom} from "../lib/pcgrandom/pcgrandom.js";

import * as menuitems from "./menuitems.js";
import {computePolynomial} from "./polynomial.js"

function process(upRate, pv, dsp) {
  if (++dsp.phase >= dsp.cycleSamples) dsp.phase = 0;

  if (--dsp.noteSamples < 0 && dsp.phase == 0) setNote(upRate, pv, dsp, true);
  // if (--dsp.noteSamples < 0) setNote(upRate, pv, dsp, true);

  let sig = dsp.wavetable[dsp.phase];

  let index = Math.floor((dsp.fmIndex * sig + 1) * dsp.phase) % dsp.cycleSamples;
  if (index < 0) index += dsp.cycleSamples;
  sig = dsp.wavetable[index];

  sig *= dsp.gainEnv;
  dsp.gainEnv *= dsp.gainDecay;

  return sig;
}

function setNote(upRate, pv, dsp, isRandomizing) {
  const randInt = (low, high) => uniformIntDistributionMap(dsp.rng.number(), low, high);
  const randFloat = (low, high) => uniformDistributionMap(dsp.rng.number(), low, high);

  let frequencyHz = pv.frequencyHz;
  let oscSync = pv.oscSync;
  let fmIndex = pv.fmIndex;

  if (isRandomizing) {
    const soIndex = Math.floor(dsp.rng.number() * dsp.scaleOctave.length);
    const octave = dsp.scaleOctave[soIndex] + randInt(-1, 1);
    frequencyHz *= 2 ** octave;

    oscSync = randFloat(pv.oscSync, 1);

    fmIndex *= 2 ** randFloat(-1, 1);
  }

  dsp.phase = 0;
  dsp.cycleSamples = Math.round(upRate / frequencyHz);
  dsp.phaseScale = 1 / (oscSync * dsp.cycleSamples);
  dsp.fmIndex = fmIndex;

  dsp.wavetable.length = dsp.cycleSamples;
  for (let idx = 0; idx < dsp.wavetable.length; ++idx) {
    dsp.wavetable[idx] = computePolynomial(idx * dsp.phaseScale, pv.a);
  }
  const tableMax = dsp.wavetable.reduce((p, c) => Math.max(p, Math.abs(c)), 0);
  if (tableMax >= Number.EPSILON) {
    for (let idx = 0; idx < dsp.wavetable.length; ++idx) dsp.wavetable[idx] /= tableMax;
  }

  const durMul = randInt(1, pv.arpeggioDurationVariation);
  dsp.noteSamples += dsp.baseNoteDuration
    * (durMul - Math.ceil(dsp.noteSamples / dsp.baseNoteDuration));

  dsp.gainEnv = 1;
  dsp.gainDecay = Math.pow(pv.arpeggioDecayTo, 1.0 / dsp.noteSamples);
}

function constructScale(pv) {
  let scaleOct = generateScaleOctave(pv);

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

function generateScaleOctave(pv) {
  const scale = menuitems.pitchScaleItems[pv.pitchScale];
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
    case "ET 12 [0, 2, 7, 9]":
      return [0, 2, 7, 9].map(v => v / 12);
    case "ET 12 [0, 3, 4, 5, 7]":
      return [0, 3, 4, 5, 7].map(v => v / 12);
  }
  return [0]; // Shouldn't reach here.
}

onmessage = async (event) => {
  const pv = event.data; // Parameter values.
  if (pv.a === undefined) pv.a = [];
  if (pv.oscSync < Number.EPSILON) pv.oscSync = Number.EPSILON;

  const upFold = parseInt(menuitems.oversampleItems[pv.overSample]);
  const upRate = upFold * pv.sampleRate;
  const rng = new PcgRandom(BigInt(pv.seed + pv.channel * 65537));

  let dsp = {};
  dsp.wavetable = new Array(1024).fill(0);
  dsp.rng = rng;
  dsp.noteSamples = 0;
  dsp.baseNoteDuration = Math.round(upRate * pv.arpeggioDurationSeconds);
  dsp.scaleOctave = constructScale(pv);
  setNote(upRate, pv, dsp, false);

  // Process.
  let sound = new Array(Math.floor(pv.sampleRate * pv.renderDuration)).fill(0);
  if (upFold == 64) {
    let decimationLowpass = new multirate.SosFilter(multirate.sos64FoldFirstStage);
    let halfband = new multirate.HalfBandIIR();
    let frame = [0, 0];
    for (let i = 0; i < sound.length; ++i) {
      for (let j = 0; j < 2; ++j) {
        for (let k = 0; k < 32; ++k) decimationLowpass.push(process(upRate, pv, dsp));
        frame[j] = decimationLowpass.output();
      }
      sound[i] = halfband.process(frame[0], frame[1]);
    }
  } else if (upFold == 16) {
    let decimationLowpass = new multirate.SosFilter(multirate.sos16FoldFirstStage);
    let halfband = new multirate.HalfBandIIR();
    let frame = [0, 0];
    for (let i = 0; i < sound.length; ++i) {
      for (let j = 0; j < 2; ++j) {
        for (let k = 0; k < 8; ++k) decimationLowpass.push(process(upRate, pv, dsp));
        frame[j] = decimationLowpass.output();
      }
      sound[i] = halfband.process(frame[0], frame[1]);
    }
  } else if (upFold == 2) {
    let halfband = new multirate.HalfBandIIR();
    for (let i = 0; i < sound.length; ++i) {
      const hb0 = process(upRate, pv, dsp);
      const hb1 = process(upRate, pv, dsp);
      sound[i] = halfband.process(hb0, hb1);
    }
  } else {
    for (let i = 0; i < sound.length; ++i) sound[i] = process(upRate, pv, dsp);
  }

  // Post effect.
  let gainEnv = 1;
  let decay = Math.pow(pv.decayTo, 1.0 / sound.length);
  for (let i = 0; i < sound.length; ++i) {
    sound[i] *= gainEnv;
    gainEnv *= decay;
  }

  postMessage(sound);
}
