// Copyright Takamitsu Endo (ryukau@gmail.com)
// SPDX-License-Identifier: Apache-2.0

/*
Based on `instruments/mymembrane~.pd` in the reference linked below.

Reference: https://github.com/MikeMorenoDSP/pd-mkmr

## Notes on reference implementation.

```
input -+-> allpass -> lowpass --------+-> gain env. -> tanh -> output
       |                              |
       +- tanh <- highpass <- delay <-+
```

- highpass cutoff is 20 Hz.
- velocity is normalized in [0, 1].
- velocity to impulse gain map: [-24, 0] dB.
- velocity to lowpass cutoff map: `cut * (2**vel / 3)`.
- pitch bend is 80 ms linear decay. It modulates:
  - delay time: inverse of `freq * (1 + bend**10) * (vel + 2)`.
  - allpass time: inverse of `apfreq * (1 + bend**20) * (vel + 1)`.
  - gain envelope: `bend * sqrt(vel) * 0.7 + 1`.

tanh is approximated (`hv.tanh`).
*/

import {CubicDelay, Delay, IntDelay, LongAllpass} from "../common/dsp/delay.js";
import {constructSpecialOrthogonal, randomSpecialOrthogonal} from "../common/dsp/fdn.js";
import {Limiter} from "../common/dsp/limiter.js";
import {downSampleIIR} from "../common/dsp/multirate.js";
import {HP1, LP1} from "../common/dsp/onepole.js";
import {DoubleEMAFilter, EMAFilter, EMAHighpass} from "../common/dsp/smoother.js";
import {SVFBP, SVFHP, SVFLP} from "../common/dsp/svf.js";
import {
  clamp,
  dbToAmp,
  exponentialMap,
  lerp,
  syntonicCommaRatio,
} from "../common/util.js";
import {PcgRandom} from "../lib/pcgrandom/pcgrandom.js";

import * as menuitems from "./menuitems.js";

// `hv.tanh` in reference Pure Data patch.
function hv_tanh(x) {
  x = clamp(x, -3, 3);
  return x * (x * x + 27) / (x * x * 9 + 27);
}

class ImpulseSine {
  constructor(
    sampleRate,
    sineFreqNormalized,
    sineModLevel,
    sineModDecay,
    lowpass,
    noiseTransientSample,
  ) {
    this.phase = 0;
    this.pm = sineModLevel;
    this.freq = sineFreqNormalized;

    // TODO: decide which decay envelope to use.
    this.noiseRamp = 1 / Math.max(1, noiseTransientSample);
    this.noiseSustainSample = Math.floor(sampleRate * sineFreqNormalized);
    this.noiseGate = 0;
    this.noiseLowpass = new SVFLP(sineFreqNormalized, 10);

    this.expDecay = Math.pow(sineModDecay, 1 / this.noiseSustainSample);
    this.expGain = 1;

    this.windowPhaseGain = exponentialMap(lowpass, 1, this.noiseSustainSample);
    this.lowpass = 1 - lowpass;
  }

  process(rng) {
    this.expGain *= this.expDecay;

    // let noise = 2 * rng.number() - 1;
    // this.noiseGate = --this.noiseSustainSample >= 0
    //   ? Math.min(1, this.noiseGate + this.noiseRamp)
    //   : Math.max(0, this.noiseGate - this.noiseRamp);
    // noise = this.noiseLowpass.process(2 * this.expGain * noise);

    let sin = 0;
    if (this.phase < 1) {
      const triangle = 1 - Math.abs(1 - 2 * this.phase);
      const wPhase = Math.min(this.windowPhaseGain * triangle, 1);
      const window = Math.sin(0.5 * Math.PI * wPhase);

      const phi = 2 * Math.PI * this.phase;
      sin = Math.sin(phi);
      sin = Math.sin(sin + this.expGain * this.pm * phi);
      sin = lerp(sin, window * sin, this.lowpass);
      this.phase += this.freq;
    }

    return sin; // + noise;
  }
}

// The original implementation in Pd used this excitation.
class ImpulseOriginal {
  constructor(
    sampleRate,
    sineFreqNormalized,
    sineModLevel,
    sineModDecay,
    lowpass,
    noiseTransientSample,
  ) {
    const freq = exponentialMap(lowpass, 0.25, 4) * sineFreqNormalized;

    this.phase = 0;
    this.freq = freq;

    this.noiseRamp = 1 / Math.max(1, noiseTransientSample);
    this.noiseSustainSample = Math.floor(sampleRate * freq);
    this.noiseGate = 0;
    this.noiseLowpass = new SVFLP(freq, exponentialMap(sineModDecay, Math.SQRT1_2, 40));
    this.noiseGain = 1 + sineModLevel * 15;
  }

