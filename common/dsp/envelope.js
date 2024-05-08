// Copyright Takamitsu Endo (ryukau@gmail.com)
// SPDX-License-Identifier: Apache-2.0

/**
Brent's method to find local minimum of scalar function. Translated from
`scipy.optimize.minimize_scalar`.

Returns [(minimized argument value), (minimized function value)].
*/
function minimizeScalarBrent(func) {
  //////////////////////////////////////////////////////////////////
  // Bracket
  //////////////////////////////////////////////////////////////////
  const grow_limit = 110;
  const maxiterBracket = 1000;

  const _gold = 1.618034; // golden ratio: (1.0+sqrt(5.0))/2.0
  const _verysmall_num = Number.EPSILON;

  let xa = 0;
  let xb = 1;
  let fa = func(xa);
  let fb = func(xb);
  if (fa < fb) {
    [xa, xb] = [xb, xa];
    [fa, fb] = [fb, fa];
  }
  let xc = xb + _gold * (xb - xa);
  let fc = func(xc);
  let iter = 0;

  while (fc < fb) {
    let tmp1 = (xb - xa) * (fb - fc);
    let tmp2 = (xb - xc) * (fb - fa);
    let val = tmp2 - tmp1;

    let denom = Math.abs(val) < _verysmall_num ? 2 * _verysmall_num : 2 * val;

    let w = xb - ((xb - xc) * tmp2 - (xb - xa) * tmp1) / denom;
    let wlim = xb + grow_limit * (xc - xb);

    if (iter > maxiterBracket) break;
    ++iter;

    let fw;
    if ((w - xc) * (xb - w) > 0) {
      fw = func(w);
      if (fw < fc) {
        xa = xb;
        xb = w;
        fa = fb;
        fb = fw;
        break;
      } else if (fw > fb) {
        xc = w;
        fc = fw;
        break;
      }
      w = xc + _gold * (xc - xb);
      fw = func(w);

    } else if ((w - wlim) * (wlim - xc) >= 0) {
      w = wlim;
      fw = func(w);
    } else if ((w - wlim) * (xc - w) > 0) {
      fw = func(w);
      if (fw < fc) {
        xb = xc;
        xc = w;
        w = xc + _gold * (xc - xb);
        fb = fc;
        fc = fw;
        fw = func(w);
      }
    } else {
      w = xc + _gold * (xc - xb);
      fw = func(w);
    }
    xa = xb;
    xb = xc;
    xc = w;
    fa = fb;
    fb = fc;
    fc = fw;
  }

  //////////////////////////////////////////////////////////////////
  // Brent's algorithm
  //////////////////////////////////////////////////////////////////
  const _mintol = 1.0e-11;
  const _cg = 0.3819660;
  const maxiter = 64;

  let x = xb;
  let w = xb;
  let v = xb;

  let fw = func(x);
  let fv = fw;
  let fx = fw;

  let a = xa;
  let b = xc;
  if (a >= b) [a, b] = [b, a];

  let deltax = 0;
  let rat = 0;
  iter = 0;

  while (iter < maxiter) {
    let tol1 = 1.48e-8 * Math.abs(x) + _mintol;
    let tol2 = 2 * tol1;
    let xmid = 0.5 * (a + b);

    // check for convergence.
    if (Math.abs(x - xmid) < (tol2 - 0.5 * (b - a))) break;

    if (Math.abs(deltax) <= tol1) {
      deltax = x >= xmid ? a - x : b - x;
      rat = _cg * deltax;
    } else {
      // do a parabolic step.
      let tmp1 = (x - w) * (fx - fv);
      let tmp2 = (x - v) * (fx - fw);
      let p = (x - v) * tmp2 - (x - w) * tmp1;
      tmp2 = 2 * (tmp2 - tmp1);
      if (tmp2 > 0) p = -p;
      tmp2 = Math.abs(tmp2);
      let dx_temp = deltax;
      deltax = rat;

      // check parabolic fit.
      if (
        p > tmp2 * (a - x) && p < tmp2 * (b - x)
        && Math.abs(p) < Math.abs(0.5 * tmp2 * dx_temp))
      {
        rat = p * 1 / tmp2; // if parabolic step is useful.
        let u = x + rat;
        if ((u - a) < tol2 || (b - u) < tol2) rat = xmid - x >= 0 ? tol1 : -tol1;
      } else {
        deltax = x >= xmid ? a - x : b - x;
        rat = _cg * deltax;
      }
    }

    let u = Math.abs(rat) < tol1 //
      ? (rat >= 0 ? x + tol1 : x - tol1)
      : x + rat;

    let fu = func(u); // calculate new output value

    if (fu > fx) { // if it's bigger than current
      if (u < x)
        a = u;
      else
        b = u;

      if (fu <= fw || w == x) {
        v = w;
        w = u;
        fv = fw;
        fw = fu;
      } else if (fu <= fv || v == x || v == w) {
        v = u;
        fv = fu;
      }
    } else {
      if (u >= x)
        a = x;
      else
        b = x;

      v = w;
      w = x;
      x = u;
      fv = fw;
      fw = fx;
      fx = fu;
    }

    ++iter;
  }
  return [x, fx];
}

