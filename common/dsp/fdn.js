// Copyright 2022 Takamitsu Endo
// SPDX-License-Identifier: Apache-2.0

import {PcgRandom} from "../../lib/pcgrandom/pcgrandom.js";

import * as delay from "./delay.js";
import * as smoo from "./smoother.js";

export class FeedbackDelayNetwork {
  constructor(
    size,
    sampleRate,
    maxSecond,
    lowpassType = smoo.DoubleEMAFilter,
    highpassType = smoo.EMAHighpass,
    delayType = delay.Delay,
  ) {
    const create2dArray = (x, y) => {
      let a = new Array(x);
      for (let i = 0; i < a.length; ++i) a[i] = new Array(y).fill(0);
      return a;
    };

    this.matrix = create2dArray(size, size);
    this.buf = create2dArray(2, size);
    this.bufIndex = 0;

    this.delay = new Array(size);
    this.lowpass = new Array(size);
    this.highpass = new Array(size);
    for (let i = 0; i < size; ++i) {
      this.delay[i] = new delayType(sampleRate, maxSecond);
      this.lowpass[i] = new lowpassType();
      this.highpass[i] = new highpassType();
    }
  }

  randomOrthogonal(seed, identityAmount) {
    randomOrthogonal(this.matrix, seed, false, identityAmount);
  }

  randomizeMatrix(type, seed) {
    if (type === "SpecialOrthogonal") {
      randomSpecialOrthogonal(this.matrix, seed);
    } else if (type === "CirculantOrthogonal") {
      randomCirculantOrthogonal(this.matrix, seed, this.matrix.length);
    } else if (type === "Circulant4") {
      randomCirculantOrthogonal(this.matrix, seed, 4);
    } else if (type === "Circulant8") {
      randomCirculantOrthogonal(this.matrix, seed, 8);
    } else if (type === "Circulant16") {
      randomCirculantOrthogonal(this.matrix, seed, 16);
    } else if (type === "Circulant32") {
      randomCirculantOrthogonal(this.matrix, seed, 32);
    } else if (type === "UpperTriangularPositive") {
      randomUpperTriangular(this.matrix, seed, 0, 1);
    } else if (type === "UpperTriangularNegative") {
      randomUpperTriangular(this.matrix, seed, -1, 0);
    } else if (type === "LowerTriangularPositive") {
      randomLowerTriangular(this.matrix, seed, 0, 1);
    } else if (type === "LowerTriangularNegative") {
      randomLowerTriangular(this.matrix, seed, -1, 0);
    } else if (type === "SchroederPositive") {
      randomSchroeder(this.matrix, seed, 0, 1);
    } else if (type === "SchroederNegative") {
      randomSchroeder(this.matrix, seed, -1, 0);
    } else if (type === "AbsorbentPositive") {
      randomAbsorbent(this.matrix, seed, 0, 1);
    } else if (type === "AbsorbentNegative") {
      randomAbsorbent(this.matrix, seed, -1, 0);
    } else if (type === "Hadamard") {
      constructHadamardSylvester(this.matrix);
    } else if (type === "Conference") {
      constructConference(this.matrix);
    } else { // type === "orthogonal", or default.
      randomOrthogonal(this.matrix, seed);
    }
  }

  reset() {
    buf.forEach(row => { row.fill(0); });
    for (let i = 0; i < length; ++i) {
      delay.reset();
      lowpass.reset();
      highpass.reset();
    }
  }

  process(input, feedback) {
    this.bufIndex ^= 1;
    let front = this.buf[this.bufIndex];
    let back = this.buf[this.bufIndex ^ 1];
    front.fill(0);
    for (let i = 0; i < front.length; ++i) {
      for (let j = 0; j < front.length; ++j) front[i] += this.matrix[i][j] * back[j];
    }

    for (let i = 0; i < front.length; ++i) {
      front[i] = input + feedback * front[i];

      front[i] = this.delay[i].process(front[i]);
      front[i] = this.lowpass[i].process(front[i]);
      front[i] = this.highpass[i].process(front[i]);
    }

    return front.reduce((sum, val) => sum + val, 0);
  }
}

// Normal distribution.
function normalDist(rng) {
  return Math.sqrt(-2 * Math.log(1 - rng.number()))
    * Math.cos(2 * Math.PI * rng.number());
}

function uniformDist(rng, low, high) { return rng.number() * (high - low) + low; }

