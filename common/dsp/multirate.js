// Copyright 2022 Takamitsu Endo
// SPDX-License-Identifier: Apache-2.0

import * as downsamplercoefficient from "./downsamplercoefficient.js";

export const oversampleLinearPhaseItems = ["1", "2", "4", "8", "16"];
export const oversampleIirItems = ["1", "2", "4", "8", "16", "32", "64"];

export function downSampleLinearPhase(data, fold) {
  if (fold === 1) return data;

  const getCoefficient = (fold) => {
    if (fold === 2) return downsamplercoefficient.firLinearPhase2;
    if (fold === 4) return downsamplercoefficient.firLinearPhase4;
    if (fold === 8) return downsamplercoefficient.firLinearPhase8;
    if (fold === 16) return downsamplercoefficient.firLinearPhase16;
    console.error(
      `Coefficents not available for linear phase ${fold} fold down-sampling.`);
  };

  const targetDurationSamples = Math.floor(data.length / fold);
  let decimationLowpass = new FirDownSampler(getCoefficient(fold));
  let frame = new Array(fold).fill(0);
  for (let i = 0; i < targetDurationSamples; ++i) {
    for (let k = 0; k < fold; ++k) frame[k] = data[fold * i + k];
    data[i] = decimationLowpass.process(frame);
  }
  return data.slice(0, targetDurationSamples);
}

export function downSampleIIR(data, fold) {
  if (fold === 1) return data;

  const targetDurationSamples = Math.floor(data.length / fold);
  let halfband = new HalfBandIIR();

  if (fold === 2) {
    for (let i = 0; i < data.length; ++i) {
      data[i] = halfband.process(data[2 * i], data[2 * i + 1]);
    }
    return data.slice(0, targetDurationSamples);
  }

  const getCoefficient = (fold) => {
    if (fold === 4) return downsamplercoefficient.sos4FoldFirstStage;
    if (fold === 8) return downsamplercoefficient.sos8FoldFirstStage;
    if (fold === 16) return downsamplercoefficient.sos16FoldFirstStage;
    if (fold === 32) return downsamplercoefficient.sos32FoldFirstStage;
    if (fold === 64) return downsamplercoefficient.sos64FoldFirstStage;
    console.error(`Coefficents not available for IIR ${fold} fold down-sampling.`);
  };

  let decimationLowpass = new SosFilter(getCoefficient(fold));
  let frame = [0, 0];
  const halfFold = Math.floor(fold / 2);
  for (let i = 0; i < targetDurationSamples; ++i) {
    for (let j = 0; j < 2; ++j) {
      for (let k = 0; k < halfFold; ++k) {
        decimationLowpass.push(data[fold * i + halfFold * j + k]);
      }
      frame[j] = decimationLowpass.output();
    }
    data[i] = halfband.process(frame[0], frame[1]);
  }
  return data.slice(0, targetDurationSamples);
}

class FirstOrderAllpass {
  #x1;
  #y1;
  #a;

  constructor(a) {
    this.#a = a;
    this.reset();
  }

  reset() {
    this.#x1 = 0;
    this.#y1 = 0;
  }

  process(x0) {
    this.#y1 = this.#a * (x0 - this.#y1) + this.#x1;
    this.#x1 = x0;
    return this.#y1;
  }
}

export class HalfBandIIR {
  #ap0;
  #ap1;

  constructor() {
    const h0_a = [
      0.0765690656031399, 0.264282270318935, 0.47939467893641907, 0.661681722389424,
      0.7924031566294969, 0.8776927911111817, 0.9308500986629166, 0.9640156636878193,
      0.9862978287283355
    ];
    const h1_a = [
      0.019911761024506557, 0.16170648261075027, 0.37320978687920564, 0.5766558985008232,
      0.7334355636406803, 0.8399227128761151, 0.9074601780285125, 0.9492937701934973,
      0.9760539731706528, 0.9955323321150525
    ];

    const fillAp = (h_a) => {
      let arr = [];
      for (let a of h_a) arr.push(new FirstOrderAllpass(a));
      return arr;
    };

    this.#ap0 = fillAp(h0_a);
    this.#ap1 = fillAp(h1_a);
  }

  reset() {
    for (let ap of this.#ap0) ap.reset();
    for (let ap of this.#ap1) ap.reset();
  }

  // `input0` must be earlier sample.
  process(input0, input1) {
    for (let ap of this.#ap0) input0 = ap.process(input0);
    for (let ap of this.#ap1) input1 = ap.process(input1);
    return 0.5 * (input0 + input1);
  }
}

export class SosFilter {
  #x0;
  #x1;
  #x2;
  #y0;
  #y1;
  #y2;

  constructor(coefficent) {
    //
    // Transfer function of one section is:
    //
    // H(z) = (b0 + b1 * z^-1 + b2 * z^-2) / (1 + a1 * z^-1 + a2 * z^-2).
    //
    // Also this.co = [[b0, b1, b2, a1, a2], ...].
    //
    this.co = structuredClone(coefficent);
    if (typeof this.co[0] === "number") this.co = [this.co];

    for (let i = 0; i < this.co.length; ++i) { // `scipy.signal` sos format case.
      if (this.co[i].length == 6) this.co[i].splice(3, 1);
    }

    if (this.co[0].length != 5) {
      console.error("SosFilter coefficient is ill formatted.", this.co);
    }

    this.#x0 = new Array(this.co.length).fill(0);
    this.#x1 = new Array(this.co.length).fill(0);
    this.#x2 = new Array(this.co.length).fill(0);
    this.#y0 = new Array(this.co.length).fill(0);
    this.#y1 = new Array(this.co.length).fill(0);
    this.#y2 = new Array(this.co.length).fill(0);
  }

  reset() {
    this.#x0.fill(0);
    this.#x1.fill(0);
    this.#x2.fill(0);
    this.#y0.fill(0);
    this.#y1.fill(0);
    this.#y2.fill(0);
  }

  push(input) {
    this.#x0 = this.#y0.slice(0, -1);
    this.#x0.unshift(input);

    for (let i = 0; i < this.co.length; ++i) {
      this.#y0[i]                      //
        = this.co[i][0] * this.#x0[i]  //
        + this.co[i][1] * this.#x1[i]  //
        + this.co[i][2] * this.#x2[i]  //
        - this.co[i][3] * this.#y1[i]  //
        - this.co[i][4] * this.#y2[i]; //
    }

    this.#x2 = this.#x1.slice();
    this.#x1 = this.#x0.slice();
    this.#y2 = this.#y1.slice();
    this.#y1 = this.#y0.slice();
  }

  output() { return this.#y0[this.#y0.length - 1]; }

  process(input) {
    this.push(input);
    return this.output();
  }
}

export class FirDownSampler {
  #coefficient;
  #buf;

  constructor(coefficient) {
    this.#coefficient = coefficient;
    this.#buf = new Array(coefficient.length);
    for (let idx = 0; idx < this.#coefficient.length; ++idx) {
      this.#buf[idx] = new Array(this.#coefficient[idx].length).fill(0);
    }
  }

  // `input` is Array. Length equals to number of polyphase, that is
  // `input.length == coefficient.length`.
  process(input) {
    for (let i = 0; i < this.#coefficient.length; ++i) {
      this.#buf[i].pop();
      this.#buf[i].unshift(input[i]);
    }

    let output = 0;
    for (let i = 0; i < this.#coefficient.length; ++i) {
      let phase = this.#coefficient[i];
      for (let n = 0; n < phase.length; ++n) output += this.#buf[i][n] * phase[n];
    }
    return output;
  }
};
