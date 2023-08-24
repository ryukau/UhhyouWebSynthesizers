// Copyright 2023 Takamitsu Endo
// SPDX-License-Identifier: Apache-2.0

import {MultiTapDelay} from "../common/dsp/delay.js";
import {DoubleEmaADEnvelope} from "../common/dsp/envelope.js";
import {FeedbackDelayNetwork} from "../common/dsp/fdn.js";
import {MovingAverageFilter} from "../common/dsp/limiter.js";
import {downSampleIIR} from "../common/dsp/multirate.js";
import {SlopeFilter} from "../common/dsp/slopefilter.js";
import {BiquadResonator, ComplexResonator, SVF} from "../common/dsp/svf.js";
import {
  exponentialMap,
  lerp,
  normalDistributionMap,
  uniformDistributionMap
} from "../common/util.js";
import {PcgRandom} from "../lib/pcgrandom/pcgrandom.js";

import * as menuitems from "./menuitems.js";

const exp2Scaler = Math.log(2);

function createNoisyTable(upRate, pv, dsp) {
  const cycleSamples = Math.floor(upRate / pv.baseHz);
  let table = new Array(cycleSamples);
  let filter = new MovingAverageFilter(Math.ceil(cycleSamples / pv.oscTone));

  for (let i = 0; i < table.length; ++i) {
    table[i] = normalDistributionMap(dsp.rng.number(), dsp.rng.number(), 0, 1 / 3);
  }

  // First pass to fill moving average buffer.
  for (let i = 0; i < table.length; ++i) filter.processNaive(table[i]);
  for (let i = 0; i < table.length; ++i) table[i] = filter.processNaive(table[i]);

  const dc = table.reduce((p, c) => p + c, 0) / table.length;
  for (let i = 0; i < table.length; ++i) table[i] -= dc;

  return table;
}

function process(upRate, pv, dsp) {
  let sig = dsp.table[dsp.phase];

  if (++dsp.phase >= dsp.table.length) dsp.phase = 0;
  let index = Math.floor((pv.fmIndex * sig + 1) * dsp.phase) % dsp.table.length;
  if (index < 0) index += dsp.table.length;
  sig = dsp.oscGain * dsp.table[index];
  dsp.oscGain *= dsp.oscDecay;

  const spread = dsp.spreadDelay.processSplit(sig);

  let sum = 0;
  for (let idx = 0; idx < dsp.resonators.length; ++idx) {
    const env = dsp.resonatorEnv[idx].process();
    if (env <= Number.EPSILON) continue;
    const cutoffMod = Math.exp(
      dsp.resonatorCutMod[idx] * env + dsp.resonatorModGain[idx] * spread[idx]);

    if (spread[idx] !== 0) dsp.resonatorModGain[idx] *= dsp.resonatorModDecay[idx];

    let cmplx = dsp.resonators[idx][dsp.resonatorFunc](
      spread[idx], dsp.resonatorCutBase[idx] * cutoffMod, pv.resonatorBandWidth);
    sum += env * lerp(cmplx.re, cmplx.im, pv.realImaginaryMix);
  }
  if (dsp.resonators.length > 0) sig = sum;

  if (pv.toneSlope < 1) sig = dsp.slopeFilter.process(sig);
  sig += pv.reverbMix * dsp.fdn.process(sig, pv.reverbFeedback);
  if (pv.dcHighpassHz > 0) sig = dsp.dcHighpass.hp(sig);
  return sig;
}

