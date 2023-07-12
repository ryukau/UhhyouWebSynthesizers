/*
Psuedo random number generator probably faster than mersenne twister.

Reference:
- https://stackoverflow.com/a/47593316
-
https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Math/random
*/

function xmur3(str) {
  for (var i = 0, h = 1779033703 ^ str.length; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = h << 13 | h >>> 19;
  }
  return function() {
    h = Math.imul(h ^ h >>> 16, 2246822507);
    h = Math.imul(h ^ h >>> 13, 3266489909);
    return (h ^= h >>> 16) >>> 0;
  };
}

function sfc32(a, b, c, d) {
  return function() {
    a >>>= 0;
    b >>>= 0;
    c >>>= 0;
    d >>>= 0;
    var t = (a + b) | 0;
    a = b ^ b >>> 9;
    b = c + (c << 3) | 0;
    c = (c << 21 | c >>> 11);
    d = d + 1 | 0;
    t = t + d | 0;
    c = c + t | 0;
    return (t >>> 0) / 4294967296;
  };
}

function mulberry32(a) {
  return function() {
    var t = a += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 0x100000000;
  };
}

function getRng(seed) {
  var seed = xmur3(String(seed));
  return mulberry32(seed());
}

// s >= 1.
function lcg(s) {
  return function() {
    return (0x100000000 - 1 & (s = Math.imul(741103597, s))) / 0x100000000;
  };
}

// [min, max).
function mapUniform(value, min, max) { return value * (max - min) + min; }

// Integer [min, max). `min` and `max` must be integer.
function mapInt(value, min, max) { return Math.floor(value * (max - min) + min); }

// Integer [min, max]. `min` and `max` must be integer.
function mapIntInclusive(value, min, max) {
  return Math.floor(value * (max - min + 1) + min);
}
