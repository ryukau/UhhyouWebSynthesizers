// Copyright 2022 Takamitsu Endo
// SPDX-License-Identifier: Apache-2.0

/**
Positive half of a circle. `x` in [0, 1].

TODO: Find better function when come up with evaluation method. Parabola or even rectangle
might be sufficient.
*/
export function tongueFunc(x, tongueX, tongueY, radius) {
  if (Math.abs(radius) < Number.EPSILON) return 0;
  if (x < tongueX - radius || x > tongueX + radius) return 0;

  x -= tongueX;
  return tongueY * Math.sqrt(radius * radius - x * x) / radius;
}