onmessage = async (event) => {
  const pv = event.data; // Parameter values.

  const upFold = parseInt(menuitems.oversampleItems[pv.overSample]);
  const upRate = upFold * pv.sampleRate;

  const stereoSeed = 23;
  const rng = new PcgRandom(BigInt(pv.seed + pv.channel * stereoSeed));

  let dsp = {};
  dsp.oscDecay = Math.pow(Number.EPSILON, 1 / (upRate * pv.oscDecaySeconds));
  dsp.oscGain = 1;

  dsp.rng = rng;
  dsp.slopeFilter = new SlopeFilter(Math.floor(Math.log2(24000 / 1000)));
  dsp.slopeFilter.setCutoff(upRate, 1000, pv.toneSlope, true);
  dsp.dcHighpass = new SVF(pv.dcHighpassHz / upRate, Math.SQRT1_2);

  dsp.resonators = [];
  dsp.resonatorFunc = pv.resonatorNormalize === 0 ? "process" : "processNormalized";
  dsp.resonatorCutBase = [];
  dsp.resonatorCutMod = [];
  dsp.resonatorEnv = [];
  dsp.resonatorModGain = [];
  dsp.resonatorModDecay = [];
  const envTimeBase = pv.envelopeDecaySeconds * 2 ** pv.envelopeTimeRandom;
  const resonanceRandomMax = 2 ** pv.resonanceRandom;
  const resonanceEnvMod = 2 ** pv.resonanceEnvMod;
  for (let idx = 0; idx < pv.nResonator; ++idx) {
    dsp.resonators.push(new ComplexResonator());

    const cutFreq
      = exponentialMap(rng.number(), 1, resonanceRandomMax) * pv.resonanceBaseHz / upRate;
    dsp.resonatorCutBase.push(cutFreq);
    dsp.resonatorCutMod.push(
      exp2Scaler * exponentialMap(rng.number(), 1 / resonanceEnvMod, resonanceEnvMod));

    dsp.resonatorEnv.push(new DoubleEmaADEnvelope());
    dsp.resonatorEnv.at(-1).noteOn(
      1, 0, exponentialMap(rng.number(), 1 / envTimeBase, envTimeBase) * upRate);

    const modDecay = pv.envelopeDecaySeconds * exponentialMap(rng.number(), 0.5, 2);
    dsp.resonatorModDecay.push(Math.pow(Number.EPSILON, 1 / (upRate * modDecay)));
    dsp.resonatorModGain.push(pv.resonanceOscMod * exponentialMap(rng.number(), 0.5, 2));
  }

  dsp.phase = 0;
  dsp.table = createNoisyTable(upRate, pv, dsp);

  let spreadSamples = new Array(pv.nResonator);
  for (let idx = 0; idx < spreadSamples.length; ++idx) {
    spreadSamples[idx]
      = uniformDistributionMap(rng.number(), 1, Math.ceil(upRate * pv.timeSpreadSeconds));
  }
  dsp.spreadDelay = new MultiTapDelay(upRate, pv.timeSpreadSeconds, spreadSamples.length);
  dsp.spreadDelay.setTime(spreadSamples);

  dsp.fdn = new FeedbackDelayNetwork(8, upRate, pv.reverbBaseSecond);
  dsp.fdn.randomizeMatrix("SpecialOrthogonal", pv.seed + 2);
  for (let i = 0; i < dsp.fdn.delay.length; ++i) {
    dsp.fdn.delay[i].setTime(
      upRate * pv.reverbBaseSecond * exponentialMap(rng.number(), 1 / 16, 1));
    dsp.fdn.lowpass[i].setCutoff(Math.min(pv.reverbLowpassHz / upRate, 0.5));
    dsp.fdn.highpass[i].setCutoff(20 / upRate);
  }

  // Process.
  let sound = new Array(Math.floor(upRate * pv.renderDuration)).fill(0);
  for (let i = 0; i < sound.length; ++i) sound[i] = process(upRate, pv, dsp);
  sound = downSampleIIR(sound, upFold);

  // Post effect.
  let gainEnv = 1;
  let decay = Math.pow(pv.decayTo, 1.0 / sound.length);
  for (let i = 0; i < sound.length; ++i) {
    sound[i] *= gainEnv;
    gainEnv *= decay;
  }

  postMessage({sound: sound});
}
