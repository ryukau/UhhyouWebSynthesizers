// Copyright Takamitsu Endo (ryukau@gmail.com)
// SPDX-License-Identifier: Apache-2.0

//
// Do not import any other code to avoid circular dependency.
//

export function clamp(value, low, high) { return Math.max(low, Math.min(value, high)); }
export function lerp(v0, v1, t) { return v0 + t * (v1 - v0); }

export function dbToAmp(dB) { return Math.pow(10, dB / 20); }
export function ampToDB(amplitude) { return 20 * Math.log10(amplitude); }

export function midiPitchToFreq(pitch) { return 440 * Math.exp((pitch - 69) * (Math.LN2 / 12)); }
export function freqToMidiPitch(freq) { return 69 + 12 * Math.log2(freq / 440); }

export const syntonicCommaRatio = 81 / 80;
export const syntonicCommaCents = Math.log2(81 / 80) * 1200;

const nextafter_buffer = new ArrayBuffer(8);
const nextafter_f64 = new Float64Array(nextafter_buffer);
const nextafter_u64 = new BigUint64Array(nextafter_buffer);

/**
 * Returns the next representable IEEE 754 64-bit float after `x` in the direction of `y`.
 *
 * @param {number} x - The starting value.
 * @param {number} y - The direction value.
 * @returns {number} The next floating-point value.
 */
export function nextafter(x, y) {
  x = Number(x);
  y = Number(y);

  if (Number.isNaN(x) || Number.isNaN(y)) { return NaN; }

  if (x === y) { return y; }

  if (x === 0) { return y > 0 ? Number.MIN_VALUE : -Number.MIN_VALUE; }

  nextafter_f64[0] = x;

  if ((x > 0 && y > x) || (x < 0 && y < x)) {
    nextafter_u64[0]++;
  } else {
    nextafter_u64[0]--;
  }

  return nextafter_f64[0];
}

function test_nextafter() {
  // Step up from 1.0
  console.log(nextafter(1.0, 2.0)); // => 1.0000000000000002

  // Step down from 1.0
  console.log(nextafter(1.0, 0.0)); // => 0.9999999999999999

  // Zeros
  console.log(nextafter(0.0, 1.0));  // =>  5e-324 (Number.MIN_VALUE)
  console.log(nextafter(0.0, -1.0)); // => -5e-324 (-Number.MIN_VALUE)
  console.log(nextafter(0.0, -0.0)); // => -0

  // Infinities
  console.log(nextafter(Number.MAX_VALUE, Infinity)); // => Infinity
  console.log(nextafter(Infinity, 0));  // => 1.7976931348623157e+308 (Number.MAX_VALUE)
  console.log(nextafter(-Infinity, 0)); // => -1.7976931348623157e+308 (-Number.MAX_VALUE)

  // NaN
  console.log(nextafter(NaN, 1.0)); // => NaN
}

/**
 * Generates a uniformly distributed double-precision floating-point number in [low,
 * high).
 *
 * @param {number} low - Lower bound (inclusive).
 * @param {number} high - Upper bound (exclusive).
 * @param {Function} [rng=Math.random] - Optional PRNG returning a double in [0, 1).
 * @returns {number} Uniformly distributed float in [low, high).
 */
export function randomUniformFloat(low, high, rng = Math.random) {
  if (typeof low !== 'number' || typeof high !== 'number') {
    throw new TypeError('low and high must be numbers.');
  }
  if (Number.isNaN(low) || Number.isNaN(high)) { return NaN; }

  if (low > high) { throw new RangeError('low must be less than or equal to high.'); }
  if (!Number.isFinite(low) || !Number.isFinite(high)) {
    throw new RangeError('low and high must be finite numbers.');
  }

  if (low === high) { return low; }

  const range = high - low;
  let val;

  do {
    const u = rng(); // u in [0, 1)
    if (Number.isFinite(range)) {
      val = low + u * range;
    } else {
      val = (1 - u) * low + u * high;
    }
  } while (val >= high); // Rejection sampling guarantees strict val < high

  return val;
}

