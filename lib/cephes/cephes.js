/*
Ported from: https://netlib.org/cephes/
Ported functions: gamma, igam, igamc, spence, sici

Below is the original readme including license.

```
   Some software in this archive may be from the book _Methods and
Programs for Mathematical Functions_ (Prentice-Hall or Simon & Schuster
International, 1989) or from the Cephes Mathematical Library, a
commercial product. In either event, it is copyrighted by the author.
What you see here may be used freely but it comes with no support or
guarantee.

   The two known misprints in the book are repaired here in the
source listings for the gamma function and the incomplete beta
integral.


   Stephen L. Moshier
   moshier@na-net.ornl.gov
```

Modification:
- Changed `sici` to return values instead of NaN, when `x > 1.0e9` and x is ±inf.
*/

function polevl(x, coef) {
  let ans = coef[0];
  for (let i = 1; i < coef.length; ++i) ans = ans * x + coef[i];
  return ans;
}

function p1evl(x, coef) {
  let ans = x + coef[0];
  for (let i = 1; i < coef.length; ++i) ans = ans * x + coef[i];
  return ans;
}

// subroutine of gamma.
function stirf(x) {
  const STIR = [
    7.87311395793093628397E-4, -2.29549961613378126380E-4, -2.68132617805781232825E-3,
    3.47222221605458667310E-3, 8.33333333333482257126E-2
  ];

  let w, y, v;

  w = 1 / x;
  w = 1.0 + w * polevl(w, STIR);
  y = Math.exp(x);

  if (x > 143.01608) {
    v = Math.pow(x, 0.5 * x - 0.25);
    y = v * (v / y);
  } else {
    y = Math.pow(x, x - 0.5) / y;
  }
  return 2.5066282746310007 * y * w;
}

export function gamma(x) {
  const P = [
    1.60119522476751861407E-4, 1.19135147006586384913E-3, 1.04213797561761569935E-2,
    4.76367800457137231464E-2, 2.07448227648435975150E-1, 4.94214826801497100753E-1,
    9.99999999999999996796E-1
  ];
  const Q = [
    -2.31581873324120129819E-5, 5.39605580493303397842E-4, -4.45641913851797240494E-3,
    1.18139785222060435552E-2, 3.58236398605498653373E-2, -2.34591795718243348568E-1,
    7.14304917030273074085E-2, 1.00000000000000000320E0
  ];

  if (Number.isNaN(x)) return (x);
  if (x == Number.POSITIVE_INFINITY) return (x);
  if (x == -Number.NEGATIVE_INFINITY) return NaN;

  let q = Math.abs(x);
  if (q > 33.0) {
    if (x >= 0.0) return stirf(x);

    let p = Math.floor(q);
    if (p == q) return NaN;

    const sgngam = (p & 1) == 0 ? -1 : 1; // In original C code, `p` is casted into int.

    let z = q - p;
    if (z > 0.5) {
      p += 1.0;
      z = q - p;
    }
    z = q * Math.sin(Math.PI * z);
    if (z == 0.0) return sgngam * Number.POSITIVE_INFINITY;
    z = Math.abs(z);
    z = Math.PI / (z * stirf(q));
    return sgngam * z;
  }

  let z = 1.0;
  while (x >= 3.0) {
    x -= 1.0;
    z *= x;
  }
  while (x < 0.0) {
    if (x > -1.E-9) return x == 0.0 ? NaN : (z / ((1.0 + 0.5772156649015329 * x) * x));
    z /= x;
    x += 1.0;
  }
  while (x < 2.0) {
    if (x < 1.e-9) return x == 0.0 ? NaN : (z / ((1.0 + 0.5772156649015329 * x) * x));
    z /= x;
    x += 1.0;
  }

  if (x == 2.0) return z;
  x -= 2.0;
  return z * polevl(x, P) / polevl(x, Q);
}

