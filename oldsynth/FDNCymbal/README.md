# FDNCymbal
Cymbal synthesizer based on feedback delay network.

- [Demo (github.io)](https://ryukau.github.io/FDNCymbal)

# Signal Flow
![Figure of signal flow](./FDNCymbal.svg)

Input is an impulse.

*.Time on FDN(n) is modified with respect to the depth of cascades. In other words, it's not the exact value from FDN.Time, Atk.Time or Tick.Time.

Control on summing (⊕, plus symbol with circle) indicates mixing ratio of 2 signals.

# Libraries
- [bezier-easing](https://github.com/gre/bezier-easing)
- [mersenne-twister](https://github.com/boo1ean/mersenne-twister)

# License
MIT
