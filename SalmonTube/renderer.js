// Copyright 2022 Takamitsu Endo
// SPDX-License-Identifier: Apache-2.0

import * as multirate from "../common/dsp/multirate.js";
import * as svf from "../common/dsp/svf.js"
import * as util from "../common/util.js"
import {PcgRandom} from "../lib/pcgrandom/pcgrandom.js";

import * as menuitems from "./menuitems.js";
import {tongueFunc} from "./tongue.js";

class RandomLine {
  constructor(sampleRate, periodSample, rng) {
    this.counter = Number.MAX_SAFE_INTEGER - 1;
    this.holdSample = 0;
    this.periodSample = periodSample;
    this.maxPeriod = sampleRate;
    this.v0 = this.#randomValue(rng);
    this.v1 = this.#randomValue(rng);
  }

  #randomValue(rng) {
    return util.clamp(
      util.normalDistributionMap(rng.number(), rng.number(), 0, 1 / 3), -1, 1);
  }

  process(rng) {
    if (++this.counter > this.holdSample) {
      this.counter = 0;
      this.holdSample
        = Math.min(-Math.log(1 - rng.number()) * this.periodSample, this.maxPeriod);

      this.v1 = this.v0;
      this.v0 = this.#randomValue(rng);
    }
    return util.lerp(this.v1, this.v0, this.counter / this.holdSample);
  }
}

class BandNoiseGenerator {
  constructor(normalizedCutoff) { this.bandpass = new svf.SVF(normalizedCutoff, 0.5); }

  process(rng) {
    return this.bandpass.bp(
      util.normalDistributionMap(rng.number(), rng.number(), 0, 1 / 6));
  }
}

class Oscillator {
  constructor(sampleRate, initialPhase) {
    this.phase = initialPhase - Math.floor(initialPhase);
    this.modulation = 0;
    this.aspiration = new BandNoiseGenerator(500 / sampleRate);
  }

  /**
  `freq` is normalized frequency (sampleRate / frequencyHz).
  */
  process(freq, sigma, rng, pulseGain, noiseGain, tenseness) {
    this.phase += freq;
    this.phase -= Math.floor(this.phase);

    // TODO: Find better glottal source. Current one is Gaussian function.
    const x = (12 * this.phase - 6) / sigma;
    const pulse = Math.exp(-x * x);

    // TODO: Find better modulation signal. Current one is half-wave rectified sine.
    const voiced = 0.1 + 0.2 * Math.max(0, Math.sin(2 * Math.PI * this.phase));
    this.modulation = util.lerp(voiced, 0.3, tenseness);
    const noise
      = this.modulation * (0.2 + 0.02 * rng.number()) * this.aspiration.process(rng);

    return pulseGain * pulse + noiseGain * noise;
  }
}

class Tube {
  constructor(diameter) {
    this.nSection = diameter.length - 1;

    this.bufF = new Array(this.nSection).fill(0);
    this.bufB = new Array(this.nSection).fill(0);
    this.reflection = new Array(this.nSection).fill(0);

    this.area = diameter.map(v => v * v * Math.PI / 4);

    for (let i = 0; i < this.nSection; ++i) {
      const area0 = this.area[i];
      const area1 = this.area[i + 1];
      this.reflection[i] = area0 == 0 ? Sample(0.999) : (area0 - area1) / (area0 + area1);
    }
  }

  reset() {
    this.bufF.fill(0);
    this.bufB.fill(0);
    this.reflection.fill(0);
  }

  addTurbulenceNoiseAtIndex(turbulenceNoise, indexF, diameter, modulation = 0.3) {
    const indexI = Math.floor(indexF);
    const fraction = indexF - indexI;
    turbulenceNoise *= modulation;
    const thinness0 = util.clamp(8 * (0.7 - diameter), 0, 1);
    const openness = util.clamp(30 * (diameter - 0.3), 0, 1);
    const noise0 = turbulenceNoise * (1 - fraction) * thinness0 * openness;
    const noise1 = turbulenceNoise * fraction * thinness0 * openness;
    this.bufF[indexI] += noise0 / 2;
    this.bufB[indexI] += noise0 / 2;
    this.bufF[indexI + 1] += noise1 / 2;
    this.bufB[indexI + 1] += noise1 / 2;
  }

