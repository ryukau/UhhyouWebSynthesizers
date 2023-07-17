// Copyright 2023 Takamitsu Endo
// SPDX-License-Identifier: Apache-2.0

import * as multirate from "../common/dsp/multirate.js";
import {
  exponentialMap,
  uniformDistributionMap,
  uniformIntDistributionMap
} from "../common/util.js";
import {PcgRandom} from "../lib/pcgrandom/pcgrandom.js";

import * as menuitems from "./menuitems.js";
import {computePolynomial, constructIntJustScale} from "./shared.js"

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

  return sig;
}

function setNote(upRate, pv, dsp) {
  dsp.phase = 0;
  dsp.periodSamples = dsp.targetScale[dsp.scaleIndex++];
  dsp.phaseScale = 1 / (Math.exp(4 * pv.oscSync) * dsp.periodSamples);
  dsp.fmIndex = pv.fmIndex;

  dsp.decayCounter = 0;
  dsp.fmDecay
    = Math.pow(pv.fmDecay, pv.fmUpdateCycle * dsp.periodSamples / dsp.baseNoteDuration);

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

  dsp.gainEnv = 1;
  dsp.gainDecay = Math.pow(pv.arpeggioDecayTo, 1.0 / dsp.baseNoteDuration);
}

onmessage = async (event) => {
  const pv = event.data; // Parameter values.
  if (pv.a === undefined) pv.a = [];
  if (pv.oscSync < Number.EPSILON) pv.oscSync = Number.EPSILON;

  const upFold = parseInt(menuitems.oversampleItems[pv.overSample]);
  const upRate = upFold * pv.sampleRate;
  const rng = new PcgRandom(BigInt(pv.seed + pv.channel));

  let dsp = {};
  dsp.wavetable = new Array(1024).fill(0);
  dsp.rng = rng;
  dsp.noteSamples = 0;
  dsp.baseNoteDuration = Math.round(upRate * pv.arpeggioDurationSeconds);
  dsp.targetScale = constructIntJustScale(
    parseInt(menuitems.basePeriodItems[pv.basePeriod]), pv.octaveStart, pv.octaveRange,
    pv.arpeggioNotes);
  dsp.scaleIndex = 0;

  // Process.
  let marginSamples = pv.addSpace ? Math.floor(upRate * 0.01) : 0;
  const noteCount = dsp.targetScale.length;
  const fadeOutLength = Math.floor(0.01 * upRate);
  const noteDuration = dsp.baseNoteDuration + marginSamples;
  const renderDuration = noteDuration * noteCount;
  let sound = new Array(Math.floor(renderDuration)).fill(0);
  for (let note = 0; note < noteCount; ++note) {
    const noteStart = noteDuration * note;

    setNote(upRate, pv, dsp);

    for (let i = 0; i < dsp.baseNoteDuration; ++i) {
      const index = noteStart + i;
      sound[index] = process(upRate, pv, dsp);
    }
    for (let i = 0; i < fadeOutLength; ++i) {
      const index = noteStart + dsp.baseNoteDuration - i - 1;
      sound[index] *= Math.sin(Math.PI * 0.5 * i / fadeOutLength);
    }
  }

  // Down-sample.
  const outputLength = Math.floor(renderDuration / upFold);
  if (upFold == 64) {
    let decimationLowpass = new multirate.SosFilter(multirate.sos64FoldFirstStage);
    let halfband = new multirate.HalfBandIIR();
    let frame = [0, 0];
    for (let i = 0; i < outputLength; ++i) {
      for (let j = 0; j < 2; ++j) {
        for (let k = 0; k < 32; ++k) decimationLowpass.push(sound[64 * i + 32 * j + k]);
        frame[j] = decimationLowpass.output();
      }
      sound[i] = halfband.process(frame[0], frame[1]);
    }
  } else if (upFold == 16) {
    let decimationLowpass = new multirate.SosFilter(multirate.sos16FoldFirstStage);
    let halfband = new multirate.HalfBandIIR();
    let frame = [0, 0];
    for (let i = 0; i < outputLength; ++i) {
      for (let j = 0; j < 2; ++j) {
        for (let k = 0; k < 8; ++k) decimationLowpass.push(sound[16 * i + 8 * j + k]);
        frame[j] = decimationLowpass.output();
      }
      sound[i] = halfband.process(frame[0], frame[1]);
    }
  } else if (upFold == 2) {
    let halfband = new multirate.HalfBandIIR();
    for (let i = 0; i < outputLength; ++i) {
      const hb0 = sound[2 * i];
      const hb1 = sound[2 * i + 1];
      sound[i] = halfband.process(hb0, hb1);
    }
  }
  sound = sound.slice(0, outputLength);

  postMessage(sound);
}
