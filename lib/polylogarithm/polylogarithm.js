// SPDX-License-Identifier: MIT
// Ported from: https://github.com/Expander/polylogarithm

export function Li2(x) {
  const P = [
    0.9999999999999999502e+0, -2.6883926818565423430e+0, 2.6477222699473109692e+0,
    -1.1538559607887416355e+0, 2.0886077795020607837e-1, -1.0859777134152463084e-2
  ];
  const Q = [
    1.0000000000000000000e+0, -2.9383926818565635485e+0, 3.2712093293018635389e+0,
    -1.7076702173954289421e+0, 4.1596017228400603836e-1, -3.9801343754084482956e-2,
    8.2743668974466659035e-4
  ];

  let y = 0, r = 0, s = 1;

  // transform to [0, 1/2]
  if (x < -1) {
    const l = Math.log(1 - x);
    y = 1 / (1 - x);
    r = -Math.PI * Math.PI / 6 + l * (0.5 * l - Math.log(-x));
    s = 1;
  } else if (x == -1) {
    return -Math.PI * Math.PI / 12;
  } else if (x < 0) {
    const l = Math.log1p(-x);
    y = x / (x - 1);
    r = -0.5 * l * l;
    s = -1;
  } else if (x == 0) {
    return x;
  } else if (x < 0.5) {
    y = x;
    r = 0;
    s = 1;
  } else if (x < 1) {
    y = 1 - x;
    r = Math.PI * Math.PI / 6 - Math.log(x) * Math.log1p(-x);
    s = -1;
  } else if (x == 1) {
    return Math.PI * Math.PI / 6;
  } else if (x < 2) {
    const l = Math.log(x);
    y = 1 - 1 / x;
    r = Math.PI * Math.PI / 6 - l * (Math.log(y) + 0.5 * l);
    s = 1;
  } else {
    const l = Math.log(x);
    y = 1 / x;
    r = Math.PI * Math.PI / 3 - 0.5 * l * l;
    s = -1;
  }

  const y2 = y * y;
  const y4 = y2 * y2;
  const p = P[0] + y * P[1] + y2 * (P[2] + y * P[3]) + y4 * (P[4] + y * P[5]);
  const q = Q[0] + y * Q[1] + y2 * (Q[2] + y * Q[3]) + y4 * (Q[4] + y * Q[5] + y2 * Q[6]);

  return r + s * y * p / q;
}

/// Li_3(x) for x in [-1,0]
function li3_neg(x) {
  const cp = [
    0.9999999999999999795e+0, -2.0281801754117129576e+0, 1.4364029887561718540e+0,
    -4.2240680435713030268e-1, 4.7296746450884096877e-2, -1.3453536579918419568e-3
  ];
  const cq = [
    1.0000000000000000000e+0, -2.1531801754117049035e+0, 1.6685134736461140517e+0,
    -5.6684857464584544310e-1, 8.1999463370623961084e-2, -4.0756048502924149389e-3,
    3.4316398489103212699e-5
  ];

  const x2 = x * x;
  const x4 = x2 * x2;
  const p = cp[0] + x * cp[1] + x2 * (cp[2] + x * cp[3]) + x4 * (cp[4] + x * cp[5]);
  const q = cq[0] + x * cq[1] + x2 * (cq[2] + x * cq[3])
    + x4 * (cq[4] + x * cq[5] + x2 * cq[6]);

  return x * p / q;
}

/// Li_3(x) for x in [0,1/2]
function li3_pos(x) {
  const cp = [
    0.9999999999999999893e+0, -2.5224717303769789628e+0, 2.3204919140887894133e+0,
    -9.3980973288965037869e-1, 1.5728950200990509052e-1, -7.5485193983677071129e-3
  ];
  const cq = [
    1.0000000000000000000e+0, -2.6474717303769836244e+0, 2.6143888433492184741e+0,
    -1.1841788297857667038e+0, 2.4184938524793651120e-1, -1.8220900115898156346e-2,
    2.4927971540017376759e-4
  ];

  const x2 = x * x;
  const x4 = x2 * x2;
  const p = cp[0] + x * cp[1] + x2 * (cp[2] + x * cp[3]) + x4 * (cp[4] + x * cp[5]);
  const q = cq[0] + x * cq[1] + x2 * (cq[2] + x * cq[3])
    + x4 * (cq[4] + x * cq[5] + x2 * cq[6]);

  return x * p / q;
}

export function Li3(x) {
  const zeta2 = 1.6449340668482264;
  const zeta3 = 1.2020569031595943;

  // transformation to [-1,0] and [0,1/2]
  if (x < -1) {
    const l = Math.log(-x);
    return li3_neg(1 / x) - l * (zeta2 + 1.0 / 6 * l * l);
  } else if (x == -1) {
    return -0.75 * zeta3;
  } else if (x < 0) {
    return li3_neg(x);
  } else if (x == 0) {
    return x;
  } else if (x < 0.5) {
    return li3_pos(x);
  } else if (x == 0.5) {
    return 0.53721319360804020;
  } else if (x < 1) {
    const l = Math.log(x);
    return -li3_neg(1 - 1 / x) - li3_pos(1 - x) + zeta3
      + l * (zeta2 + l * (-0.5 * Math.log1p(-x) + 1.0 / 6 * l));
  } else if (x == 1) {
    return zeta3;
  } else if (x < 2) {
    const l = Math.log(x);
    return -li3_neg(1 - x) - li3_pos(1 - 1 / x) + zeta3
      + l * (zeta2 + l * (-0.5 * Math.log(x - 1) + 1.0 / 6 * l));
  } else { // x >= 2.0
    const l = Math.log(x);
    return li3_pos(1 / x) + l * (2 * zeta2 - 1.0 / 6 * l * l);
  }
}

