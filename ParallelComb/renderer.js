// Copyright Takamitsu Endo (ryukau@gmail.com)
// SPDX-License-Identifier: Apache-2.0

import {CubicDelay, Delay, IntDelay} from "../common/dsp/delay.js";
import {downSampleIIR} from "../common/dsp/multirate.js";
import {SlopeFilter} from "../common/dsp/slopefilter.js";
import {cutoffToOnePoleKp, EMAFilter} from "../common/dsp/smoother.js";
import {
  sosBiquadBandpassNormalized,
  sosBiquadHighpass,
  sosBiquadLowpass,
  SosFilterImmediate
} from "../common/dsp/sos.js";
import {BiquadResonator, SVF, SVFBP} from "../common/dsp/svf.js";
import {
  circularModes,
  dbToAmp,
  lerp,
  syntonicCommaRatio,
  uniformFloatMap
} from "../common/util.js";
import {PcgRandom} from "../lib/pcgrandom/pcgrandom.js";

import * as menuitems from "./menuitems.js";

class EmaBandpass {
  // `lowCut` and `highCut` are normalized frequency in [0, 0.5).
  constructor(centerFreqNormalized, widthOctave) {
    const oct = 2 ** (widthOctave / 2);
    const lowCut = Math.min(centerFreqNormalized * oct, 0.499);
    const highCut = centerFreqNormalized / oct;

    this.v_lp = 0;
    this.v_hp = 0;
    this.k_lp = cutoffToOnePoleKp(1, lowCut);
    this.k_hp = cutoffToOnePoleKp(1, highCut);

    // Compute normalize gain which is `1 / |H(e^(j*midRadian))|` for following
    // transfer function:
    //
    //         (-k_lp * r) + (k_lp * r) * z^-1
    // H(z) = --------------------------------------------------,
    //         1           + (q + r) * z^-1    + (q * r) * z^-2
    //
    // q = k_lp - 1,
    // r = k_hp - 1.
    //
    const midRadian = 2 * Math.PI * Math.exp((Math.log(lowCut) + Math.log(highCut)) / 2);

    const q = this.k_lp - 1;
    const r = this.k_hp - 1;

    const c1 = Math.cos(midRadian);
    const s1 = Math.sin(midRadian);
    const c2 = Math.cos(2 * midRadian);
    const s2 = Math.sin(2 * midRadian);

    const b0 = -this.k_lp * r;
    const b1 = this.k_lp * r;
    const a1 = q + r;
    const a2 = q * r;

    const num_re = b0 + b1 * c1;
    const num_im = b1 * s1;
    const den_re = 1 + a1 * c1 + a2 * c2;
    const den_im = a1 * s1 + a2 * s2;

    const den_abs_2 = den_re * den_re + den_im * den_im;
    const re = (num_re * den_re + num_im * den_im) / den_abs_2;
    const im = (num_im * den_re + num_re * den_im) / den_abs_2;

    this.gain = 0.99 / Math.sqrt(re * re + im * im);
  }

  process(input) {
    this.v_lp += this.k_lp * (input - this.v_lp);
    this.v_hp += this.k_hp * (this.v_lp - this.v_hp);
    return this.gain * (this.v_lp - this.v_hp);
  }
}

class LpHp {
  constructor(centerFreqNormalized, widthOctave) {
    const oct = 2 ** (widthOctave / 2);
    const lowCut = Math.min(centerFreqNormalized * oct, 0.4999);
    const highCut = Math.min(centerFreqNormalized / oct, 0.4999);
    this.lp = new SosFilterImmediate(sosBiquadLowpass(lowCut, Math.SQRT1_2));
    this.hp = new SosFilterImmediate(sosBiquadHighpass(highCut, Math.SQRT1_2));
  }

  process(input) { return this.lp.process(this.hp.process(input)); }
}

class ResonatorWrapper {
  constructor(cutoffNormalized, Q) {
    this.resonator = new BiquadResonator();
    this.cutoff = cutoffNormalized;
    this.Q = Q;
  }

  process(input) { return this.resonator.process(input, this.cutoff, this.Q); }
}