/**
 * Generates a uniformly distributed safe integer in [low, high).
 *
 * @param {number} low - Lower bound (inclusive, safe integer).
 * @param {number} high - Upper bound (exclusive, safe integer).
 * @param {Function} [rng=Math.random] - Optional PRNG returning a double in [0, 1).
 * @returns {number} Uniformly distributed integer in [low, high).
 */
export function randomUniformInt(low, high, rng = Math.random) {
  if (typeof low !== 'number' || typeof high !== 'number') {
    throw new TypeError('low and high must be numbers.');
  }
  if (Number.isNaN(low) || Number.isNaN(high)) {
    throw new TypeError('low and high cannot be NaN.');
  }
  if (typeof rng !== 'function') { throw new TypeError('rng must be a function.'); }

  if (!Number.isInteger(low) || !Number.isInteger(high)) {
    throw new TypeError('low and high must be integers.');
  }
  if (!Number.isSafeInteger(low) || !Number.isSafeInteger(high)) {
    throw new RangeError('low and high must be safe integers.');
  }
  if (low >= high) { throw new RangeError('low must be strictly less than high.'); }

  // Handle Large Ranges (> 2^53 - 1) via Interval Splitting
  // If (high - low) exceeds MAX_SAFE_INTEGER, float division/multiplication skips integers.
  // Splitting mid = Math.floor(low / 2 + high / 2) is exact in f64.
  const maxRange = Number.MAX_SAFE_INTEGER;
  if (high - low > maxRange) {
    const mid = Math.floor(low / 2 + high / 2);
    const len1 = mid - low;
    const len2 = high - mid;

    const p1 = len1 / (len1 + len2);
    const u = rng();
    if (u < p1) {
      return randomUniformInt(low, mid, rng);
    } else {
      return randomUniformInt(mid, high, rng);
    }
  }

  // Standard Sampling (range <= 2^53 - 1)
  const range = high - low;
  let attempts = 0;
  const maxAttempts = 100;

  while (attempts++ < maxAttempts) {
    const u = rng();
    if (typeof u !== 'number' || Number.isNaN(u) || u < 0 || u >= 1) { continue; }

    const offset = Math.floor(u * range);
    if (offset < range) { return low + offset; }
  }

  throw new Error('rng failed to provide a valid double in [0, 1) after maximum attempts.');
}

/**
 * Generates a log-uniformly (reciprocal) distributed double-precision floating-point
 * number in [low, high).
 *
 * @param {number} low - Lower bound (inclusive, strictly positive).
 * @param {number} high - Upper bound (exclusive, strictly positive).
 * @param {Function} [rng=Math.random] - Optional PRNG returning a double in [0, 1).
 * @returns {number} Log-uniformly distributed float in [low, high).
 */
export function randomLoguniform(low, high, rng = Math.random) {
  // 1. Parameter Validation
  if (typeof low !== 'number' || typeof high !== 'number') {
    throw new TypeError('low and high must be numbers.');
  }
  if (Number.isNaN(low) || Number.isNaN(high)) { return NaN; }
  if (typeof rng !== 'function') { throw new TypeError('rng must be a function.'); }

  if (!Number.isFinite(low) || !Number.isFinite(high)) {
    throw new RangeError('low and high must be finite numbers.');
  }
  if (low <= 0 || high <= 0) {
    throw new RangeError('low and high must be strictly positive numbers.');
  }
  if (low > high) { throw new RangeError('low must be less than or equal to high.'); }

  if (low === high) { return low; }

  // 2. Geometric Interval Splitting
  // Threshold changed to Math.E (~2.718) to guarantee step sizes <= 1 ULP.
  let currentLow = low;
  let currentHigh = high;
  let retries = 0;
  const MAX_RETRIES = 1000;

  while (currentHigh / currentLow > Math.E) {
    const mid = Math.sqrt(currentLow) * Math.sqrt(currentHigh);
    const u = rng();
    if (typeof u !== 'number' || Number.isNaN(u) || u < 0 || u >= 1) {
      if (++retries > MAX_RETRIES) throw new Error('PRNG failed to produce valid float in [0, 1).');
      continue;
    }
    if (u < 0.5) {
      currentHigh = mid;
    } else {
      currentLow = mid;
    }
  }

  // 3. Base-Case Sampling with Rejection Guard
  const ratio = currentHigh / currentLow;
  let val;

  retries = 0;
  do {
    const u = rng();
    if (typeof u !== 'number' || Number.isNaN(u) || u < 0 || u >= 1) {
      if (++retries > MAX_RETRIES) throw new Error('PRNG failed to produce valid float in [0, 1).');
      continue;
    }
    val = currentLow * Math.pow(ratio, u);
  } while (val >= currentHigh);

  return val;
}

