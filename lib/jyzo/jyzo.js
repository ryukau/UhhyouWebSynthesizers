/*
The comments on the funcions are copied from original Fortran90 implementation
(special_functions.f90) found in the link below.

- https://people.sc.fsu.edu/~jburkardt/f_src/special_functions/special_functions.html
*/

//*****************************************************************************80
//
//! JYNDD: Bessel functions Jn(x) and Yn(x), first and second derivatives.
//
//  Licensing:
//
//    This routine is copyrighted by Shanjie Zhang and Jianming Jin.  However,
//    they give permission to incorporate this routine into a user program
//    provided that the copyright is acknowledged.
//
//  Modified:
//
//    02 August 2012
//
//  Author:
//
//    Shanjie Zhang, Jianming Jin
//
//  Reference:
//
//    Shanjie Zhang, Jianming Jin,
//    Computation of Special Functions,
//    Wiley, 1996,
//    ISBN: 0-471-11963-6,
//    LC: QA351.C45.
//
//  Parameters:
//
//    Input, integer N, the order.
//
//    Input, real ( kind = rk ) X, the argument.
//
//    Output, real ( kind = rk ) BJN, DJN, FJN, BYN, DYN, FYN, the values of
//    Jn(x), Jn'(x), Jn"(x), Yn(x), Yn'(x), Yn"(x).
//
export function jyndd(n, x) {
  let f;

  let nt;
  for (nt = 1; nt <= 900; ++nt) {
    let mt = Math.floor(
      0.5 * Math.log10(6.28 * nt) - nt * Math.log10(1.36 * Math.abs(x) / nt));
    if (20 < mt) break;
  }

  let bj = new Array(nt).fill(0);
  let by = new Array(nt).fill(0);

  let bs = 0.0;
  let f0 = 0.0;
  let f1 = 1.0e-35;
  let su = 0.0;
  for (let k = nt; k >= 0; --k) {
    f = 2.0 * (k + 1.0) * f1 / x - f0;
    if (k <= n + 1) bj[k] = f;
    if (k == 2 * Math.floor(k / 2)) {
      bs = bs + 2.0 * f;
      if (k != 0) su = su + (-1.0) ** (k / 2) * f / k;
    }
    f0 = f1;
    f1 = f;
  }

  for (let k = 0; k <= n + 1; ++k) bj[k] = bj[k] / (bs - f);

  let bjn = bj[n];
  let ec = 0.5772156649015329;
  let e0 = 0.3183098861837907;
  let s1 = 2.0 * e0 * (Math.log(x / 2.0) + ec) * bj[0];
  f0 = s1 - 8.0 * e0 * su / (bs - f);
  f1 = (bj[1] * f0 - 2.0 * e0 / x) / bj[0];

  by[0] = f0;
  by[1] = f1;
  for (let k = 2; k <= n + 1; ++k) {
    f = 2.0 * (k - 1.0) * f1 / x - f0;
    by[k] = f;
    f0 = f1;
    f1 = f;
  }

  let byn = by[n];
  let djn = -bj[n + 1] + n * bj[n] / x;
  let dyn = -by[n + 1] + n * by[n] / x;
  let fjn = (n * n / (x * x) - 1.0) * bjn - djn / x;
  let fyn = (n * n / (x * x) - 1.0) * byn - dyn / x;

  return [bjn, djn, fjn, byn, dyn, fyn];
}

//*****************************************************************************80
//
//! JYZO computes the zeros of Bessel functions Jn(x), Yn(x) and derivatives.
//
//  Licensing:
//
//    This routine is copyrighted by Shanjie Zhang and Jianming Jin.  However,
//    they give permission to incorporate this routine into a user program
//    provided that the copyright is acknowledged.
//
//  Modified:
//
//    28 July 2012
//
//  Author:
//
//    Shanjie Zhang, Jianming Jin
//
//  Reference:
//
//    Shanjie Zhang, Jianming Jin,
//    Computation of Special Functions,
//    Wiley, 1996,
//    ISBN: 0-471-11963-6,
//    LC: QA351.C45.
//
//  Parameters:
//
//    Input, integer N, the order of the Bessel functions.
//
//    Input, integer NT, the number of zeros.
//
//    Output, real ( kind = rk ) RJ0(NT), RJ1(NT), RY0(NT), RY1(NT), the zeros
//    of Jn(x), Jn'(x), Yn(x), Yn'(x).
//
export function jyzo(n, nt) {
  let rj0 = new Array(nt);
  let rj1 = new Array(nt);
  let ry0 = new Array(nt);
  let ry1 = new Array(nt);

  let n_r8 = n;

  let x = n <= 20 ? 2.82141 + 1.15859 * n_r8
                  : n + 1.85576 * n_r8 ** 0.33333 + 1.03315 / n_r8 ** 0.33333;

  let l = 0;
  while (true) {
    const x0 = x;
    const [bjn, djn, fjn, byn, dyn, fyn] = jyndd(n, x);
    x = x - bjn / djn;

    if (1.0e-09 < Math.abs(x - x0)) continue;

    rj0[l++] = x;
    x = x + 3.1416 + (0.0972 + 0.0679 * n_r8 - 0.000354 * n_r8 ** 2) / l;

    if (nt <= l) break;
  }

  x = n <= 20 ? 0.961587 + 1.07703 * n_r8
              : n_r8 + 0.80861 * n_r8 ** 0.33333 + 0.07249 / n_r8 ** 0.33333;

  if (n == 0) x = 3.8317;

  l = 0;
  while (true) {
    const x0 = x;
    const [bjn, djn, fjn, byn, dyn, fyn] = jyndd(n, x);
    x = x - djn / fjn;
    if (1.0e-09 < Math.abs(x - x0)) continue;
    rj1[l++] = x;
    x = x + 3.1416 + (0.4955 + 0.0915 * n_r8 - 0.000435 * n_r8 ** 2) / l;

    if (nt <= l) break;
  }

  x = n <= 20 ? 1.19477 + 1.08933 * n_r8
              : n_r8 + 0.93158 * n_r8 ** 0.33333 + 0.26035 / n_r8 ** 0.33333;

  l = 0;
  while (true) {
    const x0 = x;
    const [bjn, djn, fjn, byn, dyn, fyn] = jyndd(n, x);
    x = x - byn / dyn;

    if (1.0e-09 < Math.abs(x - x0)) continue;

    ry0[l++] = x;
    x = x + 3.1416 + (0.312 + 0.0852 * n_r8 - 0.000403 * n_r8 ** 2) / l;

    if (nt <= l) break;
  }

  x = n <= 20 ? 2.67257 + 1.16099 * n_r8
              : n_r8 + 1.8211 * n_r8 ** 0.33333 + 0.94001 / n_r8 ** 0.33333;

  l = 0;
  while (true) {
    const x0 = x;
    const [bjn, djn, fjn, byn, dyn, fyn] = jyndd(n, x);
    x = x - dyn / fyn;

    if (1.0e-09 < Math.abs(x - x0)) continue;

    ry1[l++] = x;
    x = x + 3.1416 + (0.197 + 0.0643 * n_r8 - 0.000286 * n_r8 ** 2) / l;

    if (nt <= l) break;
  }

  return [rj0, rj1, ry0, ry1];
}
