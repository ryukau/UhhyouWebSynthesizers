// Copyright 2022 Takamitsu Endo
// SPDX-License-Identifier: Apache-2.0

import * as delay from "../common/dsp/delay.js";
import * as multirate from "../common/dsp/multirate.js";
import {lerp} from "../common/util.js";
import {PcgRandom} from "../lib/pcgrandom/pcgrandom.js";

import * as menuitems from "./menuitems.js";

onmessage = (event) => {
  const pv = event.data; // Parameter values.

  const upFold = parseInt(menuitems.oversampleItems[pv.overSample]);
  const upRate = upFold * pv.sampleRate;

  let rng = new PcgRandom(BigInt(pv.seed + pv.channel * 65537));

  let l4 = new delay.Lattice4(upRate, pv.maxDelayTime, pv.latticeSize);

  const rand = (base, ratio) => base * lerp(1, rng.number(), ratio);

  let i1 = 0;
  let i2 = 0;
  let i3 = 0;
  let i4 = 0;
  for (let d4 = 0; d4 < pv.latticeSize; ++d4) {
    let l3 = l4.allpass[d4];
    for (let d3 = 0; d3 < pv.latticeSize; ++d3) {
      let l2 = l3.allpass[d3];
      for (let d2 = 0; d2 < pv.latticeSize; ++d2) {
        let l1 = l2.allpass[d2];
        for (let d1 = 0; d1 < pv.latticeSize; ++d1) {
          l1.allpass[d1].prepare(
            upRate * rand(pv.delayTime[i1], pv.delayRandom),
            rand(pv.innerFeed[i1], pv.innerFeedRandom));
          l1.feed[d1] = rand(pv.l1Feed[i1], pv.l1FeedRandom);
          ++i1;
        }
        l2.feed[d2] = rand(pv.l2Feed[i2], pv.l2FeedRandom);
        ++i2;
      }
      l3.feed[d3] = rand(pv.l3Feed[i3], pv.l3FeedRandom);
      ++i3;
    }
    l4.feed[d4] = rand(pv.l4Feed[i4], pv.l4FeedRandom);
    ++i4;
  }

  let sound = new Array(Math.floor(pv.sampleRate * pv.renderDuration)).fill(0);
  if (upFold == 2) {
    let halfband = new multirate.HalfBandIIR();
    const hb0 = l4.process(1);
    const hb1 = l4.process(0);
    sound[0] = halfband.process(hb0, hb1);
    for (let i = 1; i < sound.length; ++i) {
      const hb0 = l4.process(0);
      const hb1 = l4.process(0);
      sound[i] = halfband.process(hb0, hb1);
    }
  } else {
    sound[0] = 1;
    for (let i = 0; i < sound.length; ++i) sound[i] = l4.process(sound[i]);
  }

  postMessage(sound);
}
