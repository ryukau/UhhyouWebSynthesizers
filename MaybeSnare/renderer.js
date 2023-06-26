// Copyright 2022 Takamitsu Endo
// SPDX-License-Identifier: Apache-2.0

import {Delay, IntDelay} from "../common/dsp/delay.js";
import * as multirate from "../common/dsp/multirate.js";
import * as svf from "../common/dsp/svf.js";
import * as util from "../common/util.js";
import {PcgRandom} from "../lib/pcgrandom/pcgrandom.js";

import {SnaredFDN, TimeModulatedFDN} from "./localdsp.js";
import * as menuitems from "./menuitems.js";

// Frequency ratio of circular membrane modes. Generated using `circularmembranemode.py`.
const circularModes = [
  1.00000000000000,   1.593340505695112,  2.1355487866494034, 2.295417267427694,
  2.6530664045492145, 2.9172954551172228, 3.155464815408362,  3.5001474903090264,
  3.5984846739581138, 3.6474511791052775, 4.058931883331434,  4.131738159726707,
  4.230439127905234,  4.6010445344331075, 4.610051645437306,  4.831885262930598,
  4.903280573212368,  5.1307689067016575, 5.412118429982582,  5.5403985098530635,
  5.650842376925684,  5.976540221648715,  6.152609171589257,  6.1631367313038865,
  6.208732130572546,  6.528612451522295,  6.746213299505839,  6.848991602808508,
  7.0707081490386905, 7.325257332462771,  7.468242109085181,  7.514500962483965,
  7.604536126938166,  7.892520026843893,  8.071028338967128,  8.1568737689496,
  8.45000551018646,   8.66047555520746,   8.781093075730398,  8.820447105611922,
  8.999214496283312,  9.238840557670077,  9.390589484063241,  9.464339027734203,
  9.807815107462856,  9.98784275554081,   10.092254814868133, 10.126502295693772,
  10.368705458854519, 10.574713443493692, 10.706875023386747, 10.77153891878896,
  11.152639282954734, 11.310212368186301, 11.402312929615599, 11.722758172320448,
  11.903823217314876, 12.020976194473256, 12.48894011894477,  12.6291936518746,
  13.066558649839825, 13.228284530761863, 13.819314942198952, 14.40316086180383
];

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

  let sound = new Array(Math.floor(pv.sampleRate * pv.renderDuration)).fill(0);

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
    const ratio = util.lerp(index + 1, circularModes[index], shape);
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

  // Post effect decay.
  let gainEnv = 1;
  let decay = Math.pow(pv.expDecayTo, 1.0 / sound.length);
  for (let i = 0; i < sound.length; ++i) {
    sound[i] *= gainEnv;
    gainEnv *= decay;
  }

  postMessage(sound);
}
