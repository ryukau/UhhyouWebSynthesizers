// Copyright Takamitsu Endo (ryukau@gmail.com)
// SPDX-License-Identifier: Apache-2.0

import * as delay from "../common/dsp/delay.js";
import {constructHouseholder} from "../common/dsp/fdn.js";
import {Limiter} from "../common/dsp/limiter.js";
import {downSampleIIR} from "../common/dsp/multirate.js";
import {SlopeFilter} from "../common/dsp/slopefilter.js";
import {EMAFilter} from "../common/dsp/smoother.js";
import {MatchedBiquad} from "../common/dsp/svf.js";
import {clamp, exponentialMap, lerp, uniformDistributionMap} from "../common/util.js";
import {PcgRandom} from "../lib/pcgrandom/pcgrandom.js";

import * as menuitems from "./menuitems.js";

const exp2Scaler = Math.log(2);

class SlipOutComb {
  constructor(
    sampleRate,
    delaySamples,
    delayTimeModAmount,
    delayTimeModSeconds,
    bandpassCut,
    bandpassQ,
    bandpassCutModRiseCents,
    bandpassCutModFallCents,
    bandpassLossThreshold,
    feedbackGain,
    feedbackLossThreshold,
    feedbackDecaySeconds,
  ) {
    this.delaySamples = delaySamples;
    this.bpCut = bandpassCut;
    this.bpQ = bandpassQ;
    this.bpLossThreshold = bandpassLossThreshold;

    this.delayModTarget = exp2Scaler * delayTimeModAmount;
    this.delayMod = new EMAFilter();
    this.delayMod.setCutoffFromTime(delayTimeModSeconds * sampleRate);

    this.bpCutMod = 0;
    this.bpCutRise = exp2Scaler * bandpassCutModRiseCents / 1200; // In cents.
    this.bpCutFall = exp2Scaler * bandpassCutModFallCents / 1200; // In cents.

    this.fbGainBase = feedbackGain;
    this.fbGain = feedbackGain;
    this.fbLossThreshold = feedbackLossThreshold;
    this.fbDecay = Math.pow(Number.EPSILON, 1 / (feedbackDecaySeconds * sampleRate));

    this.feedback = 0;
    this.delay = new delay.IntDelay(2 * delaySamples);
    this.bandpass = new MatchedBiquad();
  }

  process(input) {
    const fbAbs = Math.abs(this.feedback);
    if (fbAbs > this.bpLossThreshold) {
      if (this.bpCutMod > 8 * exp2Scaler || this.bpCutMod < -2 * exp2Scaler) {
        this.bpCutRise = -this.bpCutRise;
      }
      this.bpCutMod += this.bpCutRise;
    } else {
      this.bpCutMod = Math.abs(this.bpCutMod) >= this.bpCutFall
        ? this.bpCutMod - Math.sign(this.bpCutMod) * this.bpCutFall
        : 0;
    }

    if (fbAbs > this.fbLossThreshold) {
      this.fbGain = Math.max(this.fbGain * this.fbDecay, Number.EPSILON);
      this.delayMod.process(this.delayModTarget);
    } else {
      this.fbGain = Math.min(this.fbGain / this.fbDecay, this.fbGainBase);
      this.delayMod.process(0);
    }

    let sig = this.bandpass.bp(
      input + this.fbGain * this.feedback,
      this.bpCut * Math.exp(this.bpCutMod),
      this.bpQ,
    );

    sig = this.delay.processMod(sig, this.delaySamples * Math.exp(this.delayMod.value));
    this.feedback = sig;
    return sig;
  }
}

class EasyFDN {
  constructor(
    sampleRate, crossGain, crossLossThreshold, crossDecaySeconds, crossfeeds, delays) {
    const create2dArray = (x, y) => {
      let a = new Array(x);
      for (let i = 0; i < a.length; ++i) a[i] = new Array(y).fill(0);
      return a;
    };

    this.crossGainBase = crossGain;
    this.crossGain = crossGain;
    this.crossGainDecay = Math.pow(Number.EPSILON, 1 / (crossDecaySeconds * sampleRate));
    this.crossGainRise = Math.pow(this.crossGainDecay, -1 / 16);

    this.lossThreshold = crossLossThreshold;

    const size = crossfeeds.length;
    this.matrix = constructHouseholder(create2dArray(size, size), crossfeeds);
    this.buf = create2dArray(2, size);
    this.bufIndex = 0;

    this.delay = delays;
  }