/**
If `identityAmount` is close to 0, then the result becomes close to identity matrix.

This algorithm is ported from `scipy.stats.ortho_group` in SciPy v1.8.0.
*/
export function randomOrthogonal(matrix, seed, fullRandom = true, identityAmount = 1) {
  let rng = new PcgRandom(BigInt(seed));

  for (let i = 0; i < matrix.length; ++i) {
    matrix[i].fill(0);
    matrix[i][i] = 1;
  }

  if (fullRandom) identityAmount = 1;

  let x = new Array(matrix.length);
  for (let n = 0; n < matrix.length; ++n) {
    const xRange = matrix.length - n;

    x[0] = fullRandom ? normalDist(rng) : 1;
    for (let i = 1; i < xRange; ++i) x[i] = identityAmount * normalDist(rng);

    let norm2 = 0;
    for (let i = 0; i < xRange; ++i) norm2 += x[i] * x[i];

    const x0 = x[0];

    const D = x0 >= 0 ? 1 : -1;
    x[0] += D * Math.sqrt(norm2);

    const denom = Math.sqrt((norm2 - x0 * x0 + x[0] * x[0]) / 2);
    for (let i = 0; i < xRange; ++i) x[i] /= denom;

    for (let row = 0; row < matrix.length; ++row) {
      let dotH = 0;
      for (let col = 0; col < xRange; ++col) dotH += matrix[col][row] * x[col];
      for (let col = 0; col < xRange; ++col) {
        matrix[col][row] = D * (matrix[col][row] - dotH * x[col]);
      }
    }
  }

  return matrix;
}

/**
Randomize `matrix` as special orthogonal matrix. This algorithm is ported from
`scipy.stats.special_ortho_group` in SciPy v1.8.0.
*/
export function randomSpecialOrthogonal(matrix, seed) {
  let rng = new PcgRandom(BigInt(seed));

  for (let i = 0; i < matrix.length; ++i) {
    matrix[i].fill(0);
    matrix[i][i] = 1;
  }

  let x = new Array(matrix.length);
  let D = new Array(matrix.length);
  for (let n = 0; n < matrix.length; ++n) {
    const xRange = matrix.length - n;
    for (let i = 0; i < xRange; ++i) x[i] = normalDist(rng);

    let norm2 = 0;
    for (let i = 0; i < xRange; ++i) norm2 += x[i] * x[i];

    const x0 = x[0];

    D[n] = x0 >= 0 ? 1 : -1;
    x[0] += D[n] * Math.sqrt(norm2);

    const denom = Math.sqrt((norm2 - x0 * x0 + x[0] * x[0]) / 2);
    for (let i = 0; i < xRange; ++i) x[i] /= denom;

    for (let row = 0; row < matrix.length; ++row) {
      let dotH = 0;
      for (let col = 0; col < xRange; ++col) dotH += matrix[col][row] * x[col];
      for (let col = 0; col < xRange; ++col) matrix[col][row] -= dotH * x[col];
    }
  }

  const back = matrix.length - 1;
  D[back] = (back & 0b1) == 0 ? 1 : -1; // Equivalent to `isEven(back) ? 1 : -1`.
  for (let i = 0; i < back; ++i) D[back] *= D[i];

  for (let row = 0; row < matrix.length; ++row) {
    for (let col = 0; col < matrix.length; ++col) {
      matrix[col][row] *= D[row];
    }
  }

  return matrix;
}

/**
Construct following matrix:

```
[[s * g1 - 1       , s * sqrt(g1 * g2), ... , s * sqrt(g1 * gN)],
 [s * sqrt(g2 * g1), s * g2 - 1       , ... , s * sqrt(g2 * gN)],
 [                 ,                  , ... ,                  ],
 [s * sqrt(gn * g1), s * sqrt(gN * g2), ... , s * gN - 1       ],
```

where `s = 2 / (g1 + g2 + ... + gN)`.

This is an implementation of eq. (24) and (25) in following paper.

- Rocchesso, Davide, and Julius O. Smith. "Circulant and elliptic feedback delay
networks for artificial reverberation." IEEE Transactions on Speech and Audio
Processing 5.1 (1997): 51-63.
*/
export function randomCirculantOrthogonal(matrix, seed, band) {
  let rng = new PcgRandom(BigInt(seed));

  let left = 0;
  if (band >= matrix.length) {
    band = matrix.length;
  } else {
    left = 1;
  }

  let source = new Array(matrix.length).fill(0);
  let sum = 0;
  do {
    sum = 0;
    for (let i = left; i < band; ++i) {
      source[i] = rng.number();
      sum += source[i];
    }
  } while (sum == 0); // Avoid 0 division.

  const scale = 2 / sum;

  let squared = source.map(v => Math.sqrt(v));

  for (let row = 0; row < matrix.length; ++row) {
    for (let col = 0; col < matrix.length; ++col) {
      matrix[row][col]
        = row == col ? scale * source[row] - 1 : scale * squared[row] * squared[col];
    }
  }

  return matrix;
}

