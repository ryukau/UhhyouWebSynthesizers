// Copyright 2022 Takamitsu Endo
// SPDX-License-Identifier: Apache-2.0

import {Delay, IntDelay} from "../common/dsp/delay.js";
import {DoubleEmaADEnvelope} from "../common/dsp/doubleemaenvelope.js";
import {FeedbackDelayNetwork} from "../common/dsp/fdn.js";
import * as multirate from "../common/dsp/multirate.js";
import * as svf from "../common/dsp/svf.js";
import * as util from "../common/util.js";
import {PcgRandom} from "../lib/pcgrandom/pcgrandom.js";

import {SampleAndHoldNoise, SerialComb, TimeModulatedFDN} from "./localdsp.js";
import * as menuitems from "./menuitems.js";

function process(upFold, pv, dsp) {
  const upRate = upFold * pv.sampleRate;
  const feedback = pv.fdnFeedback;

  const noiseEnv = dsp.noiseEnvelope.process();
  const noise = dsp.noiseOsc.process(dsp.rngCh, noiseEnv);

  const impulse = dsp.triggered ? 0 : 1;
  dsp.triggered = true;

  const comb = util.lerp(noise, dsp.comb.process(impulse + noise), pv.combMix);

  const fdnOut1 = dsp.fdnBatter.process(
    (impulse + 0.1 * comb + dsp.bufBatter) / pv.matrixSize, feedback);
  const fdnOut2 = dsp.fdnSnare.process((comb + dsp.bufSnare) / pv.matrixSize, feedback);
  dsp.bufBatter = util.clamp(dsp.fdnCross * fdnOut2, -1000, 1000);
  dsp.bufSnare = util.clamp(-dsp.fdnCross * fdnOut1, -1000, 1000);

  return util.lerp(comb, fdnOut1 + fdnOut2, pv.fdnMix);
}