/// Li_4(x) for x in [-1,0]
function li4_neg(x) {
  const cp = [
    0.9999999999999999952e+0, -1.8532099956062184217e+0, 1.1937642574034898249e+0,
    -3.1817912243893560382e-1, 3.2268284189261624841e-2, -8.3773570305913850724e-4
  ];
  const cq = [
    1.0000000000000000000e+0, -1.9157099956062165688e+0, 1.3011504531166486419e+0,
    -3.7975653506939627186e-1, 4.5822723996558783670e-2, -1.8023912938765272341e-3,
    1.0199621542882314929e-5
  ];

  const x2 = x * x;
  const x4 = x2 * x2;
  const p = cp[0] + x * cp[1] + x2 * (cp[2] + x * cp[3]) + x4 * (cp[4] + x * cp[5]);
  const q = cq[0] + x * cq[1] + x2 * (cq[2] + x * cq[3])
    + x4 * (cq[4] + x * cq[5] + x2 * cq[6]);

  return x * p / q;
}

/// Li_4(x) for x in [0,1/2]
function li4_half(x) {
  const cp = [
    1.0000000000000000414e+0, -2.0588072418045364525e+0, 1.4713328756794826579e+0,
    -4.2608608613069811474e-1, 4.2975084278851543150e-2, -6.8314031819918920802e-4
  ];
  const cq = [
    1.0000000000000000000e+0, -2.1213072418045207223e+0, 1.5915688992789175941e+0,
    -5.0327641401677265813e-1, 6.1467217495127095177e-2, -1.9061294280193280330e-3
  ];

  const x2 = x * x;
  const x4 = x2 * x2;
  const p = cp[0] + x * cp[1] + x2 * (cp[2] + x * cp[3]) + x4 * (cp[4] + x * cp[5]);
  const q = cq[0] + x * cq[1] + x2 * (cq[2] + x * cq[3]) + x4 * (cq[4] + x * cq[5]);

  return x * p / q;
}

/// Li_4(x) for x in [1/2,8/10]
function li4_mid(x) {
  const cp = [
    3.2009826406098890447e-9, 9.9999994634837574160e-1, -2.9144851228299341318e+0,
    3.1891031447462342009e+0, -1.6009125158511117090e+0, 3.5397747039432351193e-1,
    -2.5230024124741454735e-2
  ];
  const cq = [
    1.0000000000000000000e+0, -2.9769855248411488460e+0, 3.3628208295110572579e+0,
    -1.7782471949702788393e+0, 4.3364007973198649921e-1, -3.9535592340362510549e-2,
    5.7373431535336755591e-4
  ];

  const x2 = x * x;
  const x4 = x2 * x2;
  const p = cp[0] + x * cp[1] + x2 * (cp[2] + x * cp[3])
    + x4 * (cp[4] + x * cp[5] + x2 * cp[6]);
  const q = cq[0] + x * cq[1] + x2 * (cq[2] + x * cq[3])
    + x4 * (cq[4] + x * cq[5] + x2 * cq[6]);

  return p / q;
}

/// Li_4(x) for x in [8/10,1]
function li4_one(x) {
  const zeta2 = 1.6449340668482264;
  const zeta3 = 1.2020569031595943;
  const zeta4 = 1.0823232337111382;
  const l = Math.log(x);
  const l2 = l * l;

  return zeta4 +                                 //
         l*(zeta3 +                              //
         l*(0.5*zeta2 +                          //
         l*(11.0/36 - 1.0/6*Math.log(-l) +       //
         l*(-1.0/48 +                            //
         l*(-1.0/1440 +                          //
         l2*(1.0/604800 - 1.0/91445760*l2)))))); //
}

export function Li4(x) {
  const zeta2 = 1.6449340668482264;
  const zeta4 = 1.0823232337111382;

  let app = 0, rest = 0, sgn = 1;

  // transform x to [-1,1]
  if (x < -1) {
    const l = Math.log(-x);
    const l2 = l * l;
    x = 1 / x;
    rest = -7.0 / 4 * zeta4 + l2 * (-0.5 * zeta2 - 1.0 / 24 * l2);
    sgn = -1;
  } else if (x == -1) {
    return -7.0 / 8 * zeta4;
  } else if (x == 0) {
    return x;
  } else if (x < 1) {
    rest = 0;
    sgn = 1;
  } else if (x == 1) {
    return zeta4;
  } else { // x > 1
    const l = Math.log(x);
    const l2 = l * l;
    x = 1 / x;
    rest = 2 * zeta4 + l2 * (zeta2 - 1.0 / 24 * l2);
    sgn = -1;
  }

  if (x < 0) {
    app = li4_neg(x);
  } else if (x < 0.5) {
    app = li4_half(x);
  } else if (x < 0.8) {
    app = li4_mid(x);
  } else { // x <= 1
    app = li4_one(x);
  }

  return rest + sgn * app;
}
