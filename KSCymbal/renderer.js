// Copyright 2017-2022 Takamitsu Endo
// SPDX-License-Identifier: Apache-2.0
//
// Warning: This code is old. Don't use any component from here.
//

import {downSampleIIR} from "../common/dsp/multirate.js";
import {PcgRandom} from "../lib/pcgrandom/pcgrandom.js";

import * as menuitems from "./menuitems.js";

class Delay {
  constructor(sampleRate, time) {
    this.sampleRate = sampleRate;
    this.buf = new Array(Math.floor(sampleRate / 8)).fill(0);
    this.wptr = 0;
    this.time = time;
  }

  set time(value) {
    const rptr = this.mod(this.wptr - this.sampleRate * value, this.buf.length);
    this.fraction = rptr % 1;
    this.rptr = Math.floor(rptr);
  }

  mod(n, m) { return ((n % m) + m) % m; }

  clearBuffer() { this.buf.fill(0); }

  process(input) {
    this.buf[this.wptr] = input;
    this.wptr = (this.wptr + 1) % this.buf.length;

    const rptr = this.rptr;
    this.rptr = (this.rptr + 1) % this.buf.length;
    return this.buf[rptr] + this.fraction * (this.buf[this.rptr] - this.buf[rptr]);
  }
}

class Comb {
  constructor(sampleRate, time, gain, feedback) {
    this.delay = new Delay(sampleRate, time);
    this.gain = gain;
    this.feedback = feedback;
    this.buf = 0;
  }

  set time(value) { this.delay.time = value; }

  clearBuffer() {
    this.delay.clearBuffer();
    this.buf = 0;
  }

  // feedback.
  process(input) {
    input -= this.feedback * this.buf;
    this.buf = this.delay.process(input);
    return this.gain * input;
  }

  // feed forward.
  processFF(input) {
    return this.gain * (input + this.feedback * this.delay.process(input));
  }
}

// Karplus-Strong string synthesis.
class KSString {
  constructor(sampleRate, frequency, filterBias) {
    this.delay = new Delay(sampleRate, 1.0 / frequency);
    this.lowpass = new OneZeroLP(filterBias);
    this.highpass = new RCHP(0.5);
    this.feedback = 0;
  }

  process(input) {
    var output = this.delay.process(input + this.feedback);
    this.feedback = this.lowpass.process(output);
    return this.highpass.process(output);
  }
}

class SimpleHat {
  constructor(sampleRate, rng, maxFrequency, filterBias, distance, stack) {
    this.string = [];
    for (let i = 0; i < stack; ++i) {
      this.string.push(
        new KSString(sampleRate, maxFrequency * (1.0 - rng.number()), filterBias));
    }

    this.output = new Array(this.string.length).fill(0);

    this.distance = distance;
  }

  process(input) {
    let output = 0;
    for (let i = 0; i < this.string.length; ++i) {
      const distance = (i < 1) ? this.distance : this.distance - this.output[i - 1];
      const leftover = (input <= distance) ? 0 : input - distance;
      input -= leftover;
      this.output[i] = this.string[i].process(input);
      output += this.output[i];
    }
    return output;
  }
}

// One-Zero filter
// https://ccrma.stanford.edu/~jos/filters/One_Zero.html
class OneZeroLP {
  // b1 = [-1, 1]
  constructor(b1) {
    this.z1 = 0;
    this.b1 = b1;
  }

  process(input) {
    const output = this.b1 * (input - this.z1) + this.z1;
    this.z1 = input;
    return output;
  }
}

class AverageFilter {
  constructor(bufferSize) {
    this.buffer = new Array(bufferSize).fill(0);
    this.sum = 0.0;
    this.denom = bufferSize + 1;
  }

  process(input) {
    const output = (this.sum + input) / this.denom;
    this.buffer.unshift(input);
    this.sum += input - this.buffer.pop();
    return output;
  }
}

// https://en.wikipedia.org/wiki/High-pass_filter
// alpha is smoothing factor.
class RCHP {
  constructor(alpha) {
    this.alpha = alpha;
    this.y = 0;
    this.z1 = 0;
  }

  process(input) {
    this.y = this.alpha * this.y + this.alpha * (input - this.z1);
    this.z1 = input;
    return this.y;
  }
}

onmessage = (event) => {
  const pv = event.data;

  const upFold = parseInt(menuitems.oversampleItems[pv.overSample]);
  const upRate = upFold * pv.sampleRate;

  let sound = new Array(Math.floor(upRate * pv.renderDuration)).fill(0);
  let rng = new PcgRandom(BigInt(pv.seed + pv.channel * 65537));

  // Render excitation.
  let preFilter = [];
  for (let i = 0; i < 8; ++i) {
    preFilter.push(
      new Comb(upRate, pv.pickCombTime * 0.002 * rng.number(), -1, pv.pickCombFB));
  }
  const attackLength = Math.floor(0.001 * upRate);
  for (let i = 0; i < attackLength; ++i) {
    sound[i] = rng.number() - 0.5;
  }
  for (let i = 0; i < sound.length; ++i) {
    let sig = sound[i];
    for (let f of preFilter) {
      sig = f.process(sig);
    }
    if (i < attackLength) {
      sig *= (1 - Math.cos(i * Math.PI / attackLength)) / 2;
    }
    sound[i] = sig;
  }
  sound[0] = 0;

  // Render string.
  let string = new SimpleHat(upRate, rng, pv.maxFrequency, 0.5, pv.distance, pv.stack);
  for (let i = 0; i < sound.length; ++i) {
    sound[i] += string.process(sound[i]);
  }

  // Post effect decay.
  let gainEnv = 1;
  let fadeOutLength = Math.floor(pv.fadeOutRatio * sound.length);
  let decay = Math.pow(1e-5, 1.0 / fadeOutLength);
  for (let i = sound.length - fadeOutLength; i < sound.length; ++i) {
    sound[i] *= gainEnv;
    gainEnv *= decay;
  }

  // Down-sampling.
  sound = downSampleIIR(sound, upFold);

  postMessage({sound: sound});
};