  process(rng) {
    let sin = 0;
    if (this.phase < 1) {
      sin = Math.sin(2 * Math.PI * this.phase);
      this.phase += this.freq;
    }

    let noise = 2 * rng.number() - 1;
    this.noiseGate = --this.noiseSustainSample >= 0
      ? Math.min(1, this.noiseGate + this.noiseRamp)
      : Math.max(0, this.noiseGate - this.noiseRamp);
    noise = this.noiseLowpass.process(2 * this.noiseGate * noise);

    // Additional gain not present in originnal. This noise is too quiet.
    noise *= this.noiseGain;

    return sin + noise;
  }
}

class ImpulseExpDecay {
  constructor(
    sampleRate,
    sineFreqNormalized,
    sineModLevel,
    sineModDecay,
    lowpass,
  ) {
    const freq = exponentialMap(lowpass, 10 / 48000, 22000 / 48000) * 24000 / sampleRate;

    this.lowpass = new SVFLP(freq, Math.SQRT1_2);

    const decaySamples = Math.floor(sampleRate * sineFreqNormalized);
    this.expDecay = Math.pow(sineModDecay, 1 / decaySamples);

    // // Solution of `integrate((1/4)^log(f-g)/log(2), f, a, b);`. Maxima is used.
    // const integralSlopePart
    //   = Math.pow(0.5 - freq, -0.3862943611198906) / 0.2677588472764575;
    // this.expGain = 1 / (freq * integralSlopePart);
    // // or,
    // this.expGain = 1 / freq;

    this.expGain = 1;

    this.phase = 0;
    this.freqScale = sineModLevel * 1000 / sampleRate;
  }

  process(rng) {
    this.phase += this.freqScale * this.expGain;
    this.phase -= Math.floor(this.phase);

    this.expGain *= this.expDecay;
    return this.lowpass.process(this.expGain * Math.cos(this.phase));
  }
}

class LinearDecay {
  constructor(decaySample) {
    this.counter = decaySample;
    this.decaySample = decaySample;
  }

  process() {
    if (this.counter <= 0) return 0;
    return this.counter-- / this.decaySample;
  }
}

class ExpDecay {
  constructor(decaySample) {
    this.gain = 1;

    decaySample *= 15;
    this.decay = decaySample < 1 ? 1 : Math.pow(1e-3, 1 / decaySample);
  }

  process() { return this.gain *= this.decay; }
}

class NoiseGenerator {
  constructor(sampleRate) {
    this.inputHp = new HP1(100 / sampleRate);
    this.rmsMeter = new EMAFilter();
    this.rmsMeter.setCutoff(20 / sampleRate);

    this.noiseBp = new SVFBP(3000 / sampleRate, Math.SQRT2 - 1);
  }

  process(input, rng) {
    let envelope = input; // this.inputHp.process(input);
    envelope = 10 * Math.sqrt(this.rmsMeter.process(envelope * envelope));

    let noise = rng.number() ** 50;
    noise = this.noiseBp.process(noise);
    return envelope * noise;
  }
}

class AllpassDelayCascade {
  constructor(
    sampleRate,
    lowpassHz,
    highpassHz,
    allpassHz,
    allpassGain,
    delayHz,
    feedbackGain,
    noiseLevel,
    attackMod,
    envelopeDecaySecond,
    pitchMod,
    delayTimeMod,
    delayTimeEnv,
    allpassTimeEnv,
    velocity,
    DelayType,
  ) {
    this.snareNoise = new NoiseGenerator(sampleRate);

    this.pitchEnvShort = new LinearDecay(Math.floor(sampleRate * 0.1));
    this.pitchEnvelope = new LinearDecay(Math.floor(sampleRate * envelopeDecaySecond));

    this.allpass = new LongAllpass(sampleRate, DelayType);
    this.lp = new LP1(lowpassHz / sampleRate);
    this.fb = 0;
    this.delay = new DelayType(0.1 * sampleRate);
    this.hp = new HP1(highpassHz / sampleRate);

    this.allpassTimeSample = sampleRate / allpassHz;
    this.allpassGain = allpassGain;
    this.delayTimeSample = sampleRate / delayHz;
    this.feedbackGain = feedbackGain;
    this.noiseLevel = noiseLevel;
    this.attackMod = attackMod;
    this.pitchMod = pitchMod;
    this.delayTimeMod = delayTimeMod;
    this.delayTimeEnv = delayTimeEnv;
    this.allpassTimeEnv = allpassTimeEnv;
    this.velocity = velocity;
  }

  ipow10(x) {
    const x2 = x * x;
    const x4 = x2 * x2;
    return x2 * x4 * x4;
  }

