// Copyright Takamitsu Endo (ryukau@gmail.com)
// SPDX-License-Identifier: Apache-2.0

export function sineAdaa1(x0, x1) {
  if (!Number.isFinite(x0) || !Number.isFinite(x1)) { return NaN; }

  const u_hi = x0 + x1;
  const z = u_hi - x0;
  const u_lo = (x0 - (u_hi - z)) + (x1 - z);

  const m_hi = u_hi * 0.5;
  const m_lo = u_lo * 0.5;

  const d_hi = x1 - x0;
  const z2 = d_hi - x1;
  const d_lo = (x1 - (d_hi - z2)) - (x0 + z2);

  const dh_hi = d_hi * 0.5;
  const dh_lo = d_lo * 0.5;

  if (!Number.isFinite(m_hi) || !Number.isFinite(dh_hi)) {
    const delta_half = x1 * 0.5 - x0 * 0.5;
    if (delta_half === 0.0) { return Math.sin(x0); }
    return ((Math.cos(x0) - Math.cos(x1)) / delta_half) * 0.5;
  }

  const sin_mid = Math.sin(m_hi) * Math.cos(m_lo) + Math.cos(m_hi) * Math.sin(m_lo);

  let sinc;
  if (Math.abs(dh_hi) < 1e-5) {
    sinc = 1.0 - (dh_hi * dh_hi) / 6.0;
  } else {
    const sin_dh = Math.sin(dh_hi) * Math.cos(dh_lo) + Math.cos(dh_hi) * Math.sin(dh_lo);
    sinc = sin_dh / (dh_hi + dh_lo);
  }

  return sin_mid * sinc;
}

export class SineAdaa1 {
  #x1 = 0.0;

  reset() { this.#x1 = 0.0; }

  process(input) {
    const y = adaa.sineAdaa1(this.#x1, input);
    this.#x1 = input;
    return y;
  }
}