export function randomLoguniformInt(low, high, rng = Math.random) {
  const val = randomLoguniform(Math.floor(low), Math.floor(high), rng);
  const integerVal = Math.floor(val);
  return Math.min(high, Math.max(low, integerVal));
}

// `v1` and `v2` are in [0, 1).
export function normalDistributionMap(v1, v2, mu = 0, sigma = 1) {
  if (v1 === 0) return mu;
  const logV = v1 <= 0.5 ? Math.log(v1) : Math.log1p(v1 - 1);
  return sigma * Math.sqrt(-2 * logV) * Math.cos(2 * Math.PI * v2) + mu;
}

// `value` is in [0, 1).
export function uniformFloatMap(value, low, high) {
  if (value === 0) return low;
  return (1 - value) * low + value * high;
}

// `value` is in [0, 1).
export function triangleDistributionMap(v1, v2, low, high) {
  const u = 0.5 * (v1 + v2);
  if (u === 0) return low;
  return (1 - u) * low + u * high;
}

// `value` is in [0, 1).
// `low` and `high` are integer. Output interval is [low, high]. `high` is inclusive.
export function uniformIntMap(value, low, high) {
  if (value === 0) return low;
  return low + Math.floor(value * (high - low + 1));
}

// `value` is in [0, 1).
export function exponentialMap(value, low, high) {
  const logL = Math.log2(low);
  const logH = Math.log2(high);
  return Math.pow(2, logL + value * (logH - logL));
}

// Shuffle `array` only in range of [start, end), in-place. `end` is exclusive.
export function shuffleArray(rng, array, start, end) {
  if (start === undefined) start = 0;
  if (end === undefined) end = array.length;

  for (let i = start; i < end - 1; ++i) {
    const j = start + Math.floor(rng.number() * (end - start));
    const tmp = array[i];
    array[i] = array[j];
    array[j] = tmp;
  }
  return array;
}

// `x` in [0, 1].
export function superellipse(x, n) { return x < 0 ? 1 : (1 - x ** n) ** (1 / n); }
export function lameCurve(x, p, q) { return x <= 0 ? 1 : x >= 1 ? 0 : (1 - x ** p) ** (1 / q); }

export function chebyshev1_2(x) { return 2 * x * x - 1; }
export function chebyshev1_3(x) { return (4 * x * x - 3) * x; }
export function chebyshev1_4(x) { return (8 * x * x - 8) * x * x + 1; }
export function chebyshev1_5(x) { return ((16 * x * x - 20) * x * x + 5) * x; }

export function triangularNumber(n) { return (n * n + n) / 2; }

// Range of t is in [0, 1]. Interpolates between y1 and y2.
// y0 is current, y3 is earlier sample.
export function lagrange3Interp(y0, y1, y2, y3, t) {
  const u = 1 + t;
  const d0 = y0 - y1;
  const d1 = d0 - (y1 - y2);
  const d2 = d1 - ((y1 - y2) - (y2 - y3));
  return y0 - u * (d0 + (1 - u) / 2 * (d1 + (2 - u) / 3 * d2));
}

// `a` is an array of polynomial coefficients.
// `x` in [0, 1].
export function computePolynomial(x, a) {
  if (a.length <= 0) return 0;
  let v = a.at(-1);
  for (let i = a.length - 2; i >= 0; --i) v = v * x + a[i];
  return v;
}

