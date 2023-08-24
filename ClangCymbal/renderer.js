// Copyright 2022 Takamitsu Endo
// SPDX-License-Identifier: Apache-2.0

import {Delay, IntDelay} from "../common/dsp/delay.js";
import {DoubleEmaADEnvelope} from "../common/dsp/envelope.js";
import {FeedbackDelayNetwork} from "../common/dsp/fdn.js";
import {downSampleIIR} from "../common/dsp/multirate.js";
import {SVFHP, SVFLP} from "../common/dsp/svf.js";
import {PcgRandom} from "../lib/pcgrandom/pcgrandom.js";

import {SampleAndHoldNoise} from "./localdsp.js";
import * as menuitems from "./menuitems.js";

function process(upFold, pv, dsp) {
  const upRate = upFold * pv.sampleRate;
  const feedback = 1;

  const noise = dsp.noiseEnvelope.process() * dsp.noiseOsc.process(dsp.rng);
  return dsp.fdn.process(noise, feedback);
}

onmessage = (event) => {
  const pv = event.data; // Parameter values.
  const upFold = parseInt(menuitems.oversampleItems[pv.overSample]);
  const upRate = upFold * pv.sampleRate;

  const delayTypeMap = {None: IntDelay, Linear: Delay};
  const delayType = delayTypeMap[menuitems.delayInterpItems[pv.delayInterp]];

  let dsp = {
    triggered: false,
    rng: new PcgRandom(BigInt(pv.seed + pv.channel * 65537)),
    noiseOsc: new SampleAndHoldNoise(
      pv.densityHz / upRate, pv.noisePulseRatio, upRate * pv.noiseDecay),
    noiseEnvelope: new DoubleEmaADEnvelope(),
    fdn: new FeedbackDelayNetwork(
      pv.matrixSize, upRate, 1 / pv.frequency, SVFLP, SVFHP, delayType),
  };

  dsp.noiseEnvelope.noteOn(1, pv.oscAttack * upRate, pv.oscDecay * upRate);

  const matrixType = menuitems.matrixTypeItems[pv.matrixType];
  if (matrixType === "Orthogonal") {
    dsp.fdn.randomOrthogonal(Math.floor(dsp.rng.number() * (2 ** 53)), pv.identityAmount);
  } else {
    dsp.fdn.randomizeMatrix(
      menuitems.matrixTypeItems[pv.matrixType], Math.floor(dsp.rng.number() * (2 ** 53)));
  }

  for (let i = 0; i < dsp.fdn.delay.length; ++i) {
    dsp.fdn.delay[i].setTime(
      upRate / pv.frequency / (i + 1 + pv.overtoneRandomization * dsp.rng.number()));

    const lpFreq = pv.lowpassCutoffBaseHz * 2 ** pv.lowpassCutoffOffsetOctave[i];
    dsp.fdn.lowpass[i].setCutoff(lpFreq / upRate, pv.lowpassQ[i]);

    const hpFreq = pv.highpassCutoffBaseHz * 2 ** pv.highpassCutoffOffsetOctave[i];
    dsp.fdn.highpass[i].setCutoff(hpFreq / upRate, pv.highpassQ[i]);
  }

  // Process.
  let sound = new Array(Math.floor(upRate * pv.renderDuration)).fill(0);
  for (let i = 0; i < sound.length; ++i) sound[i] = process(upRate, pv, dsp);
  sound = downSampleIIR(sound, upFold);

  // Post effect.
  let gainEnv = 1;
  let decay = Math.pow(pv.expDecayTo, 1.0 / sound.length);
  for (let i = 0; i < sound.length; ++i) {
    sound[i] *= gainEnv;
    gainEnv *= decay;
  }

  postMessage({sound: sound});
}