export function lgam(x) {
  const A = [
    8.11614167470508450300E-4, -5.95061904284301438324E-4, 7.93650340457716943945E-4,
    -2.77777777730099687205E-3, 8.33333333333331927722E-2
  ];
  const B = [
    -1.37825152569120859100E3, -3.88016315134637840924E4, -3.31612992738871184744E5,
    -1.16237097492762307383E6, -1.72173700820839662146E6, -8.53555664245765465627E5
  ];
  const C = [
    /* 1.00000000000000000000E0, */
    -3.51815701436523470549E2, -1.70642106651881159223E4, -2.20528590553854454839E5,
    -1.13933444367982507207E6, -2.53252307177582951285E6, -2.01889141433532773231E6
  ];
  const D =
    [7.9365079365079365079365e-4, 2.7777777777777777777778e-3, 0.0833333333333333333333];

  let sgngam = 1;

  const rec = (x) => {
    if (Number.isNaN(x)) return x;
    if (!Number.isFinite(x)) return Number.POSITIVE_INFINITY;

    if (x < -34.0) {
      const q = -x;
      const w = lgam(q);
      let p = Math.floor(q);
      if (p == q) return Number.POSITIVE_INFINITY;
      sgngam = (p & 1) == 0 ? -1 : 1; // In original C code, `p` is casted into int.
      let z = q - p;
      if (z > 0.5) {
        p += 1.0;
        z = p - q;
      }
      z = q * Math.sin(Math.PI * z);
      if (z == 0.0) return Number.POSITIVE_INFINITY;
      z = 1.14472988584940017414 - Math.log(z) - w;
      return z;
    }

    if (x < 13.0) {
      let z = 1.0;
      let p = 0.0;
      let u = x;
      while (u >= 3.0) {
        p -= 1.0;
        u = x + p;
        z *= u;
      }
      while (u < 2.0) {
        if (u == 0.0) return Number.POSITIVE_INFINITY;
        z /= u;
        p += 1.0;
        u = x + p;
      }
      if (z < 0.0) {
        sgngam = -1;
        z = -z;
      } else
        sgngam = 1;
      if (u == 2.0) return (Math.log(z));
      p -= 2.0;
      x = x + p;
      p = x * polevl(x, B) / p1evl(x, C);
      return Math.log(z) + p;
    }

    if (x > 2.556348e305) return sgngam * Number.POSITIVE_INFINITY;

    const q = (x - 0.5) * Math.log(x) - x + 0.91893853320467274178;
    if (x > 1.0e8) return q;

    const p = 1.0 / (x * x);
    return x >= 1000.0 ? q + polevl(p, D) / x : q + polevl(p, A) / x;
  };

  return rec(x);
}

// Upper incomplete gamma function. Both arguments must be positive.
export function igam(a, x) {
  if (x <= 0 || a <= 0) return 0.0;
  if (x > 1.0 && x > a) return 1.0 - igamc(a, x);

  let ax = a * Math.log(x) - x - lgam(a);
  if (ax < -7.09782712893383996843E2) return 0.0;
  ax = Math.exp(ax);

  let r = a;
  let c = 1.0;
  let ans = 1.0;
  do {
    r += 1.0;
    c *= x / r;
    ans += c;
  } while (c > ans * Number.EPSILON);
  return ans * ax / a;
}

// Lower incomplete gamma function. Both arguments must be positive.
export function igamc(a, x) {
  if (x == Number.POSITIVE_INFINITY) return 0.0;
  if (x == Number.NEGATIVE_INFINITY) return NaN;
  if (x <= 0 || a <= 0) return 1.0;
  if (x < 1.0 || x < a) return 1.0 - igam(a, x);

  let ax = a * Math.log(x) - x - lgam(a);
  if (ax < -7.09782712893383996843E2) return 0.0;
  ax = Math.exp(ax);

  let t, y = 1.0 - a, z = x + y + 1.0, c = 0.0, pkm2 = 1.0, qkm2 = x, pkm1 = x + 1.0,
         qkm1 = z * x, ans = pkm1 / qkm1;
  do {
    c += 1.0;
    y += 1.0;
    z += 2.0;
    const yc = y * c;
    const pk = pkm1 * z - pkm2 * yc;
    const qk = qkm1 * z - qkm2 * yc;
    if (qk != 0) {
      const r = pk / qk;
      t = Math.abs((ans - r) / r);
      ans = r;
    } else
      t = 1.0;
    pkm2 = pkm1;
    pkm1 = pk;
    qkm2 = qkm1;
    qkm1 = qk;
    if (Math.abs(pk) > 4.503599627370496e15) {
      pkm2 *= 2.22044604925031308085e-16;
      pkm1 *= 2.22044604925031308085e-16;
      qkm2 *= 2.22044604925031308085e-16;
      qkm1 *= 2.22044604925031308085e-16;
    }
  } while (t > Number.EPSILON);

  return ans * ax;
}

export function spence(x) {
  const A = [
    4.65128586073990045278E-5, 7.31589045238094711071E-3, 1.33847639578309018650E-1,
    8.79691311754530315341E-1, 2.71149851196553469920E0, 4.25697156008121755724E0,
    3.29771340985225106936E0, 1.00000000000000000126E0
  ];
  const B = [
    6.90990488912553276999E-4, 2.54043763932544379113E-2, 2.82974860602568089943E-1,
    1.41172597751831069617E0, 3.63800533345137075418E0, 5.03278880143316990390E0,
    3.54771340985225096217E0, 9.99999999999999998740E-1
  ];

  if (Number.isNaN(x) || x < 0.0) return NaN;
  if (x == 1.0) return 0.0;
  if (x == 0.0) return Math.PI * Math.PI / 6.0;

  let flag = 0;

  if (x > 2.0) {
    x = 1.0 / x;
    flag |= 2;
  }

  let w;
  if (x > 1.5) {
    w = (1.0 / x) - 1.0;
    flag |= 2;
  } else if (x < 0.5) {
    w = -x;
    flag |= 1;
  } else
    w = x - 1.0;

  let y = -w * polevl(w, A) / polevl(w, B);

  if (flag & 1) y = (Math.PI * Math.PI) / 6.0 - Math.log(x) * Math.log(1.0 - x) - y;

  if (flag & 2) {
    const z = Math.log(x);
    y = -0.5 * z * z - y;
  }

  return y;
}