  /**
  In case of vocal tract:
  - `outputEndReflection` is reflection coefficient at mouse.
  - `inputEndReflection` is reflection coefficient at glottal.
  */
  processFull(input, outputEndReflection = -0.85, inputEndReflection = 0.75) {
    return this.process(input + this.bufB[0] * inputEndReflection, outputEndReflection);
  }

  process(input, outputEndReflection = -0.85) {
    [input, this.bufF[0]] = [this.bufF[0], input];
    this.bufF[0] -= this.reflection[0] * (this.bufF[0] + this.bufB[0]);

    for (let i = 1; i < this.nSection; ++i) {
      [input, this.bufF[i]] = [this.bufF[i], input];
      const w = this.reflection[i] * (this.bufF[i] + this.bufB[i]);
      this.bufF[i] -= w;
      this.bufB[i - 1] = this.bufB[i] + w;
    }
    return this.bufB[this.bufB.length - 1] = input * outputEndReflection;
  }
}

function processJunction(tract, nose) {
  const noseIndex = Math.floor(tract.bufF.length - nose.bufF.length) - 1;
  if (noseIndex < 0) return;

  // F: front, B: back, N: nose, S: sum.
  const areaF = tract.area[noseIndex];
  const areaB = tract.area[noseIndex + 1];
  const areaN = nose.area[0];

  const areaS = areaF + areaB + areaN;
  if (Math.abs(areaS) <= Number.EPSILON) return;

  const reflectionF = (2 * areaF - areaS) / areaS;
  const reflectionB = (2 * areaB - areaS) / areaS;
  const reflectionN = (2 * areaN - areaS) / areaS;

  const ampF = tract.bufF[noseIndex];
  const ampB = tract.bufB[noseIndex - 1];
  const ampN = nose.bufF[0];

  const decay = Math.pow(Number.EPSILON, 1 / 2 ** 16);
  const ampS = decay * (ampF + ampB + ampN);
  const junctionOutF = (1 + reflectionF) * ampS - ampF;
  const junctionOutB = (1 + reflectionB) * ampS - ampB;
  const junctionOutN = (1 + reflectionN) * ampS - ampN;

  tract.bufF[noseIndex] = util.clamp(junctionOutF, -1, 1);
  tract.bufB[noseIndex - 1] = util.clamp(junctionOutB, -1, 1);
  nose.bufF[0] = util.clamp(junctionOutN, -1, 1);
}

function process(pv, voice) {
  let output = 0;
  for (let vc of voice) {
    let vibrato = 2 ** (vc.vibratoLfo.process(vc.rng) * pv.vibratoAmount / 1200);

    let sig = vc.osc.process(
      vibrato * vc.frequency / vc.upRate, vc.sigma, vc.rng, vc.pulseGain, vc.noiseGain,
      vc.tenseness);

    // TODO: `fricativeNoise` gain needs tuning when oscillator is changed.
    vc.vocalTract.addTurbulenceNoiseAtIndex(
      0.05 * vc.fricativeNoise.process(vc.rng), vc.turbulenceX, vc.turbulenceDiameter,
      vc.osc.modulation);
    sig = vc.vocalTract.processFull(sig);

    // // Nose is unstable. It's better to bring back for consonants.
    // processJunction(vc.vocalTract, vc.nose);
    // sig += vc.nose.process(0);

    output += sig;
  }
  return output;
}

