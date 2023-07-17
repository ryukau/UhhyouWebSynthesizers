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

export const justIntonationTable = [
  1 / 1,   // 0
  16 / 15, // 1
  15 / 14, // 1 (7-limit)
  14 / 13, // 1 (17-limit)
  10 / 9,  // 2 (5-limit, less just)
  9 / 8,   // 2
  8 / 7,   // 2 (7 or 17-limit)
  6 / 5,   // 3
  5 / 4,   // 4
  4 / 3,   // 5
  45 / 32, // 6 aug. (5-limit, less just)
  25 / 18, // 6 aug. Pairs with 11.
  7 / 5,   // 6 aug. (7-limit)
  17 / 12, // 6 aug. (17-limit)
  64 / 45, // 6 dim. (5-limit, less just)
  36 / 25, // 6 dim. Pairs with 1.
  10 / 7,  // 6 dim. (7-limit)
  24 / 17, // 6 dim. (17-limit)
  3 / 2,   // 7
  8 / 5,   // 8
  5 / 3,   // 9
  16 / 9,  // 10 (5-limit, less just)
  9 / 5,   // 10
  7 / 4,   // 10 (7 or 17-limit)
  15 / 8,  // 11
  13 / 7,  // 11 (17-limit)
];

export function constructIntJustScale(
  basePeriod,
  octaveStart,
  octaveRange,
  arpeggioNotes,
) {
  const startPeriod = basePeriod * (1 << (-octaveStart));
  const endPeriod = Math.max(2, startPeriod / (1 << (octaveRange)));

  const justSt12 = justIntonationTable.filter((_, index) => arpeggioNotes[index] > 0)
                     .map(v => 12 * Math.log2(v));

  let periods = [startPeriod];
  let currentPeriod = startPeriod;
  let currentSt12 = 12 * (Math.log2(startPeriod / currentPeriod) % 1.0);
  let jiIndex = 0;

  while (currentPeriod >= endPeriod) {
    let nextSt12 = 12 * (Math.log2(startPeriod / (currentPeriod - 1)) % 1.0);
    if (nextSt12 == 0) nextSt12 = 12;
    const midSt12 = (currentSt12 + nextSt12) / 2;

    if (currentSt12 <= justSt12[jiIndex] && justSt12[jiIndex] < midSt12) {
      if (periods.at(-1) != currentPeriod) periods.push(currentPeriod);
      do {
        if (++jiIndex >= justSt12.length) jiIndex = 0;
      } while (currentSt12 <= justSt12[jiIndex] && justSt12[jiIndex] < midSt12);
    }

    if (midSt12 <= justSt12[jiIndex] && justSt12[jiIndex] < nextSt12) {
      periods.push(currentPeriod - 1);
      do {
        if (++jiIndex >= justSt12.length) jiIndex = 0;
      } while (midSt12 <= justSt12[jiIndex] && justSt12[jiIndex] < nextSt12);
    }

    --currentPeriod;
    currentSt12 = nextSt12 == 12 ? 0 : nextSt12;
  }
  return periods;
}
