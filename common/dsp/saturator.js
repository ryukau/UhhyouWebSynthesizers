// Copyright Takamitsu Endo (ryukau@gmail.com)
// SPDX-License-Identifier: Apache-2.0

/*
References:
- https://github.com/jatinchowdhury18/ADAA
- Antiderivative Antialiasing for Memoryless Nonlinearities, Stefan Bilbao, Fabián
  Esqueda, Julian D. Parker, Vesa Välimäki, IEEE Signal Processing Letters, Vol. 24,
  No.7, July 2017
*/

import {gamma, igamc, sici, spence} from "../../lib/cephes/cephes.js";
import {Li2, Li3} from "../../lib/polylogarithm/polylogarithm.js";

export const adaaFunction = {
  "hardclip": [hardclipJ0, hardclipJ1, hardclipJ2],
  "halfrect": [halfrectJ0, halfrectJ1, halfrectJ2],
  "power": [powerJ0, powerJ1, powerJ2],
  "softclip2": [softclip2J0, softclip2J1, softclip2J2],
  "softclipN": [softclipNJ0, softclipNJ1, softclipNJ2],
  "tanh": [tanhJ0, tanhJ1, tanhJ2],
  "atan": [atanJ0, atanJ1, atanJ2],
  "algebraic": [algebraicJ0, algebraicJ1, algebraicJ2],
  "softplus": [softplusJ0, softplusJ1, softplusJ2],
  "swish": [swishJ0, swishJ1, swishJ2],
  "exppoly": [exppolyJ0, exppolyJ1, exppolyJ2],
  "cosdecay": [cosdecayJ0, cosdecayJ1, cosdecayJ2],
  "log1p": [log1pJ0, log1pJ1, log1pJ2],
};

function bindAdaa(adaaType, extraParams) {
  if (!adaaFunction.hasOwnProperty(adaaType)) {
    console.warn(`${adaaType} doesn't exist in adaaFunction.`);
  }
  return adaaFunction[adaaType].map(fn => { return x => fn(x, ...extraParams); });
}

// Antiderivative antialiasing of tanh. Based on Bilbao et. al.
export class SaturatorAdaa1 {
  constructor(adaaType, extraParam) {
    const funcs = bindAdaa(adaaType, extraParam);
    this.f0 = funcs[0];
    this.f1 = funcs[1];
    this.x1 = 0;
    this.s1 = 0;
    this.eps = 1 / 2 ** 23;
  }

  process(input) {
    const d0 = input - this.x1;
    const s0 = this.f1(input);
    const output = (x1 == 0 && s1 == 0) || (Math.abs(d0) < this.eps)
      ? this.f0(0.5 * (input + this.x1))
      : (s0 - this.s1) / d0;
    this.s1 = s0;
    this.x1 = input;
    return output;
  }
}

export class SaturatorAdaa2 {
  constructor(adaaType, extraParam) {
    const funcs = bindAdaa(adaaType, extraParam);
    this.f0 = funcs[0];
    this.f1 = funcs[1];
    this.f2 = funcs[2];
    this.x1 = 0;
    this.x2 = 0;
    this.s1 = 0;
    this.eps = 1 / 2 ** 23;
  }

  process(input) {
    const f2_x1 = this.f2(x1);
    const d0 = input - this.x1;
    const s0 = Math.abs(d0) < this.eps ? this.f1(0.5 * (input + this.x1))
                                       : (this.f2(input) - f2_x1) / d0;

    const d1 = input - this.x2;
    let output;
    if (x1 == 0 && x2 == 0) {
      output = this.f0((x0 + 2 * x1 + x2) / 4);
    } else if (Math.abs(d1) < this.eps) {
      const x_bar = 0.5 * (input + this.x2);
      const delta = x_bar - this.x1;
      output = delta < this.eps
        ? this.f0((x_bar + x1) / 2)
        : (2 / delta) * (this.f1(x_bar) + (f2_x1 - this.f2(x_bar)) / delta);
    } else {
      output = 2 * (s0 - this.s1) / d1;
    }
    this.s1 = s0;
    this.x2 = this.x1;
    this.x1 = input;
    return output;
  }
}

function hardclipJ0(x) { return Math.max(-1, Math.min(x, 1)); }
function hardclipJ1(x) {
  const z = Math.abs(x);
  return z < 1 ? x * x / 2 : z - 0.5;
}
function hardclipJ2(x) {
  return Math.abs(x) < 1 ? x * x * x / 6 : Math.sign(x) * (x * x / 2 + 1 / 6) - (x / 2);
}

