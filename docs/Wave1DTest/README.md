This directory contains a toy model used in WireWireCollision.

Run `server.py`, and it opens `index.html` on web browser.

## Damped Wave Equation
$$
\ddot{u} + a \dot{u} = c^2 u''
$$

- [Finite difference coefficient - Wikipedia](https://en.wikipedia.org/wiki/Finite_difference_coefficient)

## 中央差分

```
(u[t][x] - 2 * u[t-1][x] + u[t-2][x]) / dt^2
+ 0.5 * a * (u[t][x] - u[t-2][x]) / dt
= c^2 * (u[t-1][x-1] - 2 * u[t-1][x] + u[t-1][x+1]) / dx^2
```

```
+ u[t][x] / dt^2
+ u[t][x] * 0.5 * a / dt
- u[t-1][x] * 2 / dt^2
+ u[t-2][x] / dt^2
- u[t-2][x] * 0.5 * a / dt
=
(u[t-1][x-1] - 2 * u[t-1][x] + u[t-1][x+1]) * c^2 / dx^2
```

```
C0 = 1 / dt^2;
C1 = 0.5 * a / dt;
C2 = c^2 / dx^2;
C3 = 1 / (C0 + C1);
C4 = 2 * (C0 - C2);
C5 = C0 - C1;

u[t][x]
= C3 * (
  + C2 * (u[t-1][x-1] + u[t-1][x+1])
  + C4 * u[t-1][x]
  - C5 * u[t-2][x]
);
```

## 前進差分

```
(u[t][x] - 2 * u[t-1][x] + u[t-2][x]) / dt^2
+ a * (u[t][x] - u[t-1][x]) / dt
= c^2 * (u[t-1][x-1] - 2 * u[t-1][x] + u[t-1][x+1]) / dx^2
```

```
u[t][x] * (1 / dt^2 + a / dt)
=
+ (u[t-1][x-1] + u[t-1][x+1]) * c^2 / dx^2
+ u[t-1][x] * (2 / dt^2 + a / dt - 2 * c^2 / dx^2)
- u[t-2][x] / dt^2
```

```
C0 = 1 / (dt * dt);
C1 = 1 / (C0 + a / dt);
C2 = c * c / (dx * dx);
C3 = 2 * C0 + a / dt - 2 * C2;
u[t][x] = (
  + (u[t-1][x-1] + u[t-1][x+1]) * C2
  + u[t-1][x] * C3
  - u[t-2][x] * C0
) * C1;
```