// Non-recursive form of DoubleEMAEnvelope output. Negated because `minimizeScalarBrent`
// finds minimum.
function doubleEmaEnvelopeD0Negative(n, k_A, k_D) {
  const A = Math.pow(1 - k_A, n + 1) * (k_A * n + k_A + 1);
  const D = Math.pow(1 - k_D, n + 1) * (k_D * n + k_D + 1);
  return (A - 1) * D;
}

function samplesToKp(timeInSamples) {
  if (timeInSamples < Number.EPSILON) return 1;
  const y = 1 - Math.cos(2 * Math.PI / timeInSamples);
  return -y + Math.sqrt(y * (y + 2));
}

export class DoubleEmaADEnvelope {
  #v1_A = 0;
  #v2_A = 0;

  #v1_D = 0;
  #v2_D = 0;

  #k_A = 1;
  #k_D = 1;

  #gain = 1; // Gain to normalize peak to 1.

  #peakPoint = 0;
  #attackCounter = 0; // Used for voice stealing.

  reset() {
    this.#v1_A = 0;
    this.#v2_A = 0;
    this.#v1_D = 1;
    this.#v2_D = 1;
    this.#attackCounter = 0;
  }

  noteOn(targetAmplitude, attackTimeSamples, decayTimeSamples) {
    const kA = samplesToKp(attackTimeSamples);
    const kD = samplesToKp(decayTimeSamples);

    if (kA == 1.0 || kD == 1.0) {
      this.#gain = 1;
      this.#k_A = kA;
      this.#k_D = kD;
      this.#peakPoint = Math.floor(attackTimeSamples);
    } else {
      const result = minimizeScalarBrent(n => doubleEmaEnvelopeD0Negative(n, kA, kD));

      this.#peakPoint = Math.floor(result[0]) + 1;
      const peak = -result[1];
      this.#gain = peak < Number.EPSILON ? 1 : 1 / peak;
      this.#k_A = kA;
      this.#k_D = kD;
    }
    this.#gain *= targetAmplitude;

    this.reset();
  }

  process() {
    if (this.#attackCounter < this.#peakPoint) ++this.#attackCounter;

    this.#v1_A += this.#k_A * (1 - this.#v1_A);
    this.#v2_A += this.#k_A * (this.#v1_A - this.#v2_A);

    this.#v1_D += this.#k_D * (0 - this.#v1_D);
    this.#v2_D += this.#k_D * (this.#v1_D - this.#v2_D);

    return this.#gain * this.#v2_A * this.#v2_D;
  }
};

export class ExpPolyEnvelope {
  constructor(sampleRate, attackSeconds, curve) {
    this.a = attackSeconds * curve;
    this.b = -curve;
    this.gain = 1 / (Math.pow(attackSeconds, this.a) * Math.exp(this.b * attackSeconds));

    this.delta = 1 / sampleRate;
    this.t = 0; // Time elapsed in seconds.
  }

  process() {
    this.t += this.delta;
    return this.gain * Math.pow(this.t, this.a) * Math.exp(this.b * this.t);
  }
}

export class ExpADEnvelope {
  constructor(attackSamples, decaySamples, threshold = 1e-3) {
    attackSamples = Math.max(attackSamples, 1);
    decaySamples = Math.max(decaySamples, 1);

    this.threshold = threshold;

    this.valueA = 1;
    this.valueD = 1;
    this.alphaA = Math.pow(this.threshold, 1 / attackSamples);
    this.alphaD = Math.pow(this.threshold, 1 / decaySamples);

    const log_a = Math.log(this.alphaA);
    const log_d = Math.log(this.alphaD);
    const t_p = Math.log(log_d / (log_a + log_d)) / log_a;
    this.gain = 1 / ((1 - Math.pow(this.alphaA, t_p)) * Math.pow(this.alphaD, t_p));
  }

  process() {
    this.valueA *= this.alphaA;
    this.valueD *= this.alphaD;
    return this.gain * (1 - this.threshold - this.valueA)
      * (this.valueD - this.threshold);
  }
}
