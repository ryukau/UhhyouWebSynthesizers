import {Delay, LongAllpass} from "../common/dsp/delay.js";
import * as multirate from "../common/dsp/multirate.js";
import {EMADecayEnvelope} from "../common/dsp/smoother.js";
import {SVF} from "../common/dsp/svf.js";
import * as util from "../common/util.js"
import {PcgRandom} from "../lib/pcgrandom/pcgrandom.js";

import * as menuitems from "./menuitems.js";

function process(upFold, pv, dsp) {
  const upRate = upFold * pv.sampleRate;

  let sig = util.normalDistributionMap(dsp.rng.number(), dsp.rng.number());
  sig *= dsp.noiseDecay.process();

  return dsp.delayProcessFunc(upFold, pv, dsp, sig);
}

function getDelayProcessFunc(pv) {
  if (menuitems.delayType[pv.delayType] === "Lattice")
    return (upFold, pv, dsp, sig) => {
      const bypassHighpass = pv.highpassHz <= pv.minHighpassHz;
      const bypassLowpass = pv.lowpassHz >= pv.maxLowpassHz;

      let ap = sig;
      for (let i = 0; i < dsp.outBuf.length; ++i) {
        ap -= pv.feedback * dsp.outBuf[i];
        dsp.inBuf[i] = ap;
      }
      let out = dsp.inBuf.at(-1);
      for (let i = dsp.delay.length - 1; i >= 0; --i) {
        let apSig = out;
        if (!bypassHighpass) apSig = dsp.highpass[i].hp(apSig);
        if (!bypassLowpass) apSig = dsp.lowpass[i].lp(apSig);
        const apOut = dsp.delay[i].process(apSig);
        out = dsp.outBuf[i] + pv.feedback * dsp.inBuf[i];
        dsp.outBuf[i] = apOut;
      }
      return out - util.lerp(pv.feedback * sig, 0, pv.noiseMix);
    };

  // menuitems.delayType[pv.delayType] === "Allpass"
  return (upFold, pv, dsp, sig) => {
    const bypassHighpass = pv.highpassHz <= pv.minHighpassHz;
    const bypassLowpass = pv.lowpassHz >= pv.maxLowpassHz;

    let ap = sig - pv.feedback * dsp.feedbackBuffer;
    sig = dsp.feedbackBuffer + util.lerp(0, pv.feedback * sig, pv.noiseMix);
    for (let i = 0; i < pv.nDelay; ++i) {
      if (!bypassHighpass) ap = dsp.highpass[i].hp(ap);
      if (!bypassLowpass) ap = dsp.lowpass[i].lp(ap);
      ap = dsp.delay[i].process(ap);
    }
    dsp.feedbackBuffer = ap;
    return sig;
  };
}

onmessage = (event) => {
  const pv = event.data; // Parameter values.
  const upFold = parseInt(menuitems.oversampleItems[pv.overSample]);
  const upRate = upFold * pv.sampleRate;

  let dsp = {
    noiseDecay: new EMADecayEnvelope(upRate * pv.noiseDecay),
    rng: new PcgRandom(BigInt(pv.seed + pv.channel * 65537)),
    delay: [],
    highpass: [],
    lowpass: [],
    feedbackBuffer: 0,
    inBuf: new Array(pv.nDelay).fill(0),
    outBuf: new Array(pv.nDelay).fill(0),
    delayProcessFunc: getDelayProcessFunc(pv),
  };

  const isOvertone = menuitems.timeDistribution[pv.timeDistribution] === "Overtone";
  for (let i = 0; i < pv.nDelay; ++i) {
    let timeInSeconds = isOvertone ? pv.delayTime / (i + 1) : pv.delayTime / pv.nDelay;
    timeInSeconds += pv.timeRandomness * dsp.rng.number();
    let delay = new LongAllpass(upRate, timeInSeconds);
    delay.prepare(upRate * timeInSeconds, pv.feedback);
    dsp.delay.push(delay);

    const hpOffset = pv.highpassCutoffSlope * i * 8 / pv.nDelay;
    const lpOffset = pv.lowpassCutoffSlope * i * 8 / pv.nDelay;
    dsp.highpass.push(new SVF((hpOffset + 1) * pv.highpassHz / upRate, pv.highpassQ));
    dsp.lowpass.push(new SVF((lpOffset + 1) * pv.lowpassHz / upRate, pv.lowpassQ));
  }

  // // TODO: Add parameter to reverse highpass order.
  // dsp.delay.reverse();
  dsp.highpass.reverse();
  dsp.lowpass.reverse();

  let sound = new Array(Math.floor(pv.sampleRate * pv.renderDuration)).fill(0);
  if (upFold == 2) {
    let halfband = new multirate.HalfBandIIR();
    for (let i = 0; i < sound.length; ++i) {
      const hb0 = process(upFold, pv, dsp);
      const hb1 = process(upFold, pv, dsp);
      sound[i] = halfband.process(hb0, hb1);
    }
  } else {
    for (let i = 0; i < sound.length; ++i) sound[i] = process(upFold, pv, dsp);
  }

  postMessage(sound);
}
