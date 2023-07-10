// Copyright 2023 Takamitsu Endo
// SPDX-License-Identifier: Apache-2.0

// `a` is an array of polynomial coefficients.
// `x` in [0, 1].
export function computePolynomial(x, a) {
  if (a.length <= 0) return 0;
  let v = a.at(-1);
  for (let i = a.length - 2; i >= 0; --i) v = v * x + a[i];
  return v;
}