class FilteredComb {
  constructor(
    delayInterpType,
    delaySamples,
    filterType,
    cutoffNormalized,
    filterQ,
    feedbackGain,
    outputGain,
    crossRatio,
  ) {
    const delayType = delayInterpType == 0 ? IntDelay
      : delayInterpType == 1               ? Delay
                                           : CubicDelay;
    this.delay = new delayType(delaySamples);
    this.delay.setTime(delaySamples - 1);

    this.outputGain = outputGain;
    this.feedback = feedbackGain;
    this.buffer = 0;
    if (menuitems.filterTypeItems[filterType] === "LP + HP") {
      this.filter = new LpHp(cutoffNormalized, 16 * filterQ);
    } else if (menuitems.filterTypeItems[filterType] === "HP") {
      const cut = Math.min(cutoffNormalized / 2, 0.4999);
      this.filter
        = new SosFilterImmediate(sosBiquadHighpass(cut, filterQ * Math.SQRT1_2));
    } else if (menuitems.filterTypeItems[filterType] === "LP") {
      const cut = Math.min(cutoffNormalized * 2, 0.4999);
      this.filter = new SosFilterImmediate(sosBiquadLowpass(cut, filterQ * Math.SQRT1_2));
    } else if (menuitems.filterTypeItems[filterType] === "BP") {
      this.filter = new SosFilterImmediate(
        sosBiquadBandpassNormalized(cutoffNormalized, 10 * filterQ));
    } else if (menuitems.filterTypeItems[filterType] === "Resonator") {
      this.filter = new ResonatorWrapper(cutoffNormalized, filterQ);
    } else if (menuitems.filterTypeItems[filterType] === "Gentle BP") {
      this.filter = new EmaBandpass(cutoffNormalized, 8 * filterQ);
    }

    this.crossSign = Math.sign(crossRatio);
    this.crossRatio = Math.abs(crossRatio);
  }

  process(input, summed) {
    let sig = input - this.feedback * this.buffer;
    sig = this.filter.process(sig);
    this.buffer = this.delay.process(sig);
    return this.outputGain * lerp(this.buffer, this.crossSign * summed, this.crossRatio);
  }
}

function process(upRate, pv, dsp) {
  let sig = 0;
  for (let idx = 0; idx < dsp.comb.length; ++idx) {
    sig += dsp.comb[idx].process(dsp.impulse + pv.cascadeGain * sig, dsp.feedback);
  }
  dsp.feedback = sig / dsp.comb.length;
  dsp.impulse = 0;

  if (pv.toneSlope < 1) sig = dsp.slopeFilter.process(sig);
  return sig;
}

onmessage = async (event) => {
  const pv = event.data; // Parameter values.

  const upFold = parseInt(menuitems.oversampleItems[pv.overSample]);
  const upRate = upFold * pv.sampleRate;

  const stereoSeed = pv.stereoSeed === 1 ? 0 : 65537;
  const rng = new PcgRandom(BigInt(pv.seed + pv.channel * stereoSeed));

  let dsp = {};
  dsp.rng = rng;
  dsp.impulse = 1;
  dsp.feedback = 0;

  const timeBase = Math.max(2 / upRate, pv.delayTimeBaseSecond) * upRate;
  dsp.comb = new Array(pv.nComb);

  const getPitchFunc = () => {
    const pitchType = menuitems.pitchTypeItems[pv.pitchType];
    console.log(pitchType);
    if (pitchType === "Circular Membrane") {
      return (idx, base) => {
        const last = dsp.comb.length - 1;
        return base * circularModes[last] / circularModes[last - idx];
      };
    } else if (pitchType === "Circular Membrane Inverse") {
      return (idx, base) => base * circularModes[idx];
    }
    // "String" case.
    return (idx, base) => idx * base;
  };
  const pitchFunc = getPitchFunc();

  const semitoneScaler = -Math.log(2) / 12;
  const stereoPitch = 2 ** (pv.stereoPitchCent / 1200);
  for (let idx = 0; idx < dsp.comb.length; ++idx) {
    const delayTimeSample = pitchFunc(idx, timeBase);
    const randTime
      = uniformFloatMap(rng.number(), delayTimeSample, delayTimeSample * stereoPitch);
    const randCutoff
      = uniformFloatMap(rng.number(), delayTimeSample, delayTimeSample * stereoPitch);
    dsp.comb[idx] = new FilteredComb(
      pv.delayInterpType,
      randTime * Math.exp(semitoneScaler * pv.combPitch[idx]),
      pv.filterType,
      1 / randCutoff / Math.exp(semitoneScaler * pv.bandpassPitch[idx]),
      pv.bandpassQ[idx],
      pv.feedbackBase * pv.feedbackRatio[idx],
      pv.combGain[idx],
      pv.crossRatio,
    );
  }

  dsp.slopeFilter = new SlopeFilter(Math.floor(Math.log2(24000 / 10)));
  dsp.slopeFilter.setCutoff(upRate, 10, pv.toneSlope, true);

  // Process.
  let sound = new Array(Math.floor(upRate * pv.renderDuration)).fill(0);
  for (let i = 1; i < sound.length; ++i) sound[i] = process(upRate, pv, dsp);
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
