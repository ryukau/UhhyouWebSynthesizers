// Copyright Takamitsu Endo (ryukau@gmail.com)
// SPDX-License-Identifier: Apache-2.0

import {CubicDelay, Delay, IntDelay} from "../common/dsp/delay.js";
import {randomSpecialOrthogonal} from "../common/dsp/fdn.js";
import {Limiter} from "../common/dsp/limiter.js";
import {downSampleIIR} from "../common/dsp/multirate.js";
import {ResonantLowpass1A1} from "../common/dsp/resonantfilter.js"
import {EMAFilter} from "../common/dsp/smoother.js";
import {SVFHP, SVFLP} from "../common/dsp/svf.js";
import {dbToAmp, lerp} from "../common/util.js";
import {PcgRandom} from "../lib/pcgrandom/pcgrandom.js";

import {membranePitchTable} from "./membranepitch.js";
import * as menuitems from "./menuitems.js";

class NoiseGeneratorLow {
  constructor(
    gain,
    decaySamples,
    lowpassBaseNormalized,
    lowpassModNormalized,
    lowpassResonance,
  ) {
    this.gain = gain;
    this.decay = Math.pow(1e-3, 1 / decaySamples);

    this.noiseLp = new ResonantLowpass1A1();
    this.lpBase = lowpassBaseNormalized;
    this.lpMod = lowpassModNormalized;
    this.lpResonance = lowpassResonance;
  }

  process(rng, rms) {
    let sig = rng.number();
    sig = 2 * sig - 1;

    sig *= this.gain;
    this.gain *= this.decay;

    return this.noiseLp.process(sig, this.lpBase + rms * this.lpMod, this.lpResonance, 1);
  }
}

class NoiseGeneratorHigh {
  constructor(sampleRate, decaySecond, highpassHz) {
    this.decay = Math.pow(1e-3, 1 / (sampleRate * decaySecond));
    this.gain = 1 / this.decay;

    this.flt = [];
    for (let i = 0; i < 1; ++i) this.flt.push(new SVFHP(highpassHz / sampleRate, 0.5));
  }

  process(rng) {
    this.gain *= this.decay;
    let sig = this.gain * (2 * rng.number() - 1);
    for (let x of this.flt) sig = x.process(sig);
    return sig;
  }
}

class FilteredDelay {
  constructor(
    maxDelayTimeInSamples,
    delayTimeSample,
    delayTimeMod,
    lowpassCutoff,
    lowpassMod,
    highpassCutoff,
    DelayType = CubicDelay,
    clipping = true,
  ) {
    this.clipping = clipping;
    this.lowpass = new SVFLP(lowpassCutoff, Math.SQRT1_2);
    this.lpCut = lowpassCutoff;
    this.lpMod = lowpassMod;
    this.highpass = new SVFHP(highpassCutoff, Math.SQRT1_2);

    this.delay = new DelayType(maxDelayTimeInSamples);
    this.delay.setTime(delayTimeSample);

    this.delayTime = delayTimeSample;
    this.timeMod = delayTimeMod;
  }

  process(input, rms) {
    if (this.clipping) input = Math.tanh(input);
    input
      = this.lowpass.processMod(input, this.lpCut * (1 + this.lpMod * rms), Math.SQRT1_2);
    input = this.highpass.process(input);
    return this.delay.processMod(
      input, this.delayTime - rms * Math.abs(input) * this.timeMod);
  }
}

class FDN {
  // `delay` is Array.
  constructor(delay, inputGain, mixGain, feedbackGain, seed) {
    const create2dArray = (x, y) => {
      let a = new Array(x);
      for (let i = 0; i < a.length; ++i) a[i] = new Array(y).fill(0);
      return a;
    };

    this.delay = delay;
    this.matrix = create2dArray(this.delay.length, this.delay.length);
    this.buf = create2dArray(2, this.delay.length);
    this.bufIndex = 0;
    this.feedbackGain = feedbackGain;
    this.inputGain = inputGain;
    this.mixGain = mixGain;

    const normalDist = v => {
      v = clamp(v, 0, 1 - Number.EPSILON);
      return Math.sqrt(-2 * Math.log(1 - v)) * Math.cos(2 * Math.PI * v);
    };

    if (Array.isArray(seed)) {
      constructSpecialOrthogonal(this.matrix, seed.map(v => normalDist(v)));
    } else if (Number.isFinite(seed)) {
      randomSpecialOrthogonal(this.matrix, seed);
    } else {
      console.warn(`Invalid FDN seed: ${seed}`);
    }
  }

