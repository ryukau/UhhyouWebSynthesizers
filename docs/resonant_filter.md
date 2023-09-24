# Construction of Resonant Filters
Resonant filters described here has following structure.

```
input -+--------> (main filter) --------+-> output
       ↑                                |
       +- (gain) <- (feedback filter) <-+
```

`gain` is called `resonance` or `q` in code.

These filters are written in `common/dsp/resonantfilters.js`. For building blocks, see also:

- `common/dsp/onepole.js`
- `common/dsp/sos.js`
- `common/dsp/svf.js`

## Find Stability Condition
A problem is how to determine the bounds of `gain` that doesn't blow up the filter. For simple filters, transfer function can be used.

1. Write filter code from combining building blocks.
2. Translate the filter code to difference equations.
3. Translate the difference equations to transfer function.
4. Solve transfer function to get stability condition.

It's kind of vague that what really is a "simple" filter. Usually order 2 or less can be considered simple. There might are filters that are order 3 or more, and have concise stability condition. But those are exception, because general solution of order 3 or order 4 polynomial is unusable for audio DSP. (See [here](https://math.vanderbilt.edu/schectex/courses/cubic/) and [here](https://en.wikipedia.org/wiki/File:Quartic_Formula.svg) for how lengthy they are.)

Anyway, we can use numerical method when the analytic solution is impractical.

- Select cutoff frequencies to find the upper bound of `resonance`.
  - This becomes a lookup table. Application draws the values from given cutoff, and maybe interpolates them.
- Setup binary search for `resonance` for each cutoff.
- For branching, use linear regression of impulse response with given `resonance`.
  - If the slope is positive, it's diversing. Branch into lower side.
  - If the slope is negative, it's conversing. Branch into upper side.
  - We want to find `resonance` that make the slope to exactly 0.

The problem of linear regression approach is that the length of impulse response can only be finite on computer. We are dealing with IIR filter, where IIR stands for **infinite** impulse response. In practice, it was sufficient to cut at 65536 samples for the filters described here.

## ResonantLowpass1A1
Code from `ResonantLowpass1A1.process()`.

```javascript
// Bilinear allpass, order 1.
v1 = a1 * (y1 - v1) + y2;
y2 = y1;

// Bilinear lowpass, order 1.
y1 = gain * (input + x1) - a1 * y1 - reso * v1;
x1 = input;
return y1;
```

There are some conventions of symbols:

- `x` is input signal.
- `y` is output signal.
- `u`, `v` are internal signal.
- `a` is filter coefficient in the denominator of transfer function.
- `b` is filter coefficient in the numerator of transfer function.

The subscripts `n` indicates the value appeared in `n` samples before. For example, `x1` means input in 1 sample before.

Second symbols like `A`, `H`, `L` mean the type of filter, like "A"llpass, "H"ighpass, "L"owpass, and so on. For example, `bH` means a filter coefficient of highpass.

Assignments like `y2 = y1` are ignored in difference equation. Instead, the subscript of the left side value of assignment is altered from `v1 = f(v1)` to `v0 = f(v1)`. This is basically converting the difference between math notation and assignment in programming language.

`input` is replaced with `x0`.

Below is difference equations.

```
v0 = a1 * (y1 - v1) + y2.              (1)
y0 = b * (x0 + x1) - a1 * y1 - q * v0. (2)
```

Solve (2) for v0.

```
v0 = (b * (x0 + x1) - a1 * y1 - y0) / q.
```

Substitute to (1) using Maxima.

```maxima
v(n) := (b_n * (x(n) + x(n - 1)) - a_1 * y(n-1) - y(n)) / q;

result: v(n) = a_1 * (y(n-1) - v(n-1)) + y(n-2);

ratvars(y(n), y(n-1), y(n-2), y(n-3), x(n), x(n-1), x(n-2), x(n-3));
ratsimp(0 = lhs(result) - rhs(result));
```

Output:

```maxima
+ y(n)
+ y(n-1) * (a_1*q + 2*a_1)
+ y(n-2) * (q + a_1^2)
=
+ x(n)   * b_n
+ x(n-1) * b_n * (a_1 + 1)
+ x(n-2) * b_n * a_1
```

Transfer function can be constructed from this output. But I'll skip it for now.

Stability condition:

```maxima
a: a_1*q + 2*a_1;
b: q + a_1^2;

case1: (2*a + b)^2 = +b^2 - 4*a;
case2: (2*a + b)^2 = -b^2 + 4*a;
case3: (2*a - b)^2 = -b^2 + 4*a;
case4: (2*a - b)^2 = +b^2 - 4*a;

solve(case1, q);
solve(case2, q);
solve(case3, q);
solve(case4, q);
```