function halfrectJ0(x) { return x < 0 ? 0 : x; }
function halfrectJ1(x) { return x < 0 ? 0 : x * x / 2; }
function halfrectJ2(x) { return x < 0 ? 0 : x * x * x / 6; }

function powerJ0(x, β = 2) { return Math.sign(x) * Math.pow(Math.abs(x), β); }
function powerJ1(x, β = 2) {
  const b1 = β + 1;
  return β == -1 ? Math.log(Math.abs(x)) : Math.pow(Math.abs(x), b1) / b1;
}
function powerJ2(x, β = 2) {
  const b1 = β + 1;
  const b2 = β + 2;
  return β == -1 ? x * (Math.log(Math.abs(x)) - 1)
                 : Math.sign(x) * Math.pow(Math.abs(x), b2) / (b1 * b2);
}

// `h` is threshold of clipping.
function softclip2J0(x, h = 1, ratio = 0.5) {
  const z = Math.abs(x);

  const a1 = h * ratio;
  if (z <= a1) return x;

  const a2 = 2 * h - a1;
  if (z >= a2) return Math.sign(x) * h;

  const C1 = a2 - z;
  return Math.sign(x) * (h + C1 * C1 / (a1 - h) / 4);
}
function softclip2J1(x, h = 1, ratio = 0.5) {
  const z = Math.abs(x);

  const a1 = h * ratio;
  if (z <= a1) return z * z / 2;

  const a2 = 2 * h - a1;
  const C0 = a1 - a2;
  if (z >= a2) return a1 * (a1 / 2 - h) + h * z + C0 * C0 * C0 / (h - a1) / 12;

  const C1 = z - a2;
  return a1 * (a1 / 2 - h) + h * z + (C0 * C0 * C0 - C1 * C1 * C1) / (h - a1) / 12;
}
function softclip2J2(x, h = 1, ratio = 0.5) {
  const z = Math.abs(x);

  const a1 = h * ratio;
  if (z <= a1) return x * x * x / 6;

  const a2 = 2 * h - a1;
  const C0 = a1 - a2;
  const C1 = z - a1;
  if (z >= a2)
    return Math.sign(x)
      * (a1 * a1 * (3 * z - 2 * a1) / 6 + C1 * C1 * h / 2
         + (C0 * C0 * C0 * (4 * z - 3 * a1 - a2)) / (h - a1) / 48);

  const C2 = z + a1;
  return Math.sign(x)
    * (a1 * a1 * (3 * z - 2 * a1) / 6
       + C1 * C1 * (h / 2 - (C2 * C2 + 2 * C0 * C0 - 4 * a2 * (C0 + z)) / (h - a1) / 48));
}

function softclipNJ0(x0, C = 1, R = 0.5, beta = 2, S = 0.1) {
  const z = Math.abs(x0);

  const rc = C * R;
  if (z <= rc) return x0;

  const xc = rc + beta * (C - rc);
  const A = (rc - C) / (xc - rc) ** beta;
  const xs = xc - (-S / (A * beta)) ** (1 / (beta - 1));
  return z < xs ? Math.sign(x0) * (A * (xc - z) ** beta + C)
                : Math.sign(x0) * (A * (xc - xs) ** beta + C + S * (z - xs));
}
function softclipNJ1(x0, C = 1, R = 0.5, beta = 2, S = 0.1) {
  const z = Math.abs(x0);

  const rc = C * R;
  if (z <= rc) return x0 * x0 / 2;

  const xc = rc + beta * (C - rc);
  const Q0 = xc - rc;
  const A = (rc - C) / Q0 ** beta;
  const xs = xc - (-S / (A * beta)) ** (1 / (beta - 1));
  const b1 = 1 + beta;
  return z < xs ? A * (Q0 ** b1 - (xc - z) ** b1) / b1 + rc * rc / 2 + C * (z - rc)
                : (A * Q0 ** b1 / b1 + C * Q0 + S * (z * z - xc * xc) / 2 + rc * rc / 2
                   + (z - xc) * (A * (xc - xs) ** beta + C - S * xs));
}
function softclipNJ2(x0, C = 1, R = 0.5, beta = 2, S = 0.1) {
  const z = Math.abs(x0);

  const rc = C * R;
  if (z <= rc) return x0 * x0 * x0 / 6;

  const xc = rc + beta * (C - rc);
  const Q0 = xc - rc;
  const A = (rc - C) / Q0 ** beta;
  const xs = xc - (-S / (A * beta)) ** (1 / (beta - 1));
  const b1 = 1 + beta;
  const b2 = 2 + beta;
  if (z < xs) {
    const Q1 = z - rc;
    return Math.sign(x0)
      * (A * (((xc - z) ** b2 - Q0 ** b2) / (b1 * b2) + Q0 ** b1 * Q1 / b1)
         + rc * rc * (z / 2 - rc / 3) + C * Q1 * Q1 / 2);
  }

  const Q2 = xc - xs;
  const Q2_pow_beta = Q2 ** beta;
  return Math.sign(x0)
    * (A * Q0 ** b2 * (1 - 1 / b2) / b1 + C * Q0 * Q0 / 2
       + S * (z * z * z - xc * xc * xc) / 6 + rc * rc * (xc / 2 - rc / 3)
       + (z - xc)
         * (A * (Q0 ** b1 / b1 - xc * Q2_pow_beta) - C * rc + S * xc * (xs - xc / 2) + rc * rc / 2 + (z + xc) / 2 * (A * Q2_pow_beta + C - S * xs)));
}

