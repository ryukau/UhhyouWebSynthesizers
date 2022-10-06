// Copyright 2022 Takamitsu Endo
// SPDX-License-Identifier: Apache-2.0

// w: width, h: height.
export const vowelMesh = (w, h) => {
  const m = h / 2;

  const mesh = {
    i: {x: 0, y: 0, vowel: "i"},
    e: {x: 0, y: m, vowel: "e"},
    a: {x: 0, y: h, vowel: "a"},
    o: {x: w, y: h, vowel: "o"},
    u: {x: w, y: 0, vowel: "u"},
  };

  return Object.freeze([
    [mesh.i, mesh.e, mesh.u],
    [mesh.u, mesh.e, mesh.o],
    [mesh.e, mesh.a, mesh.o],
  ]);
};

// Reference: https://stackoverflow.com/a/2049593
export function hitTestTriangle(pt, v1, v2, v3) {
  const sign
    = (p1, p2, p3) => (p1.x - p3.x) * (p2.y - p3.y) - (p2.x - p3.x) * (p1.y - p3.y);

  const d1 = sign(pt, v1, v2);
  const d2 = sign(pt, v2, v3);
  const d3 = sign(pt, v3, v1);

  const has_neg = (d1 < 0) || (d2 < 0) || (d3 < 0);
  const has_pos = (d1 > 0) || (d2 > 0) || (d3 > 0);

  return !(has_neg && has_pos);
}

function lineIntersection(p1, p2, q1, q2) {
  const d_px = p1.x - p2.x;
  const d_py = p1.y - p2.y;
  const d_qx = q1.x - q2.x;
  const d_qy = q1.y - q2.y;

  const denom = d_px * d_qy - d_py * d_qx;

  if (denom === 0) {
    // All points are on the same line, or Line p1-p2 and line q1-q2 are parallel.
    return null;
  }

  const A = p1.x * p2.y - p1.y * p2.x;
  const B = q1.x * q2.y - q1.y * q2.x;

  return {
    x: (A * d_qx - d_px * B) / denom,
    y: (A * d_qy - d_py * B) / denom,
  };
}

