#pragma once

#include <cmath>
#include <complex>
#include <concepts>
#include <numbers>

#include "Faddeeva/Faddeeva.hh"

namespace special_math {

//
//  Purpose:
//
//    fresnel() computes Fresnel integrals C(x) and S(x).
//
//  Method:
//
//    Evaluates the Fresnel Integrals using the complex Error function identity:
//        C(x) + i S(x) = (1 + i) / 2 * erf( sqrt(pi)/2 * (1 - i) * x )
//
//    This delegates the numeric heavy lifting (switching between Taylor
//    expansions and continued fractions seamlessly) to the Faddeeva package.
//
//  Input:
//
//    floating_point X, the argument.
//
//  Output:
//
//    floating_point C, S, the function values.
//
template<std::floating_point T> void fresnel(T x, T& c, T& s) {
  const double x_d = static_cast<double>(x);

  static const double sqrt_pi_over_2 = std::sqrt(std::numbers::pi_v<double>) / 2.0;

  const double z_val = sqrt_pi_over_2 * x_d;
  std::complex<double> z(z_val, -z_val);

  std::complex<double> erf_z = Faddeeva::erf(z);

  const double R = erf_z.real();
  const double I = erf_z.imag();

  c = static_cast<T>(0.5 * (R - I));
  s = static_cast<T>(0.5 * (R + I));
}

template<std::floating_point T> T fresnel_cos(T x) {
  T c;
  T s;
  fresnel(x, c, s);
  return c;
}

template<std::floating_point T> T fresnel_sin(T x) {
  T c;
  T s;
  fresnel(x, c, s);
  return s;
}

} // namespace special_math