  process(input, rms) {
    this.bufIndex ^= 1;
    let front = this.buf[this.bufIndex];
    let back = this.buf[this.bufIndex ^ 1];
    front.fill(0);
    for (let i = 0; i < front.length; ++i) {
      for (let j = 0; j < front.length; ++j) front[i] += this.matrix[i][j] * back[j];
    }

    let sum = 0;
    for (let i = 0; i < front.length; ++i) {
      front[i] = this.delay[i].process(
        this.inputGain[i] * input + this.feedbackGain * front[i], rms);
      sum += this.mixGain[i] * front[i];
    }
    return sum;
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
  let sig = dsp.impulse;
  dsp.impulse = 0;

  const quad = dsp.meter.process(dsp.lastOutput * dsp.lastOutput);

  if (pv.noiseLowOn !== 0) sig = dsp.noiseL.process(dsp.noiseRng, quad);
  if (pv.noiseHighOn !== 0)
    sig += dsp.noiseHGain * dsp.noiseH.process(dsp.noiseRng, quad);

  if (pv.extraFdnOn !== 0) sig = dsp.excitationGain * dsp.extraFdn.process(sig, 0);
  if (pv.cymbalFdnOn !== 0) sig = dsp.cymbalFdn.process(sig, quad);

  dsp.lastOutput = sig;

  sig = dsp.limiter.process(sig);
  return sig;
}

onmessage = async (event) => {
  const pv = event.data; // Parameter values.

  const upFold = parseInt(menuitems.oversampleItems[pv.overSample]);
  const upRate = upFold * pv.sampleRate;
  const sampleRateScaler = menuitems.sampleRateScalerItems[pv.sampleRateScaler];

  const regionSamples = Math.floor(upRate * pv.renderDuration);
  let sound = new Array(regionSamples * pv.slicerRegions).fill(0);

  let dsp = {};

  const stereoSeed = 17;
  dsp.noiseRng = new PcgRandom(BigInt(pv.seed + pv.channel * stereoSeed * 3));

  slicerLoop: for (let region = 0; region < pv.slicerRegions; ++region) {
    dsp.rng = new PcgRandom(BigInt(pv.seed + pv.channel * stereoSeed));

    const regionRatio = pv.slicerRegions <= 1 ? 0 : 1 - region / (pv.slicerRegions - 1);
    dsp.excitationGain
      = pv.excitationGain * dbToAmp(-regionRatio * pv.slicerExcitationGainRange);

    dsp.impulse = dsp.excitationGain;

    dsp.lastOutput = 0;
    dsp.meter = new EMAFilter();
    dsp.meter.setCutoff(pv.envelopeFollowerHz / upRate);

    dsp.noiseL = new NoiseGeneratorLow(
      dsp.excitationGain,
      pv.noiseLowDecaySeconds * upRate,
      pv.noiseLowLowpassBaseHz / upRate,
      pv.noiseLowLowpassModHz / upRate,
      pv.noiseLowLowpassResonance,
    );

    dsp.noiseHGain = pv.noiseHighMixRatio * dsp.excitationGain;
    dsp.noiseH
      = new NoiseGeneratorHigh(upRate, pv.noiseHighDecaySeconds, pv.noiseHighHighpassHz);

    const getPitch = () => {
      let key = menuitems.membranePitchTypeItems[pv.cymbalMembranePitchType];
      let src = structuredClone(membranePitchTable[key][pv.cymbalMembranePitchIndex]);
      src.shift();
      return src.map(v => v / src[0]);
    };
    const pitches = getPitch();

    const delayTypeKey = menuitems.delayInterpTypeItems[pv.cymbalDelayInterpType];
    const DelayType = delayTypeKey === "None" ? IntDelay
      : delayTypeKey === "Linear"             ? Delay
                                              : CubicDelay;

    // Extra FDN.
    const extraFdnDelay = new Array(pv.extraFdnSize);
    const extraFdnBaseTime = upRate / pv.extraFrequencyHz;
    for (let idx = 0; idx < extraFdnDelay.length; ++idx) {
      const pt = pitches[idx];
      extraFdnDelay[idx] = new FilteredDelay(
        extraFdnBaseTime / pt,
        extraFdnBaseTime / pt,
        pv.cymbalDelayTimeMod * upFold * sampleRateScaler / pt,
        pv.extraLowpassHz * pt / upRate,
        0,
        pv.extraHighpassHz * lerp(1, pt, 1 - pv.cymbalHighpassFollowDelayTime) / upRate,
        DelayType,
        false,
      );
    }
    dsp.extraFdn = new FDN(
      extraFdnDelay,
      new Array(pv.extraFdnSize).fill(1),
      new Array(pv.extraFdnSize).fill(1),
      pv.extraFeedback,
      pv.seed + 513,
    );

    // Cymbal FDN.
    const cymbalFdnDelay = new Array(pv.cymbalFdnSize);
    const cymbalFdnBaseTime = upRate / pv.cymbalFrequencyHz;
    for (let idx = 0; idx < cymbalFdnDelay.length; ++idx) {
      const pt = pitches[idx];
      cymbalFdnDelay[idx] = new FilteredDelay(
        cymbalFdnBaseTime / pt,
        cymbalFdnBaseTime / pt,
        pv.cymbalDelayTimeMod * upFold * sampleRateScaler / pt,
        pv.cymbalLowpassHz * lerp(1, pt, 0.5) / upRate,
        pv.cymbalEnvelopeFollowerToLowpass,
        pv.cymbalHighpassHz * lerp(1, pt, pv.cymbalHighpassFollowDelayTime) / upRate,
        DelayType,
      );
    }
    dsp.cymbalFdn = new FDN(
      cymbalFdnDelay,
      pv.cymbalFdnInputGain,
      new Array(pv.cymbalFdnSize).fill(1),
      pv.cymbalFeedback,
      pv.seed,
    );

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

    // Discard silence of delay at start.
    let counter = 0;
    let sig = 0;
    do {
      sig = process(upRate, pv, dsp);
      if (++counter >= sound.length) continue slicerLoop;
    } while (sig === 0);

    // Process.
    const begin = region * regionSamples;
    const end = begin + regionSamples;
    sound[begin] = sig;
    for (let i = begin + 1; i < end; ++i) sound[i] = process(upRate, pv, dsp);
    sound = downSampleIIR(sound, upFold);

    // Post effect.
    let gainEnv = 1;
    let decay = Math.pow(pv.decayTo, 1.0 / sound.length);
    for (let i = begin; i < end; ++i) {
      sound[i] *= gainEnv;
      gainEnv *= decay;
    }

    if (pv.fadeOut >= Number.EPSILON) {
      let fadeOutLength = Math.min(Math.floor(pv.fadeOut * upRate), regionSamples);
      for (let i = 0; i < fadeOutLength; ++i) {
        sound[end - fadeOutLength + i] *= Math.cos(0.5 * Math.PI * i / fadeOutLength);
      }
    }
  }

  postMessage({sound: sound});
}
