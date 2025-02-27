# `jyzo` from special_functions by Shanjie Zhang and Jianming Jin
Below is a link to the original Fortran90 code.

- [special_functions](https://people.sc.fsu.edu/~jburkardt/f_src/special_functions/special_functions.html)

`jyzo` and its dependency `jyndd` are ported to JavaScript.

## Usage
`jyzo` computes the zeros of Bessel functions Jn(x), Yn(x) and derivatives. Return values are the zeros of Jn(x), Jn'(x), Yn(x), Yn'(x).

```javascript
import {jyzo} from "./jyzo.js";
const n = 0;   // integer, the order of the Bessel functions.
const nt = 16; // integer, the number of zeros.
const [rj0, rj1, ry0, ry1] = jyzo(n, nt);
```

The usage of `jyndd` is omitted because unlike the original Fortran90 code, the ported version of `jyndd` returns NaN if `x` is negative and close to 0 (-1 < x < 0).

## License
Below is the original `jyzo` license text obtained in 2025-02-27.

```fortran
!*****************************************************************************80
!
!! JYZO computes the zeros of Bessel functions Jn(x), Yn(x) and derivatives.
!
!  Licensing:
!
!    This routine is copyrighted by Shanjie Zhang and Jianming Jin.  However,
!    they give permission to incorporate this routine into a user program
!    provided that the copyright is acknowledged.
!
!  Modified:
!
!    28 July 2012
!
!  Author:
!
!    Shanjie Zhang, Jianming Jin
!
!  Reference:
!
!    Shanjie Zhang, Jianming Jin,
!    Computation of Special Functions,
!    Wiley, 1996,
!    ISBN: 0-471-11963-6,
!    LC: QA351.C45.
!
!  Parameters:
!
!    Input, integer N, the order of the Bessel functions.
!
!    Input, integer NT, the number of zeros.
!
!    Output, real ( kind = rk ) RJ0(NT), RJ1(NT), RY0(NT), RY1(NT), the zeros
!    of Jn(x), Jn'(x), Yn(x), Yn'(x).
!
```

Below is the original `jyndd` license text obtained in 2025-02-27.

```fortran
!*****************************************************************************80
!
!! JYNDD: Bessel functions Jn(x) and Yn(x), first and second derivatives.
!
!  Licensing:
!
!    This routine is copyrighted by Shanjie Zhang and Jianming Jin.  However,
!    they give permission to incorporate this routine into a user program
!    provided that the copyright is acknowledged.
!
!  Modified:
!
!    02 August 2012
!
!  Author:
!
!    Shanjie Zhang, Jianming Jin
!
!  Reference:
!
!    Shanjie Zhang, Jianming Jin,
!    Computation of Special Functions,
!    Wiley, 1996,
!    ISBN: 0-471-11963-6,
!    LC: QA351.C45.
!
!  Parameters:
!
!    Input, integer N, the order.
!
!    Input, real ( kind = rk ) X, the argument.
!
!    Output, real ( kind = rk ) BJN, DJN, FJN, BYN, DYN, FYN, the values of
!    Jn(x), Jn'(x), Jn"(x), Yn(x), Yn'(x), Yn"(x).
!
```