/**
Using similar normalization technique of `randomCirculantOrthogonal`.
*/
export function randomUpperTriangular(matrix, seed, low, high) {
  let rng = new PcgRandom(BigInt(seed));
  if (low > high) [low, high] = [high, low];

  for (let i = 0; i < matrix.length; ++i) matrix[i].fill(0);

  for (let row = 0; row < matrix.length; ++row) {
    for (let col = row; col < matrix.length; ++col) {
      matrix[row][col] = uniformDist(rng, low, high);
    }
  }
  for (let col = 0; col < matrix.length; ++col) {
    let sum = 0;
    for (let row = 0; row < col + 1; ++row) sum += matrix[row][col];
    const scale = 2 / sum;
    matrix[col][col] = scale * matrix[col][col] - 1;
    for (let row = 0; row < col; ++row) matrix[row][col] *= scale;
  }

  return matrix;
}

/**
Using similar normalization technique of `randomCirculantOrthogonal`.
Transpose of `randomUpperTriangular`.
*/
export function randomLowerTriangular(matrix, seed, low, high) {
  let rng = new PcgRandom(BigInt(seed));
  if (low > high) [low, high] = [high, low];

  for (let i = 0; i < matrix.length; ++i) matrix[i].fill(0);

  for (let row = 0; row < matrix.length; ++row) {
    for (let col = 0; col < row + 1; ++col) {
      matrix[row][col] = uniformDist(rng, low, high);
    }
  }
  for (let col = 0; col < matrix.length; ++col) {
    let sum = 0;
    for (let row = col; row < matrix.length; ++row) sum += matrix[row][col];
    const scale = 2 / sum;
    matrix[col][col] = scale * matrix[col][col] - 1;
    for (let row = col + 1; row < matrix.length; ++row) {
      matrix[row][col] *= scale;
    }
  }

  return matrix;
}

/**
Construct following matrix:

```
[[g1,  0,  0,  0,       0,       0],
 [ 0, g2,  0,  0,       0,       0],
 [ 0,  0, g3,  0,       0,       0],
 [ 0,  0,  0, g4,       0,       0],
 [s5, s5, s5, s5, s5 * g5,       0],
 [v6, v6, v6, v6, s6 * G6, s6 * g6]]
```

where:
- s5 = 2 / (N - 2 + g5).
- s6 = 2 / ((N - 2) * g5 + G6 + g6).
- v6 = -g5 * s6.
- G6 = 1 - g5 * g5.
- N is the size of square matrix.

This is an implenetation of section IV. A. in following paper, which is the same one
used in `randomAbsorbent`. Added normalization to last and second last rows for
stability. Naive implementation is unstable with stereo cross when delay time is small.

- Schlecht, Sebastian J., and Emanuel AP Habets. "On lossless feedback delay networks."
IEEE Transactions on Signal Processing 65.6 (2016): 1554-1564.
*/
export function randomSchroeder(matrix, seed, low, high) {
  const dim = matrix.length;
  console.assert(
    dim >= 2, "FeedbackDelayNetwork.randomSchroeder(): length must be >= 2.",
    new Error());

  let rng = new PcgRandom(BigInt(seed));
  if (low > high) [low, high] = [high, low];

  for (let i = 0; i < dim; ++i) matrix[i].fill(0);

  for (let idx = 0; idx < dim; ++idx) {
    matrix[idx][idx] = uniformDist(rng, low, high);
  }

  const paraGain = matrix[dim - 2][dim - 2];
  const lastGain = 1 - paraGain * paraGain;
  const scale2 = 2 / ((dim - 2) + paraGain);
  const scale1 = 2 / ((dim - 2) * paraGain + lastGain + matrix[dim - 1][dim - 1]);
  for (let col = 0; col < dim - 1; ++col) {
    matrix[dim - 2][col] = scale2;
    matrix[dim - 1][col] = -paraGain * scale1;
  }
  matrix[dim - 1][dim - 2] = lastGain * scale1;

  return matrix;
}

/**
Construct following matrix:

```
[[-A * G  , A ],
 [ I - G^2, G ]]
```

- I is identity matrix.
- G is diagonal matrix represents all-pass gain. diag(g1, g2, ...).
- A is orthogonal matrix.

This is an implenetation of section IV. B. in following paper, which is the same one
used in `randomSchroeder`. Generated feedback matrix is equivalent to nested allpass.

- Schlecht, Sebastian J., and Emanuel AP Habets. "On lossless feedback delay networks."
IEEE Transactions on Signal Processing 65.6 (2016): 1554-1564.
*/
export function randomAbsorbent(matrix, seed, low, high) {
  console.assert(
    matrix.length >= 2, "FeedbackDelayNetwork.randomAbsorbent(): length must be >= 2.",
    new Error());
  console.assert(
    matrix.length % 2 === 0,
    "FeedbackDelayNetwork.randomAbsorbent(): length must be even.", new Error());

  let rng = new PcgRandom(BigInt(seed));
  if (low > high) [low, high] = [high, low];

  const half = Math.floor(matrix.length / 2);

  for (let i = 0; i < matrix.length; ++i) matrix[i].fill(0);

  let A = new Array(half).fill(0).map(v => new Array(half));
  randomOrthogonal(A, seed);

  for (let col = 0; col < half; ++col) {
    const gain = uniformDist(rng, low, high);
    matrix[half + col][half + col] = gain;     // Fill lower right.
    matrix[half + col][col] = 1 - gain * gain; // Fill lower left.
    for (let row = 0; row < half; ++row) {
      matrix[row][half + col] = A[row][col];  // Fill top right.
      matrix[row][col] = -A[row][col] * gain; // Fill top left
    }
  }

  return matrix;
}