  process(input) {
    this.bufIndex ^= 1;
    let front = this.buf[this.bufIndex];
    let back = this.buf[this.bufIndex ^ 1];
    front.fill(0);
    for (let i = 0; i < front.length; ++i) {
      for (let j = 0; j < front.length; ++j) front[i] += this.matrix[i][j] * back[j];
    }

    for (let i = 0; i < front.length; ++i) {
      front[i] = this.delay[i].process(input + this.crossGain * front[i]);
    }

    const output = front.reduce((sum, val) => sum + val, 0);
    if (Math.abs(output) > this.lossThreshold) {
      this.crossGain = Math.max(this.crossGain * this.crossGainDecay, Number.EPSILON);
    } else {
      this.crossGain = Math.min(this.crossGain * this.crossGainRise, this.crossGainBase);
    }
    return output;
  }
}

class Tanh {
  constructor(gain) { this.invGain = 1 / Math.max(gain, Number.EPSILON); }
  process(input) { return Math.tanh(input * this.invGain); }
}

class Bypass {
  process(input) { return input; }
}

function process(upRate, pv, dsp) {
  let sig = dsp.noiseGain * uniformDistributionMap(dsp.rng.number(), -1, 1);
  dsp.noiseGain *= dsp.noiseDecay;

  sig = dsp.fdn.process(sig);
  sig = dsp.limiter.process(sig);

  if (pv.toneSlope < 1) sig = dsp.slopeFilter.process(sig);
  return sig;
}

onmessage = async (event) => {
  const pv = event.data; // Parameter values.

  const upFold = parseInt(menuitems.oversampleItems[pv.overSample]);
  const upRate = upFold * pv.sampleRate;

  const stereoSeed = pv.stereoSeed === 0 ? 0 : 65537;
  const rng = new PcgRandom(BigInt(pv.seed + pv.channel * stereoSeed));

  let dsp = {};
  dsp.rng = rng;
  dsp.noiseGain = 1;
  dsp.noiseDecay = Math.pow(1e-3, 1 / (upRate * pv.noiseDecaySeconds));

  dsp.phase = 0;

  // First element of `crossfeeds` is always 0, because SlipOutComb computes its own
  // feedback.
  let combs = new Array(pv.matrixSize);
  const pitchRatio = (index, spread, rndCent) => {
    const rndRange = exp2Scaler * rndCent / 1200;
    return lerp(1, index + 1, spread)
      * Math.exp(uniformDistributionMap(rng.number(), rndRange, rndRange));
  };
  for (let idx = 0; idx < combs.length; ++idx) {
    const delayCutRatio = pitchRatio(idx, pv.delayTimeSpread, pv.delayTimeRandomCent);
    const bpCutRatio = pitchRatio(idx, pv.bandpassCutSpread, pv.bandpassCutRandomCent);

    combs[idx] = new SlipOutComb(
      upRate,
      upRate / (pv.delayTimeHz * delayCutRatio),
      pv.delayTimeModAmount,
      pv.delayTimeModSeconds,
      (pv.bandpassCutHz * bpCutRatio) / upRate,
      pv.bandpassQ,
      pv.bandpassCutModRiseCents / upFold,
      pv.bandpassCutModFallCents / upFold,
      pv.bandpassLossThreshold,
      pv.feedbackGain,
      pv.feedbackLossThreshold,
      pv.feedbackDecaySeconds,
    );
  }
  dsp.fdn = new EasyFDN(
    upRate, pv.crossFeedbackGain, pv.crossFeedbackLossThreshold,
    pv.crossFeedbackDecaySeconds, pv.crossFeedbackRatio.slice(0, pv.matrixSize), combs);

  dsp.slopeFilter = new SlopeFilter(Math.floor(Math.log2(24000 / 1000)));
  dsp.slopeFilter.setCutoff(upRate, 1000, pv.toneSlope, true);

  if (pv.limiterType === 1) {
    dsp.limiter = new Limiter(
      pv.limiterSmoothingSeconds * upRate, 0.001 * upRate, 0, pv.limiterThreshold);

    // Discard latency part.
    for (let i = 0; i < dsp.limiter.latency; ++i) process(upRate, pv, dsp);
  } else if (pv.limiterType === 2) {
    dsp.limiter = new Tanh(pv.limiterThreshold);
  } else {
    dsp.limiter = new Bypass();
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
