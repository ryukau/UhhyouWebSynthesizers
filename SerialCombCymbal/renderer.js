import {Delay, LongAllpass} from "../common/dsp/delay.js";
import * as multirate from "../common/dsp/multirate.js";
import {EMADecayEnvelope} from "../common/dsp/smoother.js";
import {SVF} from "../common/dsp/svf.js";
import * as util from "../common/util.js"
import {PcgRandom} from "../lib/pcgrandom/pcgrandom.js";

import * as menuitems from "./menuitems.js";

class Comb {
  #buffer;

  constructor(sampleRate, maxTime) {
    this.#buffer = 0;
    this.gain = 0;
    this.delay = new Delay(sampleRate, maxTime);
  }

  reset() {
    this.#buffer = 0;
    this.delay.reset();
  }

  // gain in [-1, 1].
  prepare(timeInSample, gain) {
    this.delay.setTime(timeInSample);
    this.gain = gain;
  }

  process(input) {
    this.#buffer = this.delay.process(input + this.gain * this.#buffer);
    return this.#buffer;
  }
}

function process(upFold, pv, dsp) {
  const upRate = upFold * pv.sampleRate;

  let sig = util.normalDistributionMap(dsp.rng.number(), dsp.rng.number());
  sig *= dsp.noiseDecay.process();

  let ap = sig - pv.feedback * dsp.feedbackBuffer;
  sig = dsp.feedbackBuffer + util.lerp(0, pv.feedback * sig, pv.noiseMix);
  for (let i = 0; i < pv.nDelay; ++i) {
    ap = dsp.highpass[i].hp(ap);
    ap = dsp.delay[i].process(ap);
  }
  dsp.feedbackBuffer = ap;

  return sig;
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
    feedbackBuffer: 0,
  };

  for (let i = 0; i < pv.nDelay; ++i) {
    // let delay = new Comb(upRate, 0.1);
    let delay = new LongAllpass(upRate, 0.1);
    // let timeInSeconds = pv.delayTime / pv.nDelay;
    let timeInSeconds = pv.delayTime / (i + 1);
    timeInSeconds += 0.001 * dsp.rng.number();
    delay.prepare(upRate * timeInSeconds, pv.feedback);
    dsp.delay.push(delay);

    dsp.highpass.push(new SVF(pv.highpassHz / upRate, pv.highpassQ));
  }

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
