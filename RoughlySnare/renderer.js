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
import {FeedbackDelayNetwork, randomSpecialOrthogonal} from "../common/dsp/fdn.js";
import {Limiter, MovingAverageFilter} from "../common/dsp/limiter.js";
import {downSampleIIR} from "../common/dsp/multirate.js";
import {HP1, LP1} from "../common/dsp/onepole.js";
import {EMAFilter, EMAHighpass} from "../common/dsp/smoother.js";
import {SVFBP, SVFLP} from "../common/dsp/svf.js";
import {
  circularModes,
  clamp,
  dbToAmp,
  exponentialMap,
  lerp,
  syntonicCommaRatio,
  uniformFloatMap
} from "../common/util.js";
import {PcgRandom} from "../lib/pcgrandom/pcgrandom.js";

import * as menuitems from "./menuitems.js";

// `hv.tanh` in reference Pure Data patch.
function hv_tanh(x) {
  x = clamp(x, -3, 3);
  return x * (x * x + 27) / (x * x * 9 + 27);
}

class Impulse {
  constructor(sampleRate, sineFreqNormalized, noiseTransientSample) {
    this.phase = 0;
    this.freq = sineFreqNormalized;

    this.noiseRamp = 1 / Math.max(1, noiseTransientSample);
    this.noiseSustainSample = Math.floor(sampleRate * sineFreqNormalized);
    this.noiseGate = 0;
    this.noiseLowpass = new SVFLP(sineFreqNormalized, 10);
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

    return sin + noise;
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

class NoiseGenerator {
  constructor(sampleRate) {
    this.inputHp = new HP1(100 / sampleRate);
    this.rmsMeter = new EMAFilter();
    this.rmsMeter.setCutoff(20 / sampleRate);

    this.noiseHp = new HP1(100 / sampleRate);
    this.noiseBp = new SVFBP(3000 / sampleRate, Math.SQRT2 - 1);
  }

  process(rng, input) {
    let envelope = this.inputHp.process(input);
    envelope = 10 * Math.sqrt(this.rmsMeter.process(envelope * envelope));

    let noise = (2 * rng.number() - 1) ** 50;
    noise = this.noiseHp.process(noise);
    noise = this.noiseBp.process(noise);
    return envelope * noise;
  }
}

class FeedbackComb {
  constructor(
    sampleRate,
    lowpassFreqHz,
    lowpassDamping,
    allpassFrequencyHz,
    allpassGain,
    delayFrequencyHz,
    feedbackGain,
    noiseLevel,
    velocity,
  ) {
    this.snareNoise = new NoiseGenerator(sampleRate);
    this.pitchEnvelope = new LinearDecay(Math.floor(sampleRate * 0.08));

    this.allpass = new LongAllpass(sampleRate, CubicDelay);
    this.lp = new LP1(lowpassFreqHz * (2 ** (6 * lowpassDamping - 1)) / sampleRate);
    this.fb = 0;
    this.delay = new CubicDelay(0.1 * sampleRate);
    this.hp = new HP1(20 / sampleRate);

    this.allpassTimeSample = sampleRate / allpassFrequencyHz;
    this.allpassGain = allpassGain;
    this.delayTimeSample = sampleRate / delayFrequencyHz;
    this.feedbackGain = feedbackGain;
    this.noiseLevel = noiseLevel;
    this.velocity = velocity;
  }

  ipow10(x) {
    const x2 = x * x;
    const x4 = x2 * x2;
    return x2 * x4 * x4;
  }

  // Original implementation. Not suitable for FDN because of internal feedback.
  process(input, rng) {
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
    sig += this.noiseLevel * this.snareNoise.process(rng, sig);
    return sig;
  }

  // Without feedback. Use this for FDN.
  process2(input, rng) {
    const pitchEnv = this.pitchEnvelope.process();
    const pitchPow10 = this.ipow10(pitchEnv);
    const pitchPow20 = pitchPow10 * pitchPow10;

    const apTime = 2 * this.allpassTimeSample / ((1 + pitchPow10) * (2 + this.velocity));
    let sig = this.allpass.processMod(input, apTime, this.allpassGain);
    sig = this.lp.process(sig);
    sig *= (1 + pitchPow20);

    const delayTime = this.delayTimeSample / ((1 + pitchPow20) * (1 + this.velocity));
    sig = this.delay.processMod(sig, delayTime);
    sig = this.hp.process(sig);
    sig = hv_tanh(sig);

    sig += this.noiseLevel * this.snareNoise.process(rng, sig);
    return sig;
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
    const d1 = this.delay1.process2(input + this.fb1, rng);
    const d2 = this.delay2.process2(input + this.fb2, rng);

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
      front[i] = this.delay[i].process2(input + this.feedbackGain * front[i], rng);
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
  let sig = dsp.tom.process(pulse, dsp.rng);

  sig += pv.reverbMix * dsp.fdn.process(sig, pv.reverbFeedback);
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

  dsp.impulse = new Impulse(upRate, pv.frequencyHz / upRate, 0.00025 * upRate);

  // dsp.tom = new FeedbackComb(
  //   upRate,
  //   pv.frequencyHz,
  //   pv.damping,
  //   pv.allpassFrequencyHz,
  //   pv.allpassGain,
  //   pv.frequencyHz,
  //   pv.feedback,
  //   pv.noiseLevel,
  //   pv.velocity,
  // );

  // dsp.tom = new FDN2(
  //   new FeedbackComb(
  //     upRate,
  //     pv.frequencyHz,
  //     pv.damping,
  //     pv.allpassFrequencyHz,
  //     pv.allpassGain,
  //     pv.frequencyHz,
  //     pv.feedback,
  //     pv.noiseLevel,
  //     pv.velocity,
  //     ),
  //   new FeedbackComb(
  //     upRate,
  //     pv.frequencyHz,
  //     pv.damping,
  //     pv.allpassFrequencyHz * 1.25,
  //     pv.allpassGain,
  //     pv.frequencyHz * 1.25,
  //     pv.feedback,
  //     pv.noiseLevel,
  //     pv.velocity,
  //     ),
  //   0.25,
  //   pv.feedback,
  // );

  const timpaniModeIdeal = [1.0, 1.35, 1.67, 1.99, 2.30, 2.61];
  const timpaniMode1 =
    [1.00, 1.504, 1.742, 2.00, 2.245, 2.494, 2.800, 2.852, 2.979, 3.462];

  let delay = new Array(6);
  for (let idx = 0; idx < delay.length; ++idx) {
    delay[idx] = new FeedbackComb(
      upRate,
      pv.frequencyHz,
      pv.damping,
      pv.allpassFrequencyHz * timpaniModeIdeal[idx],
      pv.allpassGain,
      pv.frequencyHz * timpaniModeIdeal[idx],
      pv.feedback,
      pv.noiseLevel,
      pv.velocity,
    );
  }
  dsp.tom = new FDN(delay, pv.feedback, pv.seed + 257);

  dsp.fdn = new FeedbackDelayNetwork(6, upRate / pv.frequencyHz * 4);
  dsp.fdn.randomizeMatrix("SpecialOrthogonal", pv.seed + 2);
  for (let idx = 0; idx < dsp.fdn.delay.length; ++idx) {
    dsp.fdn.delay[idx].setTime(
      // upRate * pv.reverbBaseSecond * exponentialMap(rng.number(), 1 / 16, 1)
      upRate / pv.frequencyHz * timpaniModeIdeal[idx]
        * exponentialMap(rng.number(), 1 / (syntonicCommaRatio * syntonicCommaRatio), 1),
    );
    dsp.fdn.lowpass[idx].setCutoff(Math.min(pv.reverbLowpassHz / upRate, 0.5));
    dsp.fdn.highpass[idx].setCutoff(20 / upRate);
  }

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
