// Copyright Takamitsu Endo (ryukau@gmail.com)
// SPDX-License-Identifier: Apache-2.0

// https://en.wikipedia.org/wiki/A-law_algorithm
export class CompanderALaw {
  constructor(A) { this.setA(A); }

  setA(A) {
    this.A = A;
    this.B = 1 + Math.log(A);
  }

  compress(input) {
    const abs = Math.abs(input);
    return abs * this.A < 1 ? input * this.A / this.B
                            : Math.sign(input) * (Math.log(abs * this.A) + 1) / this.B;
  }

  expand(input) {
    const abs = Math.abs(input);
    return abs * this.B < 1 ? input * this.B / this.A
                            : Math.sign(input) * Math.exp(abs * this.B - 1) / this.A;
  }
}

// https://en.wikipedia.org/wiki/%CE%9C-law_algorithm
export class CompanderMuLaw {
  constructor(mu) { this.setMu(mu); }

  setMu(mu) {
    this.mu = mu;
    this.muLog1p = Math.log1p(this.mu);
  }

  compress(input) {
    return Math.sign(input) * Math.log1p(Math.abs(input) * this.mu) / this.muLog1p;
  }

  expand(input) {
    return Math.sign(input) * Math.expm1(Math.abs(input) * this.muLog1p) / this.mu;
  }
}