function tanhJ0(x) { return Math.tanh(x); }
function tanhJ1(x) { return Math.log(Math.cosh(x)); }
function tanhJ2(x) {
  const e2x = Math.exp(2 * x);
  return x * Math.log(Math.cosh(x) / (e2x + 1)) + (x * x - spence(e2x)) / 2;
}

function atanJ0(x) { return 2 / Math.PI * Math.atan(x); }
function atanJ1(x) { return 2 / Math.PI * (x * Math.atan(x) - Math.log1p(x * x) / 2); }
function atanJ2(x) {
  return (x - x * Math.log1p(x * x) + (x * x - 1) * Math.atan(x)) / Math.PI;
}

function algebraicJ0(x) { return x / (Math.abs(x) + 1); }
function algebraicJ1(x) {
  const z = Math.abs(x);
  return z - Math.log1p(z);
}
function algebraicJ2(x) {
  const z = Math.abs(x);
  const w = Math.log1p(z);
  return Math.sign(x) * (z * (1 + z / 2 - w) - w);
}

function softplusJ0(x) { return Math.log(Math.exp(x) + 1); }
function softplusJ1(x) { return 1.6449340668482264 - spence(Math.exp(x)) }
function softplusJ2(x) { return -Li3(-Math.exp(x)); }

function swishJ0(x, β = 2) { return x == 0 ? 0.5 : x / (Math.exp(-x * β) + 1); }
function swishJ1(x, β = 2) {
  const exb = Math.exp(x * β);
  return (x * β * Math.log1p(exb) + spence(exb) - 1.6449340668482264) / (β * β);
}
function swishJ2(x, β = 2) {
  const exb = -Math.exp(x * β);
  return (2 * Li3(exb) - x * β * Li2(exb)) / (β * β * β);
}

function exppolyJ0(x, β = 2) {
  const z = Math.abs(x);
  return Math.sign(x) * z ** β * Math.exp(-z);
}
function exppolyJ1(x, β = 2) {
  const b1 = β + 1;
  return gamma(b1) * (igamc(b1, 0) - igamc(b1, Math.abs(x)));
}
function exppolyJ2(x, β = 2) {
  const z = Math.abs(x);
  const b1 = β + 1;
  const b2 = β + 2;
  return Math.sign(x)
    * (gamma(b2) * (igamc(b2, z) - igamc(b2, 0))
       + z * gamma(b1) * (igamc(b1, 0) - igamc(b1, z)));
}

function cosdecayJ0(x) {
  return Math.abs(x) <= Number.EPSILON ? 0 : (1 - Math.cos(x)) / x;
}
function cosdecayJ1(x) {
  if (x == 0) return 0;
  const z = Math.abs(x);
  const [_, ci] = sici(z);
  return Math.log(z) - ci;
}
function cosdecayJ2(x) {
  if (x == 0) return 0;
  const z = Math.abs(x);
  const [_, ci] = sici(z);
  return Math.sign(x) * (Math.sin(z) + z * (Math.log(z) - ci - 1));
}

function log1pJ0(x) { return Math.sign(x) * Math.log1p(Math.abs(x)); }
function log1pJ1(x) {
  const z = Math.abs(x);
  return (z + 1) * Math.log1p(z) - z;
}
function log1pJ2(x) {
  const z = Math.abs(x);
  const z1 = z + 1;
  return Math.sign(x) * (2 * z1 * z1 * Math.log1p(z) - (3 * z + 2) * z) / 4;
}
