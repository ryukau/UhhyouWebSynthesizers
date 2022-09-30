// Copyright 2022 Takamitsu Endo
// SPDX-License-Identifier: Apache-2.0

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

/**
Lowpass filter coefficient specialized for 64x oversampling.
Sos stands for second order sections.

```python
import numpy
from scipy import signal

samplerate = 2 * 48000
uprate = samplerate * 32
sos = signal.butter(16, samplerate / 4, output="sos", fs=uprate)
```
*/
export const sos64FoldFirstStage = [
  [
    1.354163914584143e-26, 2.708327829168286e-26, 1.354163914584143e-26,
    -1.9045872504279573, 0.9068841759295282
  ],
  [1.0, 2.0, 1.0, -1.908001035290007, 0.9103020778040721],
  [1.0, 2.0, 1.0, -1.9147330871451047, 0.9170422484899456],
  [1.0, 2.0, 1.0, -1.9245914935233015, 0.9269125440714382],
  [1.0, 2.0, 1.0, -1.9372866598709455, 0.9396230207448886],
  [1.0, 2.0, 1.0, -1.9524305274354947, 0.9547851517602688],
  [1.0, 2.0, 1.0, -1.9695376181976627, 0.9719128736135145],
  [1.0, 2.0, 1.0, -1.9880295377862067, 0.9904270943918131],
];

/**
Lowpass filter coefficient specialized for 16x oversampling.
Sos stands for second order sections.

```python
import numpy
from scipy import signal

samplerate = 48000
uprate = samplerate * 16 / 2
sos = signal.butter(16, samplerate / 1.8, output="sos", fs=uprate)
```
*/
export const sos16FoldFirstStage = [
  [
    3.5903469155931847e-12, 7.1806938311863695e-12, 3.5903469155931847e-12,
    -1.2759657610561284, 0.40787244610150275
  ],
  [1.0, 2.0, 1.0, -1.2906502176887378, 0.42407495130188644],
  [1.0, 2.0, 1.0, -1.320459244427636, 0.456965573191349],
  [1.0, 2.0, 1.0, -1.3662708320207162, 0.5075130673741699],
  [1.0, 2.0, 1.0, -1.429387848302023, 0.5771549894497601],
  [1.0, 2.0, 1.0, -1.5114943545116066, 0.6677494954045713],
  [1.0, 2.0, 1.0, -1.6145439579130596, 0.7814521523555764],
  [1.0, 2.0, 1.0, -1.7405167001403739, 0.9204476945203488],
];

export class DecimationLowpass {
  #x0;
  #x1;
  #x2;
  #y0;
  #y1;
  #y2;

  constructor(coefficent) {
    this.co = structuredClone(coefficent);
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
}