/** Sylvester's construction of Hadamard matrix. */
export function constructHadamardSylvester(matrix) {
  // This static_assert condition is obtained from: https://stackoverflow.com/a/19399478
  console.assert(
    matrix.length && ((matrix.length & (matrix.length - 1)) == 0),
    "FeedbackDelayNetwork.constructHadamardSylvester(): matrix size must be power of 2.",
    new Error());

  matrix[0][0] = 1 / Math.sqrt(matrix.length);

  let start = 1;
  let end = 2;
  while (start < matrix.length) {
    for (let row = start; row < end; ++row) {
      for (let col = start; col < end; ++col) {
        const value = matrix[row - start][col - start];
        matrix[row - start][col] = value; // Upper right.
        matrix[row][col - start] = value; // Lower left.
        matrix[row][col] = -value;        // Lower right.
      }
    }
    start *= 2;
    end *= 2;
  }

  return matrix;
}

/**
Construct a kind of conference matrix which is used in Paley's construction of Hadamard
matrix.

`dim` must follow the conditions below:
- `dim mod 4 == 2`.
- `dim - 1` is sum of 2 squared integer.

This implementation use the sequence from https://oeis.org/A000952 to determine the size
of matrix. It's possible to construct this kind of conference matrix greater than size
of 398.
*/
export function constructConference(matrix) {
  const candidates = [
    398, 390, 378, 374, 370, 366, 362, 354, 350, 338, 334, 326, 318, 314, 306, 294, 290,
    282, 278, 270, 266, 262, 258, 246, 242, 234, 230, 226, 222, 206, 198, 194, 186, 182,
    174, 170, 158, 154, 150, 146, 138, 126, 122, 118, 114, 110, 102, 98,  90,  86,  82,
    74,  66,  62,  54,  50,  46,  42,  38,  30,  26,  18,  14,  10,  6,   2
  ];

  const dimension = candidates.find(elem => elem <= matrix.length);
  console.assert(dimension !== undefined, "FDN matrix is too small.", new Error());

  const modulo = dimension - 1;

  let quadraticResidue = new Set();
  for (let i = 1; i < modulo; ++i) quadraticResidue.add((i * i) % modulo);
  quadraticResidue.delete(0); // Just in case.

  const value = 1 / Math.sqrt(modulo);
  let symbol = [0]; // Legendre symbol of quadratic residue.
  for (let i = 1; i < modulo; ++i) {
    symbol.push(quadraticResidue.has(i) ? value : -value);
  }

  for (let i = 0; i < matrix.length; ++i) matrix[i].fill(0);
  matrix[0][0] = 0;
  for (let i = 1; i < dimension; ++i) {
    matrix[0][i] = value;
    matrix[i][0] = value;
  }
  for (let row = 1; row < dimension; ++row) {
    for (let col = 1; col < dimension; ++col) matrix[row][col] = symbol[col - 1];
    symbol.unshift(symbol.pop());
  }

  return matrix;
}

/**
Householder matrix.

`matrix` is 2D array of a square matrix.
`seed` is 1D array of a vector which length is the same as `matrix`.

Reference: https://nhigham.com/2020/09/15/what-is-a-householder-matrix/
*/
export function constructHouseholder(matrix, seed, nonZero = false) {
  let denom = seed.reduce((sum, val) => sum + val * val, 0);

  if (denom <= Number.EPSILON) {
    for (let i = 0; i < matrix.length; ++i) {
      for (let j = 0; j < matrix[i].length; ++j) {
        matrix[i][j] = nonZero && i === j ? 1 : 0;
      }
    }
    return matrix;
  }

  const scale = -2 / denom;

  for (let i = 0; i < seed.length; ++i) {
    // Diagonal elements.
    matrix[i][i] = 1 + scale * seed[i] * seed[i];

    // Non-diagonal elements.
    for (let j = i + 1; j < seed.length; ++j) {
      const value = scale * seed[i] * seed[j];
      matrix[i][j] = value;
      matrix[j][i] = value;
    }
  }

  return matrix;
}
