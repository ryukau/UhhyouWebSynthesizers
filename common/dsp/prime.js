// Copyright 2023 Takamitsu Endo
// SPDX-License-Identifier: Apache-2.0

// Check if `n` is a prime number.
export function isPrime(n) {
  if (n == 2) return true;
  if (n < 2 || n % 2 == 0) return false;
  const sqrt = Math.ceil(Math.sqrt(n));
  for (let i = 3; i <= sqrt; i += 2) {
    if (n % i == 0) return false;
  }
  return true;
}

// Find a prime number next to `n`.
export function nextPrime(n) {
  if (n < 2) return 2;
  if (n == 2) return 3;

  n += n % 2 == 0 ? 1 : 2;
  while (!isPrime(n)) n += 2;
  return n;
}

// Find all divisor.
export function findDivisor(n) {
  if (n <= 0 || n >= Number.MAX_SAFE_INTEGER) {
    console.warn("findDivisor(): `n <= 0 || n >= Number.MAX_SAFE_INTEGER`");
    return [];
  }

  let divisor = [];
  const tSqrt = Math.sqrt(n);
  for (let i = 2; i <= tSqrt; ++i) {
    if (n % i == 0) {
      divisor.push(i);
      const x = n / i;
      if (i != x) divisor.push(x);
    }
  }
  return divisor;
}

// Compute binomial coefficient from natural number `n`, `k`.
export function binomialCoefficient(n, k) {
  let r = 1;
  for (let i = 1; i <= k; ++i) {
    r *= n--;
    r /= i;
  }
  return r;
}

// Greatest common divisor.
export function gcd(m, n) {
  while (n != 0) [n, m] = [m % n, n];
  return m;
}

// Least common multiplier.
export function lcm(a, b) { return Math.abs(a * b) / gcd(a, b); }

// Factorial of natural number `n`.
export function factorial(n) {
  let factor = 1;
  for (let i = 2; i <= n; ++i) factor *= i;
  return factor;
}

// All permutation of length `n` from `array`, sorted lexicographically.
export function lexicographicPermutation(array, n) {
  if (n >= factorial(array.length)) return [];

  let permutation = [];
  let d = structuredClone(array);
  for (let i = d.length - 1; i >= 0; --i) {
    let f = factorial(i);
    permutation.push(d.splice(Math.floor(n / f), 1)[0]);
    n %= f;
  }
  return permutation;
}

// Returns all combination of elements in `array`.
export function allCombination(array) {
  let list = [];
  const length = factorial(array.length);
  for (let n = 0; n < length; ++n) list.push(lexicographicPermutation(array, n));
  return list;
}

// Combinations of `k` elements in `array`.
export function combination(array, k) {
  let indices = new Array(k);
  for (let i = 0; i < indices.length; ++i) indices[i] = i;
  indices.push(array.length);

  const last = indices.length - 1;
  const start = indices.length - 2;
  const end = array.length - k;
  let combinations = [array.slice(0, k)];
  while (indices[0] < end) {
    for (let i = start; i >= 0; --i) {
      const next = indices[i] + 1;
      if (next < indices[i + 1]) {
        indices[i] = next;
        for (let j = i + 1; j < last; ++j) indices[j] = indices[j - 1] + 1;
        break;
      }
    }

    let part = new Array(k);
    for (var i = 0; i < part.length; ++i) part[i] = array[indices[i]];
    combinations.push(part);
  }
  return combinations;
}