function getRatio(start, mid, end) {
  const getLength = (p1, p2) =>  {
    const dx = p1.x - p2.x;
    const dy = p1.y - p2.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  const full = getLength(start, end);
  if (full < Number.EPSILON) return 1;
  return getLength(start, mid) / full;
}

export function getVowelMixRatio(position, mesh) {
  let meshIndex = null;
  for (let idx = 0; idx < mesh.length; ++idx) {
    const tri = mesh[idx];
    if (hitTestTriangle(position, tri[0], tri[1], tri[2])) {
      meshIndex = idx;
      break;
    }
  }
  if (meshIndex === null) return null; // `position` is out of bounds.

  const tri = mesh[meshIndex];
  const intersection = lineIntersection(position, tri[0], tri[1], tri[2]);

  if (intersection === null) {
    return {
      vowel: [tri[0].vowel, tri[1].vowel, tri[2].vowel],
      mix: [1, 0, 0],
    };
  }

  const r0 = getRatio(tri[0], position, intersection);
  const r12 = getRatio(tri[1], intersection, tri[2]);
  return {
    vowel: [tri[0].vowel, tri[1].vowel, tri[2].vowel],
    mix: [1 - r0, r0 * (1 - r12), r0 * r12],
  };
}

export const formant = Object.freeze({
  "soprano": {
    "a": {
      "freq": [800, 1150, 2900, 3900, 4950],
      "amp": [0, -6, -32, -20, -50],
      "bw": [80, 90, 120, 130, 140]
    },
    "e": {
      "freq": [350, 2000, 2800, 3600, 4950],
      "amp": [0, -20, -15, -40, -56],
      "bw": [60, 100, 120, 150, 200]
    },
    "i": {
      "freq": [270, 2140, 2950, 3900, 4950],
      "amp": [0, -12, -26, -26, -44],
      "bw": [60, 90, 100, 120, 120]
    },
    "o": {
      "freq": [450, 800, 2830, 3800, 4950],
      "amp": [0, -11, -22, -22, -50],
      "bw": [70, 80, 100, 130, 135]
    },
    "u": {
      "freq": [325, 700, 2700, 3800, 4950],
      "amp": [0, -16, -35, -40, -60],
      "bw": [50, 60, 170, 180, 200]
    }
  },
  "alto": {
    "a": {
      "freq": [800, 1150, 2800, 3500, 4950],
      "amp": [0, -4, -20, -36, -60],
      "bw": [80, 90, 120, 130, 140]
    },
    "e": {
      "freq": [400, 1600, 2700, 3300, 4950],
      "amp": [0, -24, -30, -35, -60],
      "bw": [60, 80, 120, 150, 200]
    },
    "i": {
      "freq": [350, 1700, 2700, 3700, 4950],
      "amp": [0, -20, -30, -36, -60],
      "bw": [50, 100, 120, 150, 200]
    },
    "o": {
      "freq": [450, 800, 2830, 3500, 4950],
      "amp": [0, -9, -16, -28, -55],
      "bw": [70, 80, 100, 130, 135]
    },
    "u": {
      "freq": [325, 700, 2530, 3500, 4950],
      "amp": [0, -12, -30, -40, -64],
      "bw": [50, 60, 170, 180, 200]
    }
  },
  "countertenor": {
    "a": {
      "freq": [660, 1120, 2750, 3000, 3350],
      "amp": [0, -6, -23, -24, -38],
      "bw": [80, 90, 120, 130, 140]
    },
    "e": {
      "freq": [440, 1800, 2700, 3000, 3300],
      "amp": [0, -14, -18, -20, -20],
      "bw": [70, 80, 100, 120, 120]
    },
    "i": {
      "freq": [270, 1850, 2900, 3350, 3590],
      "amp": [0, -24, -24, -36, -36],
      "bw": [40, 90, 100, 120, 120]
    },
    "o": {
      "freq": [430, 820, 2700, 3000, 3300],
      "amp": [0, -10, -26, -22, -34],
      "bw": [40, 80, 100, 120, 120]
    },
    "u": {
      "freq": [370, 630, 2750, 3000, 3400],
      "amp": [0, -20, -23, -30, -34],
      "bw": [40, 60, 100, 120, 120]
    }
  },
  "tenor": {
    "a": {
      "freq": [650, 1080, 2650, 2900, 3250],
      "amp": [0, -6, -7, -8, -22],
      "bw": [80, 90, 120, 130, 140]
    },
    "e": {
      "freq": [400, 1700, 2600, 3200, 3580],
      "amp": [0, -14, -12, -14, -20],
      "bw": [70, 80, 100, 120, 120]
    },
    "i": {
      "freq": [290, 1870, 2800, 3250, 3540],
      "amp": [0, -15, -18, -20, -30],
      "bw": [40, 90, 100, 120, 120]
    },
    "o": {
      "freq": [400, 800, 2600, 2800, 3000],
      "amp": [0, -10, -12, -12, -26],
      "bw": [40, 80, 100, 120, 120]
    },
    "u": {
      "freq": [350, 600, 2700, 2900, 3300],
      "amp": [0, -20, -17, -14, -26],
      "bw": [40, 60, 100, 120, 120]
    }
  },
  "bass": {
    "a": {
      "freq": [600, 1040, 2250, 2450, 2750],
      "amp": [0, -7, -9, -9, -20],
      "bw": [60, 70, 110, 120, 130]
    },
    "e": {
      "freq": [400, 1620, 2400, 2800, 3100],
      "amp": [0, -12, -9, -12, -18],
      "bw": [40, 80, 100, 120, 120]
    },
    "i": {
      "freq": [250, 1750, 2600, 3050, 3340],
      "amp": [0, -30, -16, -22, -28],
      "bw": [60, 90, 100, 120, 120]
    },
    "o": {
      "freq": [400, 750, 2400, 2600, 2900],
      "amp": [0, -11, -21, -20, -40],
      "bw": [40, 80, 100, 120, 120]
    },
    "u": {
      "freq": [350, 600, 2400, 2675, 2950],
      "amp": [0, -20, -32, -28, -36],
      "bw": [40, 80, 100, 120, 120]
    }
  }
});