  // Original implementation. Not suitable for FDN because of internal feedback.
  processOriginal(input, rng) {
    const pitchEnv = this.pitchEnvelope.process();
    const pitchPow10 = this.ipow10(pitchEnv);
    const pitchPow20 = pitchPow10 * pitchPow10;

    const apTime = 2 * this.allpassTimeSample / ((1 + pitchPow10) * (2 + this.velocity));
    let sig = this.allpass.processMod(input + this.fb, apTime, this.allpassGain);
    sig = this.lp.process(sig);
    sig *= (1 + pitchPow20);

    const delayTime = this.delayTimeSample / ((1 + pitchPow20) * (1 + this.velocity));
    this.fb = this.delay.processMod(sig, delayTime);
    this.fb = this.hp.process(this.fb);
    this.fb *= this.feedbackGain;
    this.fb = hv_tanh(this.fb);

    sig = hv_tanh(sig + 2 * input);
    sig += this.noiseLevel * this.snareNoise.process(sig, rng);
    return sig;
  }

  // Without feedback. Use this for FDN.
  process(input, rng) {
    const envShort = this.pitchEnvShort.process() * this.attackMod;
    const pitchEnv = this.pitchEnvelope.process();
    const pitchPow10 = this.ipow10(pitchEnv);
    const pitchPow20 = pitchPow10 * pitchPow10;

    const apTime = 2 * this.allpassTimeSample
      / ((1 + this.pitchMod * pitchPow10) * (2 + this.velocity));
    const apMod
      = 1 + this.allpassTimeEnv * (pitchPow10 * this.delayTimeMod - 1) + envShort;
    let sig = this.allpass.processMod(
      input, apTime - Math.abs(this.fb) * apMod, this.allpassGain);
    sig = this.lp.process(sig);
    sig *= (1 + pitchPow20);

    const delayTime
      = this.delayTimeSample / ((1 + this.pitchMod * pitchPow20) * (1 + this.velocity));
    const delayMod
      = 1 + this.delayTimeEnv * (pitchPow10 * this.delayTimeMod - 1) + envShort;
    sig = this.delay.processMod(sig, delayTime - Math.abs(sig) * delayMod);
    sig = this.hp.process(sig);
    sig = hv_tanh(sig);

    sig += this.noiseLevel * this.snareNoise.process(sig, rng);
    this.fb = sig;
    return sig;
  }
}

class ReverbDelay {
  constructor(
    maxDelayTimeInSamples,
    lowpassCutoff,
    highpassCutoff,
    delayTimeSample,
    DelayType = CubicDelay,
  ) {
    this.lowpass = new DoubleEMAFilter();
    this.lowpass.setCutoff(lowpassCutoff);

    this.highpass = new EMAHighpass();
    this.highpass.setCutoff(highpassCutoff);

    this.delay = new DelayType(maxDelayTimeInSamples);
    this.delay.setTime(delayTimeSample);
  }

  process(input) {
    // input = Math.tanh(input);
    input = this.lowpass.process(input);
    input = this.highpass.process(input);
    return this.delay.process(input);
  }
}

class FDN2 {
  constructor(delay1, delay2, rotationCycle, feedbackGain) {
    this.delay1 = delay1;
    this.delay2 = delay2;
    this.fb1 = 0;
    this.fb2 = 0;

    this.cs = feedbackGain * Math.cos(2 * Math.PI * rotationCycle);
    this.sn = feedbackGain * Math.sin(2 * Math.PI * rotationCycle);
  }

  process(input, rng) {
    input *= 0.5;
    const d1 = this.delay1.process(input + this.fb1, rng);
    const d2 = this.delay2.process(input + this.fb2, rng);

    this.fb1 = this.cs * d1 - this.sn * d2;
    this.fb2 = this.sn * d1 + this.cs * d2;

    return d1 + d2;
  }
}

class FDN {
  // `delay` is Array.
  constructor(delay, feedbackGain, seed) {
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

    randomSpecialOrthogonal(this.matrix, seed);
  }

