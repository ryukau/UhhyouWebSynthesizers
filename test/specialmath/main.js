// Copyright Takamitsu Endo (ryukau@gmail.com)
// SPDX-License-Identifier: Apache-2.0

import {gamma, igam, igamc, lgam, sici, spence} from "../../lib/cephes/cephes.js";
import {Cl, Sl} from "../../lib/polylogarithm/clausen.js";
import {Li2, Li3, Li4} from "../../lib/polylogarithm/polylogarithm.js";

import {data_clausen} from "./data_clausen.js";
import {data_polylogarithm as data_polylog} from "./data_polylogarithm.js";
import {data_scipy} from "./data_scipy.js";

function assertAlmostEqual(a, b, tolAbsolute, tolRelative, msg) {
  if (Number.isNaN(a) && Number.isNaN(b)) return;
  if (a === Number.NEGATIVE_INFINITY && b === Number.NEGATIVE_INFINITY) return;
  if (a === Number.POSITIVE_INFINITY && b === Number.POSITIVE_INFINITY) return;

  if (Number.isFinite(tolAbsolute)) {
    console.assert(Math.abs(a - b) <= tolAbsolute, "Absolute Error", msg, new Error());
  }

  const a_abs = Math.abs(a);
  const b_abs = Math.abs(b);
  if (Number.isFinite(tolRelative) && a_abs > 0 && b_abs > 0) {
    tolRelative *= Math.max(a_abs, b_abs);
    console.assert(Math.abs(a - b) <= tolRelative, "Relative Error", msg, new Error());
  }
}

function testSiCi(data, tolAbsolute, tolRelative) {
  const x = data.sici_x;
  const si_y = data.si_y;
  const ci_y = data.ci_y;
  for (let i = 0; i < x.length; ++i) {
    let [si, ci] = sici(x[i]);
    assertAlmostEqual(si, si_y[i], tolAbsolute, tolRelative, `Si, index ${i}`);
    assertAlmostEqual(ci, ci_y[i], tolAbsolute, tolRelative, `Ci, index ${i}`);
  }
}

function test1Arg(fn, x, y, tolAbsolute, tolRelative) {
  for (let i = 0; i < x.length; ++i) {
    const value = fn(x[i]);
    assertAlmostEqual(
      value, y[i], tolAbsolute, tolRelative,
      `${fn.name}, index ${i}, (x, y, impl) = (${x[i]}, ${y[i]}, ${value})`);
  }
}

function test2Arg(fn, x0, x1, y, tolAbsolute, tolRelative) {
  for (let i = 0; i < x0.length; ++i) {
    for (let j = 0; j < x1.length; ++j) {
      const value = fn(x0[i], x1[j]);
      assertAlmostEqual(
        value, y[i][j], tolAbsolute, tolRelative,
        `${fn.name}, index (${i}, ${j}), (x0, x1, y, impl) = (${x0[i]}, ${x1[j]}, ${
          y[i][j]}, ${value})`);
    }
  }
}

//
// Li2: Relative errors around +12 are quite high.
// sici: Relative error is high because it is comparing different implementation.
// gamma: Abosolute error is turned off because output range is large.
// Cl, Sl: Abosolute error only. Relative error is high when x is close to 0.
//
const eps = Number.EPSILON;
testSiCi(data_scipy, 32 * eps, 2048 * eps);
test1Arg(spence, data_scipy.spence_x, data_scipy.spence_y, 32 * eps, 4 * eps);
test1Arg(gamma, data_scipy.gamma_x, data_scipy.gamma_y, null, 256 * eps);
test1Arg(lgam, data_scipy.gamma_x, data_scipy.gammaln_y, null, 64 * eps);
test2Arg(
  igam, data_scipy.gammainc_a, data_scipy.gammainc_x, data_scipy.gammainc_y, null,
  512 * eps);
test2Arg(
  igamc, data_scipy.gammainc_a, data_scipy.gammainc_x, data_scipy.gammaincc_y, 64 * eps,
  null);
test1Arg(Li2, data_polylog.Li_x, data_polylog.Li2_y, 32 * eps, 1024 * eps);
test1Arg(Li3, data_polylog.Li_x, data_polylog.Li3_y, 64 * eps, 512 * eps);
test1Arg(Li4, data_polylog.Li_x, data_polylog.Li4_y, 128 * eps, 4 * eps);

for (let [n_str, target] of Object.entries(data_clausen.Cl)) {
  const n_int = parseInt(n_str);
  test1Arg(x => Cl(n_int, x), target[0], target[1], 64 * eps, null);
}
for (let [n_str, target] of Object.entries(data_clausen.Sl)) {
  const n_int = parseInt(n_str);
  test1Arg(x => Sl(n_int, x), target[0], target[1], 64 * eps, null);
}
