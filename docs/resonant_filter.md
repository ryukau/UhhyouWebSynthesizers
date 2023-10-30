# Construction of Resonant Filters
Resonant filters described here have following structure.

```
input -+--------> (main filter) --------+-> output
       ↑                                |
       +- (gain) <- (feedback filter) <-+
```

`gain` is called `resonance` or `q` in code.

These filters are written in `common/dsp/resonantfilters.js`. Following files contain the filters used as building block.

- `common/dsp/onepole.js`
- `common/dsp/sos.js`
- `common/dsp/svf.js`

## Finding Stability Condition
The problem is how to determine the bounds of `gain` that doesn't blow up the filter. For simple filters, transfer function can be used.

1. Write filter code by combining building blocks.
2. Convert the filter code to difference equations.
3. Convert the difference equations to transfer function.
4. Solve the transfer function to get a stability condition.

It's kind of vague that what really is a "simple" filter. Usually order 2 or less can be considered simple. Most of order 3 or more filters don't have concise stability condition, because general solution of order 3 or order 4 polynomial are complicated. (See [here](https://math.vanderbilt.edu/schectex/courses/cubic/) and [here](https://en.wikipedia.org/wiki/File:Quartic_Formula.svg) for how lengthy they are.)

Anyway, we can use numerical method when the analytic solution is impractical. Below is an outline of the method I used.

1. Select cutoff frequencies to find the upper bound of `resonance`. This becomes a lookup table. Application draws the values from given cutoff, and maybe interpolates them.
2. Setup binary search for `resonance` for each cutoff. Linear regression of impulse response (IR) is used for branching.
  - If the slope is positive, branch into lower side. IR is diversing.
  - If the slope is negative, branch into upper side. IR is conversing.
  - We want to find `resonance` that make the slope to exactly 0.

The problem of linear regression approach is that the length of impulse response can only be finite on computer. We are dealing with IIR filter, where IIR stands for **infinite** impulse response. In practice, it was sufficient to cut at 65536 = 2^16 samples for the filters described here.

## ResonantLowpass1A1
Code below comes from `ResonantLowpass1A1.process()`.

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

Assignments like `y2 = y1` are ignored in difference equations. Instead, the subscript in the left side value of assignment is altered from `v1 = f(v1)` to `v0 = f(v1)`. This is basically converting the difference between math notation and assignment in programming language.

`input` in code is replaced with `x0` in difference equation.

Below is the difference equations of `ResonantLowpass1A1`.

```
v0 = a1 * (y1 - v1) + y2.              (1)
y0 = b * (x0 + x1) - a1 * y1 - q * v0. (2)
```

Solve (2) for v0.

```
v0 = (b * (x0 + x1) - a1 * y1 - y0) / q.
```

Substitute above to (1) using [Maxima](https://maxima.sourceforge.io/).

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

Transfer function can be constructed from the output above. But I'll skip it for now.

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

Solution.

```maxima
maxQ = -a1 - 1;
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

Scaling is applied to the implementation in `common/dsp/resonantfilters.js`. The scaling factor was obtained by comparing a numerical solution to the analytic solution above.

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
