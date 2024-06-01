// Copyright Takamitsu Endo (ryukau@gmail.com)
// SPDX-License-Identifier: Apache-2.0

import {CubicDelay, Delay, IntDelay, LongAllpass} from "../common/dsp/delay.js";
import {downSampleLinearPhase} from "../common/dsp/multirate.js";
import {SlopeFilter} from "../common/dsp/slopefilter.js"
import {timeToOnePoleKp} from "../common/dsp/smoother.js"
import {SVF} from "../common/dsp/svf.js";
import * as util from "../common/util.js"
import {PcgRandom} from "../lib/pcgrandom/pcgrandom.js";

import * as menuitems from "./menuitems.js";

class EMADecayEnvelope {
  constructor(timeInSamples) {
    this.kp = timeToOnePoleKp(timeInSamples);
    this.reset();
  }

  reset() { this.value = 1; }

  process() {
    const out = this.value;
    this.value -= this.kp * this.value;
    return out;
  }
}

function process(upFold, pv, dsp) {
  const upRate = upFold * pv.sampleRate;

  let sig = util.normalDistributionMap(dsp.rng.number(), dsp.rng.number());
  sig *= dsp.noiseDecay.process();

  return dsp.delayProcessFunc(upFold, pv, dsp, sig);
}

function getDelayProcessFunc(pv) {
  if (menuitems.delayNetworkType[pv.delayNetworkType] === "Lattice")
    return (upFold, pv, dsp, sig) => {
      let ap = sig;
      for (let i = 0; i < dsp.outBuf.length; ++i) {
        ap -= pv.feedback * dsp.outBuf[i];
        dsp.inBuf[i] = ap;
      }
      let out = dsp.inBuf.at(-1);
      for (let i = dsp.delay.length - 1; i >= 0; --i) {
        let apSig = out;
        apSig = dsp.highpass[i].hp(apSig);
        apSig = dsp.lowpass[i].lp(apSig);
        const delaySamples = dsp.baseDelayTime[i] - pv.delayTimeModAmount * Math.abs(ap);
        const apOut = dsp.delay[i].processMod(apSig, delaySamples, pv.feedback);
        out = dsp.outBuf[i] + pv.feedback * dsp.inBuf[i];
        dsp.outBuf[i] = apOut;
      }
      return out - util.lerp(pv.feedback * sig, 0, pv.noiseMix);
    };

  // menuitems.delayNetworkType[pv.delayNetworkType] === "Allpass"
  return (upFold, pv, dsp, sig) => {
    let ap = sig - pv.feedback * dsp.feedbackBuffer;
    sig = dsp.feedbackBuffer + util.lerp(0, pv.feedback * sig, pv.noiseMix);
    for (let i = 0; i < pv.nDelay; ++i) {
      ap = dsp.highpass[i].hp(ap);
      ap = dsp.lowpass[i].lp(ap);
      const delaySamples = dsp.baseDelayTime[i] - pv.delayTimeModAmount * Math.abs(ap);
      ap = dsp.delay[i].processMod(ap, delaySamples, pv.feedback);
    }
    dsp.feedbackBuffer = ap;
    return sig;
  };
}

onmessage = (event) => {
  const pv = event.data; // Parameter values.
  const upFold = parseInt(menuitems.oversampleItems[pv.overSample]);
  const upRate = upFold * pv.sampleRate;

  let sound = new Array(Math.floor(upRate * pv.renderDuration)).fill(0);
  for (let layer = 0; layer < pv.nLayer; ++layer) {
    let dsp = {
      noiseDecay: new EMADecayEnvelope(upRate * pv.noiseDecay),
      rng: new PcgRandom(BigInt(pv.seed + pv.channel * 65537)),
      delay: [],
      baseDelayTime: [],
      highpass: [],
      lowpass: [],
      feedbackBuffer: 0,
      inBuf: new Array(pv.nDelay).fill(0),
      outBuf: new Array(pv.nDelay).fill(0),
      delayProcessFunc: getDelayProcessFunc(pv),
    };

    const isOvertone = menuitems.timeDistribution[pv.timeDistribution] === "Overtone";
    const delayType = pv.delayInterpType == 0 ? IntDelay
      : pv.delayInterpType == 1               ? Delay
                                              : CubicDelay;
    for (let i = 0; i < pv.nDelay; ++i) {
      let timeInSeconds = isOvertone ? pv.delayTime / (i + 1) : pv.delayTime / pv.nDelay;
      timeInSeconds += pv.timeRandomness * dsp.rng.number();

      const delayTimeSamples = upRate * timeInSeconds;
      dsp.baseDelayTime.push(delayTimeSamples);

      let delay = new LongAllpass(delayTimeSamples, delayType);
      delay.prepare(delayTimeSamples, pv.feedback);
      dsp.delay.push(delay);

      const hpOffset = pv.highpassCutoffSlope * i * 8 / pv.nDelay;
      const lpOffset = pv.lowpassCutoffSlope * i * 8 / pv.nDelay;
      dsp.highpass.push(new SVF((hpOffset + 1) * pv.highpassHz / upRate, pv.highpassQ));
      dsp.lowpass.push(new SVF((lpOffset + 1) * pv.lowpassHz / upRate, pv.lowpassQ));
    }

    const reorderArray = (array, orderingType) => {
      // `orderingType` corresponds to:
      // - 0: Ascending
      // - 1: Descending
      // - 2: Random.
      // See `cascadingOrderItems` in `menuitem.js`.

      if (orderingType == 0) return array;
      if (orderingType == 1) {
        array.reverse();
        return array;
      }
      return util.shuffleArray(dsp.rng, array, 0, array.length);
    };
    reorderArray(dsp.delay, pv.delayCascadingOrder);
    reorderArray(dsp.highpass, pv.highpassCascadingOrder);
    reorderArray(dsp.lowpass, pv.lowpassCascadingOrder);

    for (let i = 0; i < sound.length; ++i) sound[i] += process(upFold, pv, dsp);

    pv.delayTime *= pv.timeMultiplier;
    pv.highpassHz *= pv.highpassCutoffMultiplier;
    pv.lowpassHz *= pv.lowpassCutoffMultiplier;
  }

  sound = downSampleLinearPhase(sound, upFold);

  // Post effect.
  let gainEnv = 1;
  let decay = Math.pow(pv.decayTo, 1.0 / sound.length);
  let slopeFilter = new SlopeFilter(Math.floor(Math.log2(24000 / pv.slopeStartHz)));
  slopeFilter.setCutoff(pv.sampleRate, pv.slopeStartHz, pv.toneSlope, true);
  for (let i = 0; i < sound.length; ++i) {
    sound[i] = gainEnv * slopeFilter.process(sound[i]);
    gainEnv *= decay;
  }

  postMessage({sound: sound});
}
