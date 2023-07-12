/**
 * https://github.com/gre/bezier-easing
 * BezierEasing - use bezier curve for transition easing function
 * by Gaëtan Renaudeau 2014 - 2015 – MIT License
 *
 * modified by ryukau 2016 - MIT License
 * パブリックスコープになっていた変数、関数をclass BE_UTILSのstaticに押し込んだ。
 */

class BE_UTILS {
  // These values are established by empiricism with tests (tradeoff: performance VS precision)
  static get NEWTON_ITERATIONS() { return 4; }
  static get NEWTON_MIN_SLOPE() { return 0.001; }
  static get SUBDIVISION_PRECISION() { return 0.0000001; }
  static get SUBDIVISION_MAX_ITERATIONS() { return 10; }

  static get kSplineTableSize() { return 11; }
  static get kSampleStepSize() { return 1.0 / (this.kSplineTableSize - 1.0); }

  static get float32ArraySupported() { return typeof Float32Array === 'function'; }

  static A(aA1, aA2) { return 1.0 - 3.0 * aA2 + 3.0 * aA1; }
  static B(aA1, aA2) { return 3.0 * aA2 - 6.0 * aA1; }
  static C(aA1) { return 3.0 * aA1; }

  // Returns x(t) given t, x1, and x2, or y(t) given t, y1, and y2.
  static calcBezier(aT, aA1, aA2) {
    return ((this.A(aA1, aA2) * aT + this.B(aA1, aA2)) * aT + this.C(aA1)) * aT;
  }

  // Returns dx/dt given t, x1, and x2, or dy/dt given t, y1, and y2.
  static getSlope(aT, aA1, aA2) {
    return 3.0 * this.A(aA1, aA2) * aT * aT + 2.0 * this.B(aA1, aA2) * aT + this.C(aA1);
  }

  static binarySubdivide(aX, aA, aB, mX1, mX2) {
    var currentX, currentT, i = 0;
    do {
      currentT = aA + (aB - aA) / 2.0;
      currentX = this.calcBezier(currentT, mX1, mX2) - aX;
      if (currentX > 0.0) {
        aB = currentT;
      } else {
        aA = currentT;
      }
    } while (Math.abs(currentX) > this.SUBDIVISION_PRECISION && ++i < this.SUBDIVISION_MAX_ITERATIONS);
    return currentT;
  }

  static newtonRaphsonIterate(aX, aGuessT, mX1, mX2) {
    for (var i = 0; i < this.NEWTON_ITERATIONS; ++i) {
      var currentSlope = this.getSlope(aGuessT, mX1, mX2);
      if (currentSlope === 0.0) {
        return aGuessT;
      }
      var currentX = this.calcBezier(aGuessT, mX1, mX2) - aX;
      aGuessT -= currentX / currentSlope;
    }
    return aGuessT;
  }
}

function bezier(mX1, mY1, mX2, mY2) {
  if (!(0 <= mX1 && mX1 <= 1 && 0 <= mX2 && mX2 <= 1)) {
    throw new Error('bezier x values must be in [0, 1] range');
  }

  // Precompute samples table
  var sampleValues = BE_UTILS.float32ArraySupported ? new Float32Array(BE_UTILS.kSplineTableSize) : new Array(BE_UTILS.kSplineTableSize);
  if (mX1 !== mY1 || mX2 !== mY2) {
    for (var i = 0; i < BE_UTILS.kSplineTableSize; ++i) {
      sampleValues[i] = BE_UTILS.calcBezier(i * BE_UTILS.kSampleStepSize, mX1, mX2);
    }
  }

  function getTForX(aX) {
    var intervalStart = 0.0;
    var currentSample = 1;
    var lastSample = BE_UTILS.kSplineTableSize - 1;

    for (; currentSample !== lastSample && sampleValues[currentSample] <= aX; ++currentSample) {
      intervalStart += BE_UTILS.kSampleStepSize;
    }
    --currentSample;

    // Interpolate to provide an initial guess for t
    var dist = (aX - sampleValues[currentSample]) / (sampleValues[currentSample + 1] - sampleValues[currentSample]);
    var guessForT = intervalStart + dist * BE_UTILS.kSampleStepSize;

    var initialSlope = BE_UTILS.getSlope(guessForT, mX1, mX2);
    if (initialSlope >= BE_UTILS.NEWTON_MIN_SLOPE) {
      return BE_UTILS.newtonRaphsonIterate(aX, guessForT, mX1, mX2);
    } else if (initialSlope === 0.0) {
      return guessForT;
    } else {
      return BE_UTILS.binarySubdivide(aX, intervalStart, intervalStart + BE_UTILS.kSampleStepSize, mX1, mX2);
    }
  }

  return function BezierEasing(x) {
    if (mX1 === mY1 && mX2 === mY2) {
      return x; // linear
    }
    // Because JavaScript number are imprecise, we should guarantee the extremes are right.
    if (x === 0) {
      return 0;
    }
    if (x === 1) {
      return 1;
    }
    return BE_UTILS.calcBezier(getTForX(x), mY1, mY2);
  };
};