onmessage = (event) => {
  const pv = event.data; // Parameter values.
  const upFold = parseInt(menuitems.oversampleItems[pv.overSample]);

  let sound = new Array(Math.floor(pv.sampleRate * pv.renderDuration)).fill(0);

  let voice = [];
  let rng = new PcgRandom(BigInt(pv.seed + pv.channel * 65537));

  for (let idx = 0; idx < pv.nVoice; ++idx) {
    let vc = {};

    vc.upFold = upFold;
    vc.upRate = upFold * pv.sampleRate;
    vc.rng = rng;

    vc.vibratoLfo = new RandomLine(vc.upRate, pv.vibratoPeriod * vc.upRate, vc.rng);

    vc.osc = new Oscillator(vc.upRate, rng.number());
    vc.frequency = pv.frequency * 2
      ** (util.uniformDistributionMap(rng.number(), -1, 1) * pv.randomDetune / 600)
    vc.sigma = Math.sqrt(pv.sigma2) * 2
      ** (util.uniformDistributionMap(rng.number(), -1, 1) * pv.randomPulseWidth);
    vc.tenseness = 1 - Math.cos((1 - pv.noiseMix) * Math.PI / 2);
    vc.noiseGain = 1 - Math.sqrt(vc.tenseness);
    vc.pulseGain = 0.08 * Math.pow(vc.tenseness, 0.25);

    vc.nose = new Tube(pv.noseDiameter);

    vc.fricativeNoise = new BandNoiseGenerator(1000 / vc.upRate);
    let diameter = pv.vocalTractDiameter.slice();
    const low = 2 ** (-1 / 10);
    const high = 2 ** (1 / 10);
    const scale = util.uniformDistributionMap(rng.number(), low, high);
    const rand = (value, random, max = 1) => {
      return util.clamp(
        value + util.uniformDistributionMap(rng.number(), -random, random), 0, max)
    };
    for (let i = 12; i < diameter.length - 4; ++i) {
      const x = (i - 12) / (diameter.length - 16);
      const y = Math.max(
        tongueFunc(
          x, rand(pv.tongue0X, pv.randomTongue0X),
          rand(pv.tongue0Y, pv.randomTongue0Y, 0.95),
          rand(pv.tongue0W, pv.randomTongue0W)),
        tongueFunc(
          x, rand(pv.tongue1X, pv.randomTongue1X),
          rand(pv.tongue1Y, pv.randomTongue1Y, 0.95),
          rand(pv.tongue1W, pv.randomTongue1W)));
      diameter[i] *= (1 - y) * pv.tubeDiameterMultiplier;
    }
    for (let i = 0; i < diameter.length; ++i) diameter[i] *= scale;
    vc.vocalTract = new Tube(diameter);

    vc.turbulenceX = (diameter.length - 16) * pv.tongue0X + 12;
    vc.turbulenceDiameter = diameter[Math.floor(vc.turbulenceX)];

    voice.push(vc);
  }

  // Process.
  if (upFold == 16) {
    let decimationLowpass
      = new multirate.DecimationLowpass(multirate.sos16FoldFirstStage);
    let halfband = new multirate.HalfBandIIR();
    let frame = [0, 0];
    for (let i = 0; i < sound.length; ++i) {
      for (let j = 0; j < 2; ++j) {
        for (let k = 0; k < 8; ++k) decimationLowpass.push(process(pv, voice));
        frame[j] = decimationLowpass.output();
      }
      sound[i] += halfband.process(frame[0], frame[1]);
    }
  } else if (upFold == 2) {
    let halfband = new multirate.HalfBandIIR();
    for (let i = 0; i < sound.length; ++i) {
      const hb0 = process(pv, voice);
      const hb1 = process(pv, voice);
      sound[i] += halfband.process(hb0, hb1);
    }
  } else {
    for (let i = 0; i < sound.length; ++i) sound[i] += process(pv, voice);
  }

  // Post effect.
  let gainEnv = 1;
  let decay = Math.pow(pv.expDecayTo, 1.0 / sound.length);
  for (let i = 0; i < sound.length; ++i) {
    sound[i] *= gainEnv;
    gainEnv *= decay;
  }

  postMessage(sound);
}