// Return: [si, ci], Usage: `let [si, ci] = sici(x);`
export function sici(x) {
  const SN = [
    -8.39167827910303881427E-11, 4.62591714427012837309E-8, -9.75759303843632795789E-6,
    9.76945438170435310816E-4, -4.13470316229406538752E-2, 1.00000000000000000302E0
  ];
  const SD = [
    2.03269266195951942049E-12, 1.27997891179943299903E-9, 4.41827842801218905784E-7,
    9.96412122043875552487E-5, 1.42085239326149893930E-2, 9.99999999999999996984E-1
  ];
  const CN = [
    2.02524002389102268789E-11, -1.35249504915790756375E-8, 3.59325051419993077021E-6,
    -4.74007206873407909465E-4, 2.89159652607555242092E-2, -1.00000000000000000080E0
  ];
  const CD = [
    4.07746040061880559506E-12, 3.06780997581887812692E-9, 1.23210355685883423679E-6,
    3.17442024775032769882E-4, 5.10028056236446052392E-2, 4.00000000000000000080E0
  ];
  const FN4 = [
    4.23612862892216586994E0, 5.45937717161812843388E0, 1.62083287701538329132E0,
    1.67006611831323023771E-1, 6.81020132472518137426E-3, 1.08936580650328664411E-4,
    5.48900223421373614008E-7
  ];
  const FD4 = [
    8.16496634205391016773E0, 7.30828822505564552187E0, 1.86792257950184183883E0,
    1.78792052963149907262E-1, 7.01710668322789753610E-3, 1.10034357153915731354E-4,
    5.48900252756255700982E-7
  ];
  const FN8 = [
    4.55880873470465315206E-1, 7.13715274100146711374E-1, 1.60300158222319456320E-1,
    1.16064229408124407915E-2, 3.49556442447859055605E-4, 4.86215430826454749482E-6,
    3.20092790091004902806E-8, 9.41779576128512936592E-11, 9.70507110881952024631E-14
  ];
  const FD8 = [
    9.17463611873684053703E-1, 1.78685545332074536321E-1, 1.22253594771971293032E-2,
    3.58696481881851580297E-4, 4.92435064317881464393E-6, 3.21956939101046018377E-8,
    9.43720590350276732376E-11, 9.70507110881952025725E-14
  ];
  const GN4 = [
    8.71001698973114191777E-2, 6.11379109952219284151E-1, 3.97180296392337498885E-1,
    7.48527737628469092119E-2, 5.38868681462177273157E-3, 1.61999794598934024525E-4,
    1.97963874140963632189E-6, 7.82579040744090311069E-9
  ];
  const GD4 = [
    1.64402202413355338886E0, 6.66296701268987968381E-1, 9.88771761277688796203E-2,
    6.22396345441768420760E-3, 1.73221081474177119497E-4, 2.02659182086343991969E-6,
    7.82579218933534490868E-9
  ];
  const GN8 = [
    6.97359953443276214934E-1, 3.30410979305632063225E-1, 3.84878767649974295920E-2,
    1.71718239052347903558E-3, 3.48941165502279436777E-5, 3.47131167084116673800E-7,
    1.70404452782044526189E-9, 3.85945925430276600453E-12, 3.14040098946363334640E-15
  ];
  const GD8 = [
    1.68548898811011640017E0, 4.87852258695304967486E-1, 4.67913194259625806320E-2,
    1.90284426674399523638E-3, 3.68475504442561108162E-5, 3.57043223443740838771E-7,
    1.72693748966316146736E-9, 3.87830166023954706752E-12, 3.14040098946363335242E-15
  ];

  if (Number.isNaN(x)) return [NaN, NaN];
  if (x == 0.0) return [0.0, Number.NEGATIVE_INFINITY];

  let sign = 0;
  if (x < 0.0) {
    sign = -1;
    x = -x;
  }

  const PIO2 = Math.PI / 2;
  if (x > 1.0e9) {
    return Number.isFinite(x) ? [PIO2 - Math.cos(x) / x, Math.sin(x) / x]
                              : (sign == -1 ? [-PIO2, NaN] : [PIO2, 0.0]);
  }

  if (x <= 4.0) {
    const z = x * x;
    const s = x * polevl(z, SN) / polevl(z, SD);
    const c = z * polevl(z, CN) / polevl(z, CD);
    const si = sign ? -s : s;
    const ci = 0.57721566490153286061 + Math.log(x) + c;
    return [si, ci];
  }

  const s = Math.sin(x);
  const c = Math.cos(x);
  const z = 1.0 / (x * x);
  let f, g;
  if (x < 8.0) {
    f = polevl(z, FN4) / (x * p1evl(z, FD4));
    g = z * polevl(z, GN4) / p1evl(z, GD4);
  } else {
    f = polevl(z, FN8) / (x * p1evl(z, FD8));
    g = z * polevl(z, GN8) / p1evl(z, GD8);
  }
  const si = PIO2 - f * c - g * s;
  const ci = f * s - g * c;
  return [sign ? -si : si, ci];
}