// Frequency ratio of circular membrane modes. Generated using `printSingleArrayCircular`
// in `tuning/circularmembranemode.py`.
export const circularModes = [
  1.000000000000000,  1.5933405056951118, 2.135548786649403,  2.295417267427694,
  2.6530664045492145, 2.9172954551172228, 3.1554648154083624, 3.5001474903090264,
  3.5984846739581138, 3.6474511791052775, 4.058931883331434,  4.131738159726708,
  4.230439127905234,  4.6010445344331075, 4.610051645437306,  4.831885262930598,
  4.903280573212368,  5.083567173877822,  5.1307689067016575, 5.412118429982582,
  5.5403985098530635, 5.5531264771782425, 5.650842376925684,  5.976540221648715,
  6.019355807422682,  6.152609171589256,  6.1631367313038865, 6.208732130572546,
  6.482735446055879,  6.528612451522295,  6.668996900654445,  6.746213299505839,
  6.848991602808508,  6.9436429101526915, 7.0707081490386905, 7.169426625276353,
  7.325257332462771,  7.4023810568360755, 7.468242109085181,  7.514500962483965,
  7.604536126938166,  7.665197838561287,  7.85919706013246,   7.892520026843893,
  8.071028338967128,  8.131374173240902,  8.1568737689496,    8.156918842280733,
  8.314295631893737,  8.45000551018646,   8.645078764049176,  8.652206694443466,
  8.66047555520746,   8.781093075730398,  8.820447105611922,  8.999214496283312,
  9.130077646411111,  9.167810652271394,  9.238840557670077,  9.390589484063241,
  9.464339027734203,  9.541304590034361,  9.612247455238109,  9.678811692506123,
  9.807815107462856,  9.98784275554081,   10.077190497330994, 10.091867141275257,
  10.09225481486813,  10.126502295693772, 10.18572218907702,  10.368705458854519,
  10.57471344349369,  10.607609550950203, 10.68896784287112,  10.706875023386747,
  10.77153891878896,  10.922544696482962, 11.133166170756637, 11.152639282954734,
  11.188906775410308, 11.310212368186301, 11.402312929615599, 11.432629299891351,
  11.4701662560518,   11.654362978754861, 11.685843549747782, 11.722758172320448,
  11.903823217314876, 12.012253849800821, 12.020976194473256, 12.078559478862408,
  12.17162315503707,  12.285988718162267, 12.488940118944772, 12.549376432817636,
  12.6291936518746,   12.685306868214534, 12.711609953449944, 12.738806093605008,
  12.84308496674913,  13.066558649839825, 13.08201334381275,  13.195723591186585,
  13.228284530761863, 13.333546087983708, 13.385453180985621, 13.394674759934396,
  13.610572794452606, 13.637496463055456, 13.819314942198952, 13.941287328845805,
  13.945767336219362, 14.020359772593565, 14.04501881871901,  14.1354057370185,
  14.202434689932657, 14.40316086180383,  14.483373598068052, 14.549405125286688,
  14.645000185525108, 14.656816446830334, 14.692253846444542, 14.761947739522833,
  14.980552310159315, 15.021321422191345, 15.145389465652915, 15.260566826272614,
  15.31652523569637,  15.328702904590145, 15.351258321221781, 15.552105165163068,
  15.555467218371973, 15.734495694194743, 15.866588486044524, 15.868040174411112,
  15.955615704418207, 15.998984255488747, 16.08610498399543,  16.118344590042522,
  16.317378143958635, 16.41250306033092,  16.4682379099555,   16.574020171496844,
  16.636735502683617, 16.657518312060414, 16.67972262794317,  16.89459494845585,
  16.954588545112223, 17.061850311878718, 17.184773806897258, 17.236631644773766,
  17.265584831105425, 17.305660312713336, 17.466626675790522, 17.493126212017213,
  17.649466343804967, 17.788600705902546, 17.789414757566867, 17.886427390005295,
  17.94452559782329,  17.963794328004976, 18.033890570040306, 18.23159325633044,
  18.338374034935857, 18.38611884498893,  18.500019255387453, 18.57504506872356,
  18.596751602241905, 18.612293459048136, 18.808671572367395, 18.883777024661043,
  18.977860592070737, 19.107005849550887, 19.155531162815112, 19.198005179702488,
  19.252122686852257, 19.2700831140802,   19.381086718378597, 19.564288389688688,
  19.70794330753125,  19.710513982544636, 19.814077430361806, 19.884097430065065,
  19.918892134980094, 19.9491781754168,   20.145806930665653, 20.26195370400539,
  20.303314818533995, 20.423840543272263, 20.50891405763646,  20.51324676693419,
  20.55956364576846,  20.57638224071873,  20.722772739552344, 20.893543315236908,
  21.02779742920247,  21.073560526792708, 21.12717283813639,  21.19281780880533,
  21.225462703614895, 21.29550180478402,  21.47900146140261,  21.626388363286946,
  21.630359471363427, 21.739395498479965, 21.819275510667225, 21.86427572516472,
  21.86687651357224,  22.060019609059026, 22.220001357704295, 22.346038863398324,
  22.429346709375974, 22.43947648746872,  22.501264341880123, 22.636892207884554,
  22.808980427054518, 22.94750559461174,  22.990941679585436, 23.053893406711193,
  23.129183209056905, 23.209883019451365, 23.39363224708021,  23.5441527495905,
  23.66294295645443,  23.75112099034419,  23.779229397791347, 23.97423157260064,
  24.136298677667078, 24.266994684298997, 24.34514583273217,  24.367507840105443,
  24.551025685963022, 24.7242286319338,   24.86637812027331,  24.978725299241102,
  25.124238079880623, 25.308199377586597, 25.46138857404755,  25.585113635339905,
  25.6940715297246,   25.88844300764359,  26.052291896063057, 26.186977817460633,
  26.46517012649518,  26.63932842024234,  26.784592423677555, 27.03857252471371,
  27.22271625388057,  27.37820570550269,  27.802654042118437, 27.968042979710326,
  28.379323306016918, 28.554309478765987, 29.137192761846382, 29.716864766481052
];