Gain normalization:

```maxima
(
    + 1
    + (a_1 * q + 2 * a_1)
    + (q + a_1 * a_1)
) / (
    + b_n
    + b_n * (a_1 + 1)
    + b_n * a_1
)

gain = (1 + q + (q + 2) * a_1 + a_1 * a_1) / (2 + 2 * a_1)
     = (q + a_1 + 1) / 2
```

## ResonantLowpass1H1
Simplified code.

```javascript
// Bilinear highpass, order 1.
y1H = bH * (y1L - x1H) + a1 * y1H;
x1H = y1L;

// Bilinear lowpass, order 1.
y1L = bL * (input + x1L) + a1 * y1L + reso * y1H;
x1L = input;
return y1L;
```

Difference equations.

```
v0 = bH * (y1 - y2) + a1 * v1.          (1)
y0 = bL * (x0 + x1) + a1 * y1 - q * v0. (2)
```

Solve (2) for v0.

```
v0 = (bL * (x0 + x1) + a1 * y1 - y0) / q.
```

Substitute to (1) using Maxima.

```maxima
v(n) := (bL * (x(n) + x(n-1)) + a1 * y(n-1) - y(n)) / q;

result: v(n) = bH * (y(n-1) - y(n-2)) + a1 * v(n-1);

ratvars(y(n), y(n-1), y(n-2), y(n-3), x(n), x(n-1), x(n-2), x(n-3));
ratsimp(0 = lhs(result) - rhs(result));
```

Output:

```maxima
0=
+y(n)
+y(n-1) * (bH * q - 2 * a1)
+y(n-2) * (a1^2 - bH * q)
-x(n)   * bL
+x(n-1) * (a1 - 1) * bL
+x(n-2) * a1 * bL
```

Stability condition:

```maxima
a: a1^2 - bH * q;
b: bH * q - 2 * a1;

case1: (2*a + b)^2 = +b^2 - 4*a;
case2: (2*a + b)^2 = -b^2 + 4*a;
case3: (2*a - b)^2 = -b^2 + 4*a;
case4: (2*a - b)^2 = +b^2 - 4*a;

solve(case1, q);
solve(case2, q);
solve(case3, q);
solve(case4, q);
```

Solution:

```
maxQ = (a1 * a1 + 2 * a1 + 1) / (2 * bH);
```

## ResonantLowpass1H1Alt
Simplified code.

```javascript
// Bilinear highpass, order 1.
y1H = bH * (y1L - x1H) + a1 * y1H;
x1H = y1L;

// Bilinear lowpass, order 1.
y1L = bL * (input + x1L + reso * y1H) + a1 * y1L;
x1L = input;
return y1L;
```

Difference equations.

```
v0 = bH * (y1 - y2) + a1 * v1.          (1)
y0 = bL * (x0 + x1 - q * v0) + a1 * y1. (2)
```

Solve (2) for v0.

```
v0 = (x0 + x1 + (a1 * y1 - y0) / bL) / q.
```

Substitute to (1) using Maxima.

```maxima
v(n) := (x(n) + x(n-1) + (a1 * y(n-1) - y(n)) / bL) / q;

result: v(n) = bH * (y(n-1) - y(n-2)) + a1 * v(n-1);

ratvars(y(n), y(n-1), y(n-2), y(n-3), x(n), x(n-1), x(n-2), x(n-3));
ratsimp(0 = lhs(result) - rhs(result));
```

Output:

```maxima
0=
+y(n)
+y(n-1) * (bH*bL*q - 2*a1)
+y(n-2) * (a1^2 - bH*bL*q)
-x(n)   * bL
+x(n-1) * bL * (a1-1)
+x(n-2) * bL * a1
```

Stability condition:

```maxima
a: bH*bL*q - 2*a1;
b: a1^2 - bH*bL*q;

case1: (2*a + b)^2 = +b^2 - 4*a;
case2: (2*a + b)^2 = -b^2 + 4*a;
case3: (2*a - b)^2 = -b^2 + 4*a;
case4: (2*a - b)^2 = +b^2 - 4*a;

solve(case1, q);
solve(case2, q);
solve(case3, q);
solve(case4, q);
```

Solution:

```maxima
maxQ = (a1 * a1 + 2 * a1 + 1) / (2 * bH);
```
