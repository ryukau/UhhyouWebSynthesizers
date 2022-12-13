# WaveBox
This synthesizer simulates wave propagation in a cube.

- [Demo (github.io)](https://ryukau.github.io/WaveBox/)

# Simulation
This simulation uses wave equation with spring and damper terms.

```
m * u_tt + a * u_t + k * u = c^2 ∇^2 u
```

Finite difference method is used for spatial discretization. For time integration, newmark-β method is used.

In demo, control for factor m (mass) is omitted.

# Libraries
- [mersenne-twister](https://github.com/boo1ean/mersenne-twister)

# License
MIT