export class DebugProbe {
  constructor(label) {
    this.label = label;
    this.frame = 0;

    this.min = {value: Number.POSITIVE_INFINITY, frame: -1};
    this.max = {value: Number.NEGATIVE_INFINITY, frame: -1};

    this.firstNonFinite = {value: 0, frame: -1};
  }

  print() {
    let text = `--- ${this.label} (Signal Debugger)
min: ${this.min.value} at frame ${this.min.frame}
max: ${this.max.value} at frame ${this.max.frame}`;

    if (this.firstNonFinite.frame >= 0) {
      text += `\nNon finite number at ${label}, in frame ${this.frame}`;
    }

    console.log(text);
  }

  process(input) {
    if (!Number.isFinite(input)) {
      this.firstNonFinite.value = input;
      this.firstNonFinite.frame = this.frame;
      this.observedNonFinite = true;
    }

    if (input < this.min.value) {
      this.min.value = input;
      this.min.frame = this.frame;
    }
    if (input > this.max.value) {
      this.max.value = input;
      this.max.frame = this.frame;
    }

    ++this.frame;
    return input;
  }
}

export function getTimeStamp() {
  const date = new Date();

  const Y = `${date.getFullYear()}`.padStart(4, "0");
  const m = `${date.getMonth() + 1}`.padStart(2, "0");
  const d = `${date.getDate()}`.padStart(2, "0");
  const H = `${date.getHours()}`.padStart(2, "0");
  const M = `${date.getMinutes()}`.padStart(2, "0");
  const S = `${date.getSeconds()}`.padStart(2, "0");
  const milli = `${date.getMilliseconds()}`.padStart(3, "0");

  const localTime = `${Y}-${m}-${d}T${H}${M}${S}.${milli}`;

  const tzOffsetMinute = -date.getTimezoneOffset();
  if (tzOffsetMinute === 0) return `${localTime}Z`;
  const tzSign = tzOffsetMinute < 0 ? "-" : "+";
  const tzHour = `${Math.floor(Math.abs(tzOffsetMinute) / 60)}`.padStart(2, "0");
  const tzMinute = `${Math.abs(tzOffsetMinute) % 60}`.padStart(2, "0");
  return `${localTime}${tzSign}${tzHour}${tzMinute}`;
}
