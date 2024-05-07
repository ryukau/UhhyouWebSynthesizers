// Copyright Takamitsu Endo (ryukau@gmail.com)
// SPDX-License-Identifier: Apache-2.0

export const maxReverbTimeSeconds = 0.2;

export const justIntonationTable = [
  1 / 1,   // 0
  16 / 15, // 1
  9 / 8,   // 2
  6 / 5,   // 3
  5 / 4,   // 4
  4 / 3,   // 5
  25 / 18, // 6 aug. Pairs with 11.
  7 / 5,   // 6 aug. (7-limit)
  36 / 25, // 6 dim. Pairs with 1.
  3 / 2,   // 7
  8 / 5,   // 8
  5 / 3,   // 9
  9 / 5,   // 10
  7 / 4,   // 10 (7 or 17-limit)
  15 / 8,  // 11
];
