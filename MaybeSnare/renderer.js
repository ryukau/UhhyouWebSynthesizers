// Copyright 2022 Takamitsu Endo
// SPDX-License-Identifier: Apache-2.0

import {Delay, IntDelay} from "../common/dsp/delay.js";
import {downSampleIIR} from "../common/dsp/multirate.js";
import * as svf from "../common/dsp/svf.js";
import * as util from "../common/util.js";
import {PcgRandom} from "../lib/pcgrandom/pcgrandom.js";

import {SnaredFDN, TimeModulatedFDN} from "./localdsp.js";
import * as menuitems from "./menuitems.js";

function process(upFold, pv, dsp) {
  const upRate = upFold * pv.sampleRate;

  let sig = dsp.batterPulse;
  dsp.batterPulse *= dsp.batterPulseDecay;

  const fdnOut1 = dsp.fdnBatter.process(
    (sig + dsp.bufBatter) / pv.batterMatrixSize, dsp.batterFeedback);
  const fdnOut2 = dsp.fdnSnare.process(
    dsp.bufSnare / pv.snareMatrixSize, dsp.snareFeedback, dsp.rngCh);
  dsp.bufBatter = util.clamp(dsp.fdnCross * fdnOut2, -1000, 1000);
  dsp.bufSnare = util.clamp(-dsp.fdnCross * fdnOut1, -1000, 1000);

  dsp.fdnCross *= dsp.fdnCrossDecay;
  if (Math.abs(dsp.bufBatter) > 1 || Math.abs(dsp.bufSnare) > 1) {
    dsp.fdnCross *= pv.crossSafetyReduction;
  }

  return util.lerp(fdnOut1, fdnOut2, pv.fdnMix);
}

onmessage = (event) => {
  const pv = event.data; // Parameter values.
  const upFold = parseInt(menuitems.oversampleItems[pv.overSample]);
  const upRate = upFold * pv.sampleRate;

  const delayTypeMap = {None: IntDelay, Linear: Delay};
  const delayType = (index) => delayTypeMap[menuitems.delayInterpItems[index]];

  const rng = new PcgRandom(BigInt(pv.seed));
  const rngCh = new PcgRandom(BigInt(pv.seed + pv.channel * 65537));

  let dsp = {
    batterPulse: pv.impactAmplitude,
    batterPulseDecay: Math.pow(Number.EPSILON, 1.0 / (upRate * pv.impactPulseDecayTime)),
    rng: rng,
    rngCh: rngCh,
    fdnCross: pv.fdnCross / 2,
    fdnCrossDecay: Math.pow(Number.EPSILON, 1.0 / (upRate * pv.crossDecayTime)),
    batterFeedback: pv.batterFeedback, // * Math.cos(Math.asin(pv.fdnCross)),
    snareFeedback: pv.snareFeedback,   //* Math.cos(Math.asin(pv.fdnCross)),
    fdnBatter: new TimeModulatedFDN(
      pv.batterMatrixSize, upRate, 1 / pv.batterFrequency, svf.SVFHighShelf, svf.SVFHP,
      delayType(pv.batterDelayInterp), pv.batterTimeModulation, pv.batterTimeRateLimit,
      pv.impactPosition),
    fdnSnare: new SnaredFDN(
      pv.snareMatrixSize, upRate, 1 / pv.snareFrequency, svf.SVFHighShelf, svf.SVFHP,
      delayType(pv.snareDelayInterp), pv.snareTimeModulation, pv.snareTimeRateLimit,
      pv.pulseThreshold, pv.pulseLoss, Math.floor(upRate * pv.pulseDecayTime)),
    bufBatter: 0,
    bufSnare: 0,
  };

  const setMatrix = (fdn, matrixType, identityAmount) => {
    if (matrixType === "Orthogonal") {
      fdn.randomOrthogonal(Math.floor(dsp.rngCh.number() * (2 ** 53)), identityAmount);
    } else {
      fdn.randomizeMatrix(matrixType, Math.floor(dsp.rngCh.number() * (2 ** 53)));
    }
  };
  setMatrix(
    dsp.fdnBatter, menuitems.matrixTypeItems[pv.batterMatrixType],
    pv.batterIdentityAmount);
  setMatrix(
    dsp.fdnSnare, menuitems.matrixTypeItems[pv.snareMatrixType], pv.snareIdentityAmount);

  const delaySamples = (index, shape, frequency, overtoneRandom) => {
    const ratio = util.lerp(index + 1, util.circularModes[index], shape);
    return upRate / frequency / (ratio + overtoneRandom * dsp.rng.number());
  };
  for (let i = 0; i < dsp.fdnBatter.delay.length; ++i) {
    dsp.fdnBatter.setTimeAt(
      i,
      delaySamples(
        i, pv.batterShape, pv.batterFrequency, pv.batterOvertoneRandomization));
    dsp.fdnBatter.lowpass[i].setCutoff(
      pv.batterLowpassCutoffHz / upRate, pv.batterLowpassQ[i], 0.5);
    dsp.fdnBatter.highpass[i].setCutoff(
      pv.batterHighpassCutoffHz / upRate, pv.batterHighpassQ[i]);
  }
  for (let i = 0; i < dsp.fdnSnare.delay.length; ++i) {
    dsp.fdnSnare.setTimeAt(
      i,
      delaySamples(i, pv.snareShape, pv.snareFrequency, pv.snareOvertoneRandomization));
    dsp.fdnSnare.lowpass[i].setCutoff(
      pv.snareLowpassCutoffHz / upRate, pv.snareLowpassQ[i], 0.5);
    dsp.fdnSnare.highpass[i].setCutoff(
      pv.snareHighpassCutoffHz / upRate, pv.snareHighpassQ[i]);
  }

  // Process.
  let sound = new Array(Math.floor(upRate * pv.renderDuration)).fill(0);
  for (let i = 0; i < sound.length; ++i) sound[i] = process(upRate, pv, dsp);
  sound = downSampleIIR(sound, upFold);

  // Post effect decay.
  let gainEnv = 1;
  let decay = Math.pow(pv.expDecayTo, 1.0 / sound.length);
  for (let i = 0; i < sound.length; ++i) {
    sound[i] *= gainEnv;
    gainEnv *= decay;
  }

  postMessage({sound: sound});
}