  process(input, rng) {
    this.bufIndex ^= 1;
    let front = this.buf[this.bufIndex];
    let back = this.buf[this.bufIndex ^ 1];
    front.fill(0);
    for (let i = 0; i < front.length; ++i) {
      for (let j = 0; j < front.length; ++j) front[i] += this.matrix[i][j] * back[j];
    }

    for (let i = 0; i < front.length; ++i) {
      front[i] = this.delay[i].process(input + this.feedbackGain * front[i], rng);
    }

    return front.reduce((sum, val) => sum + val, 0);
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
  let pulse = dbToAmp(-24 * (1 - pv.velocity)) * dsp.impulse.process(dsp.rng);
  let sig = dsp.snare.process(pulse, dsp.rng);
  sig += pv.reverbMix * dsp.reverb.process(sig, dsp.rng);
  sig = dsp.limiter.process(sig);
  return sig;
}

onmessage = async (event) => {
  const pv = event.data; // Parameter values.

  const upFold = parseInt(menuitems.oversampleItems[pv.overSample]);
  const upRate = upFold * pv.sampleRate;
  const sampleRateScaler = menuitems.sampleRateScalerItems[pv.sampleRateScaler];

  const stereoSeed = pv.stereoSeed === 0 ? 0 : 65537;
  const rng = new PcgRandom(BigInt(pv.seed + pv.channel * stereoSeed));

  let dsp = {};
  dsp.rng = rng;

  const getImpulse = () => {
    const excitationType = menuitems.excitationTypeItems[pv.excitationType];
    if (excitationType === "Original") {
      return new ImpulseOriginal(
        upRate,
        pv.frequencyHz / upRate,
        pv.excitationSineModLevel,
        pv.excitationSineModDecay,
        pv.excitationLowpass,
        0.00025 * upRate,
      );
    }

    if (excitationType === "Exp. Decay") {
      return new ImpulseExpDecay(
        upRate,
        pv.frequencyHz / upRate,
        pv.excitationSineModLevel,
        pv.excitationSineModDecay,
        pv.excitationLowpass,
        0.00025 * upRate,
      );
    }

    // excitationType === "Sine (1 Cycle)"
    return new ImpulseSine(
      upRate,
      pv.frequencyHz / upRate,
      pv.excitationSineModLevel,
      pv.excitationSineModDecay,
      pv.excitationLowpass,
      0.00025 * upRate,
    );
  };
  dsp.impulse = getImpulse();

  const getDelayType = () => {
    const delayType = menuitems.delayInterpTypeItems[pv.delayInterpType];
    return delayType === "None" ? IntDelay : delayType === "Linear" ? Delay : CubicDelay;
  };

  // Real timpani: [1.00, 1.504, 1.742, 2.00, 2.245, 2.494, 2.800, 2.852, 2.979, 3.462];
  const pitches = [
    1.0000000000000,    1.3402965524420327, 1.6650969425972044, 1.9804083333912088,
    2.2891849959679758, 2.593129431504782,  2.893324828534451,  3.1905089688660495,
    3.485210133885118,  3.7778213670634533, 4.068644098913255,  4.357915263770598,
    4.645824938472086,  4.932528252461517,  5.218153685402315,  5.502809003876363,
    5.7865856073569075, 6.0695617737731915, 6.351805126135265,  6.633374536485119,
  ];
  const DelayType = getDelayType();

  let snareDelay = new Array(pv.fdnSize);
  const delayFreqHz = pv.frequencyHz * (1 - pv.allpassDelayRatio);
  const allpassFreqHz = pv.frequencyHz * pv.allpassDelayRatio;
  const delayTimeMod = pv.delayTimeMod * upFold * sampleRateScaler;
  const pitchRand = () => { return exponentialMap(rng.number(), 1, syntonicCommaRatio); };
  for (let idx = 0; idx < snareDelay.length; ++idx) {
    snareDelay[idx] = new AllpassDelayCascade(
      upRate,
      pv.lowpassHz * pitchRand(),
      pv.highpassHz * pitchRand(),
      allpassFreqHz * pitches[idx] * pitchRand(),
      pv.allpassGain,
      delayFreqHz * pitches[idx] * pitchRand(),
      pv.feedback,
      pv.noiseLevel,
      pv.attackMod,
      pv.envelopeDecaySecond,
      pv.pitchMod,
      delayTimeMod,
      pv.delayTimeEnv,
      pv.allpassTimeEnv,
      pv.velocity,
      DelayType,
    );
  }
  dsp.snare = new FDN(snareDelay, pv.feedback, pv.seed + 257);

  let reverbDelay = new Array(pv.fdnSize);
  const fdnBaseTime = pv.reverbTimeMultiplier * upRate / delayFreqHz;
  const fdnRandomFunc = () => exponentialMap(
    rng.number(), 1 / (syntonicCommaRatio * syntonicCommaRatio), 1);
  for (let idx = 0; idx < reverbDelay.length; ++idx) {
    reverbDelay[idx] = new ReverbDelay(
      upRate / delayFreqHz * 4,
      Math.min(pv.reverbLowpassHz / upRate, 0.5),
      20 / upRate,
      fdnBaseTime * pitches[idx] * fdnRandomFunc(),
    );
  }
  dsp.reverb = new FDN(reverbDelay, pv.reverbFeedback, pv.seed + 2);

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
  let sound = new Array(Math.floor(upRate * pv.renderDuration)).fill(0);
  let counter = 0;
  let sig = 0;
  do {
    sig = process(upRate, pv, dsp);
    if (++counter >= sound.length) { // Avoid infinite loop on silent signal.
      postMessage({sound: sound, status: "Output is completely silent."});
      return;
    }
  } while (sig === 0);

  // Process.
  sound[0] = sig;
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
