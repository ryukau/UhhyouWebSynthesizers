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
import {computePolynomial, justIntonationTable} from "./shared.js"

function process(upRate, pv, dsp) {
  if (++dsp.phase >= dsp.periodSamples) dsp.phase = 0;

  let sig = dsp.wavetable[dsp.phase];

  let index = Math.floor((dsp.fmIndex * sig + 1) * dsp.phase) % dsp.periodSamples;
  if (index < 0) index += dsp.periodSamples;
  sig = dsp.wavetable[index];

  sig *= dsp.gainEnv;
  dsp.gainEnv *= dsp.gainDecay;

  return sig;
}

function setNote(upRate, pv, dsp) {
  let oscSync = pv.oscSync;
  let fmIndex = pv.fmIndex;

  dsp.phase = 0;
  dsp.periodSamples = dsp.targetScale[dsp.scaleIndex++];
  dsp.phaseScale = 1 / (oscSync * dsp.periodSamples);
  dsp.fmIndex = fmIndex;

  dsp.wavetable.length = dsp.periodSamples;
  for (let idx = 0; idx < dsp.wavetable.length; ++idx) {
    dsp.wavetable[idx] = computePolynomial(idx * dsp.phaseScale, pv.a);
  }
  const tableMax = dsp.wavetable.reduce((p, c) => Math.max(p, Math.abs(c)), 0);
  if (tableMax >= Number.EPSILON) {
    for (let idx = 0; idx < dsp.wavetable.length; ++idx) dsp.wavetable[idx] /= tableMax;
  }

  dsp.noteSamples += dsp.baseNoteDuration - dsp.noteSamples;

  dsp.gainEnv = 1;
  dsp.gainDecay = Math.pow(pv.arpeggioDecayTo, 1.0 / dsp.noteSamples);
}

function constructScale(pv) {
  const basePeriod = parseInt(menuitems.basePeriodItems[pv.basePeriod]);
  const startPeriod = basePeriod * (1 << (-pv.octaveStart));
  const endPeriod = Math.max(2, startPeriod / (1 << (pv.octaveRange)));

  const justSt12 = justIntonationTable.filter((_, index) => pv.arpeggioNotes[index] > 0)
                     .map(v => 12 * Math.log2(v));

  let periods = [startPeriod];
  let currentPeriod = startPeriod;
  let currentSt12 = 12 * (Math.log2(startPeriod / currentPeriod) % 1.0);
  let jiIndex = 0;

  while (currentPeriod >= endPeriod) {
    let nextSt12 = 12 * (Math.log2(startPeriod / (currentPeriod - 1)) % 1.0);
    if (nextSt12 == 0) nextSt12 = 12;
    const midSt12 = (currentSt12 + nextSt12) / 2;

    if (currentSt12 <= justSt12[jiIndex] && justSt12[jiIndex] < midSt12) {
      if (periods.at(-1) != currentPeriod) periods.push(currentPeriod);
      do {
        if (++jiIndex >= justSt12.length) jiIndex = 0;
      } while (currentSt12 <= justSt12[jiIndex] && justSt12[jiIndex] < midSt12);
    }

    if (midSt12 <= justSt12[jiIndex] && justSt12[jiIndex] < nextSt12) {
      periods.push(currentPeriod - 1);
      do {
        if (++jiIndex >= justSt12.length) jiIndex = 0;
      } while (midSt12 <= justSt12[jiIndex] && justSt12[jiIndex] < nextSt12);
    }

    --currentPeriod;
    currentSt12 = nextSt12 == 12 ? 0 : nextSt12;
  }
  return periods;
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

  dsp.targetScale = constructScale(pv);
  dsp.scaleIndex = 0;

  // Process.
  const noteCount = dsp.targetScale.length;
  const fadeOutLength = Math.floor(0.01 * upRate);
  const renderDuration = dsp.baseNoteDuration * noteCount;
  let sound = new Array(Math.floor(renderDuration)).fill(0);
  for (let note = 0; note < noteCount; ++note) {
    const noteStart = dsp.baseNoteDuration * note;

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