onmessage = (event) => {
  const pv = event.data; // Parameter values.
  const upFold = parseInt(menuitems.oversampleItems[pv.overSample]);
  const upRate = upFold * pv.sampleRate;

  let sound = new Array(Math.floor(pv.sampleRate * pv.renderDuration)).fill(0);

  const delayTypeMap = {None: IntDelay, Linear: Delay};
  const delayType = delayTypeMap[menuitems.delayInterpItems[pv.delayInterp]];

  const rng = new PcgRandom(BigInt(pv.seed));
  const rngCh = new PcgRandom(BigInt(pv.seed + pv.channel * 65537));

  let dsp = {
    triggered: false,
    rng: rng,
    rngCh: rngCh,
    fdnCross: pv.fdnCross / 2,
    noiseOsc: new SampleAndHoldNoise(pv.densityHz / upRate, upRate * pv.noiseDecay),
    noiseEnvelope: new DoubleEmaADEnvelope(),
    comb: new SerialComb(
      upRate, rng, pv.combCount, pv.combSum, pv.combFeedback, pv.combTimeBase,
      pv.combTimeRandom, pv.combHighpassHz, 0.7, pv.combLowpassHz, pv.combLowpassQ,
      pv.combLowpassGain, 0, pv.combLowpassCutoffSlope, pv.combOvertoneStart,
      pv.combTimeUniformOvertoneRatio),
    fdnBatter: new TimeModulatedFDN(
      pv.matrixSize, upRate, 1 / pv.frequency, svf.SVFHighShelf, svf.SVFHP, delayType,
      pv.fdnTimeModulation, pv.fdnTimeRateLimit),
    fdnSnare: new TimeModulatedFDN(
      pv.matrixSize, upRate, 1 / pv.frequency, svf.SVFHighShelf, svf.SVFHP, delayType,
      pv.fdnTimeModulation, pv.fdnTimeRateLimit),
    bufBatter: 0,
    bufSnare: 0,
  };

  dsp.noiseEnvelope.noteOn(1, pv.oscAttack * upRate, pv.oscDecay * upRate);

  const matrixType = menuitems.matrixTypeItems[pv.matrixType];
  if (matrixType === "Orthogonal") {
    dsp.fdnBatter.randomOrthogonal(
      Math.floor(dsp.rngCh.number() * (2 ** 53)), pv.identityAmount);
    dsp.fdnSnare.randomOrthogonal(
      Math.floor(dsp.rngCh.number() * (2 ** 53)), pv.identityAmount);
  } else {
    dsp.fdnBatter.randomizeMatrix(
      menuitems.matrixTypeItems[pv.matrixType],
      Math.floor(dsp.rngCh.number() * (2 ** 53)));
    dsp.fdnSnare.randomizeMatrix(
      menuitems.matrixTypeItems[pv.matrixType],
      Math.floor(dsp.rngCh.number() * (2 ** 53)));
  }

  for (let i = 0; i < dsp.fdnBatter.delay.length; ++i) {
    const lpCutI = 2 ** pv.lowpassCutoffOffsetOctave[i] / upRate;
    const hpCutI = 2 ** pv.highpassCutoffOffsetOctave[i] / upRate;

    const delaySamples = () => {
      return upRate / pv.frequency
        / (i + 1 + pv.overtoneRandomization * dsp.rng.number());
    };

    // dsp.fdnBatter.delay[i].setTime(delaySamples());
    dsp.fdnBatter.setTimeAt(i, delaySamples());
    dsp.fdnBatter.lowpass[i].setCutoff(
      pv.lowpassCutoffBatterHz * lpCutI, pv.lowpassQ[i], pv.lowpassGain[i]);
    dsp.fdnBatter.highpass[i].setCutoff(
      pv.highpassCutoffBatterHz * hpCutI, pv.highpassQ[i]);

    // dsp.fdnSnare.delay[i].setTime(delaySamples());
    dsp.fdnSnare.setTimeAt(i, delaySamples());
    dsp.fdnSnare.lowpass[i].setCutoff(
      pv.lowpassCutoffSnareHz * lpCutI, pv.lowpassQ[i], pv.lowpassGain[i]);
    dsp.fdnSnare.highpass[i].setCutoff(
      pv.highpassCutoffSnareHz * hpCutI, pv.highpassQ[i]);
  }

  // Process.
  if (upFold == 16) {
    let decimationLowpass = new multirate.SosFilter(multirate.sos16FoldFirstStage);
    let halfband = new multirate.HalfBandIIR();
    let frame = [0, 0];
    for (let i = 0; i < sound.length; ++i) {
      for (let j = 0; j < 2; ++j) {
        for (let k = 0; k < 8; ++k) decimationLowpass.push(process(upFold, pv, dsp));
        frame[j] = decimationLowpass.output();
      }
      sound[i] += halfband.process(frame[0], frame[1]);
    }
  } else if (upFold == 2) {
    let halfband = new multirate.HalfBandIIR();
    for (let i = 0; i < sound.length; ++i) {
      const hb0 = process(upFold, pv, dsp);
      const hb1 = process(upFold, pv, dsp);
      sound[i] += halfband.process(hb0, hb1);
    }
  } else {
    for (let i = 0; i < sound.length; ++i) sound[i] += process(upFold, pv, dsp);
  }

  // Post effect click.
  const clickHoldSamples = Math.floor(pv.sampleRate * 0.001);
  for (let i = 0; i < clickHoldSamples; ++i) {
    if (i >= sound.length) break;
    sound[i] *= 1 + pv.clickAmp;
  }

  const clickDecaySamples = Math.floor(pv.sampleRate * pv.clickEnvelopeSecond);
  for (let i = 0; i < clickDecaySamples; ++i) {
    const frame = clickHoldSamples + i;
    if (frame >= sound.length) break;
    sound[frame] *= 1 + pv.clickAmp - pv.clickAmp * i / clickDecaySamples;
  }

  // Post effect decay.
  let gainEnv = 1;
  let decay = Math.pow(pv.expDecayTo, 1.0 / sound.length);
  for (let i = 0; i < sound.length; ++i) {
    sound[i] *= gainEnv;
    gainEnv *= decay;
  }

  postMessage(sound);
}
