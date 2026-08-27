#define BOOST_MATH_DOMAIN_ERROR_POLICY ignore_error
#define BOOST_MATH_EVALUATION_ERROR_POLICY ignore_error
#define BOOST_MATH_OVERFLOW_ERROR_POLICY ignore_error
#define BOOST_MATH_UNDERFLOW_ERROR_POLICY ignore_error
#define BOOST_MATH_POLE_ERROR_POLICY ignore_error
#define BOOST_MATH_ROUNDING_ERROR_POLICY ignore_error
#define BOOST_MATH_DENORM_ERROR_POLICY ignore_error
#define BOOST_MATH_INDETERMINATE_RESULT_ERROR_POLICY ignore_error

#include <boost/math/special_functions.hpp>
#include <boost/math/special_functions/chebyshev.hpp>
#include <boost/math/special_functions/prime.hpp>
#include <boost/version.hpp>
#include <cmath>
#include <cstdint>
#include <emscripten/bind.h>
#include <string>

#include "fresnel.hpp"

using namespace emscripten;

std::string boost_version() { return BOOST_LIB_VERSION; }

struct FresnelResult {
  double c;
  double s;
};

FresnelResult fresnel_both(double x) {
  double c = 0.0;
  double s = 0.0;
  special_math::fresnel(x, c, s);
  return {c, s};
}

EMSCRIPTEN_BINDINGS(UhhyouSpecialMath) {
  function("boost_version", &boost_version);

  // ==========================================
  // Fresnel functions & object
  // ==========================================
  value_object<FresnelResult>("FresnelResult")
    .field("c", &FresnelResult::c)
    .field("s", &FresnelResult::s);

  function("fresnel", &fresnel_both);
  function("fresnel_cos", &special_math::fresnel_cos<double>);
  function("fresnel_sin", &special_math::fresnel_sin<double>);

  // ==========================================
  // Gamma and Polygamma Functions
  // ==========================================
  function("tgamma", +[](double x) -> double { return boost::math::tgamma(x); });
  function("tgamma_upper", +[](double a, double z) -> double { return boost::math::tgamma(a, z); });
  function(
    "tgamma_lower", +[](double a, double z) -> double { return boost::math::tgamma_lower(a, z); });
  function("tgamma1pm1", +[](double x) -> double { return boost::math::tgamma1pm1(x); });
  function("lgamma", +[](double x) -> double { return boost::math::lgamma(x); });
  function("digamma", +[](double x) -> double { return boost::math::digamma(x); });
  function("trigamma", +[](double x) -> double { return boost::math::trigamma(x); });
  function("polygamma", +[](int n, double x) -> double { return boost::math::polygamma(n, x); });
  function(
    "tgamma_ratio", +[](double a, double b) -> double { return boost::math::tgamma_ratio(a, b); });
  function(
    "tgamma_delta_ratio",
    +[](double a, double delta) -> double { return boost::math::tgamma_delta_ratio(a, delta); });
  function("gamma_p", +[](double a, double z) -> double { return boost::math::gamma_p(a, z); });
  function("gamma_q", +[](double a, double z) -> double { return boost::math::gamma_q(a, z); });
  function(
    "gamma_p_inv", +[](double a, double p) -> double { return boost::math::gamma_p_inv(a, p); });
  function(
    "gamma_q_inv", +[](double a, double q) -> double { return boost::math::gamma_q_inv(a, q); });
  function(
    "gamma_p_inva", +[](double p, double z) -> double { return boost::math::gamma_p_inva(p, z); });
  function(
    "gamma_q_inva", +[](double q, double z) -> double { return boost::math::gamma_q_inva(q, z); });
  function(
    "gamma_p_derivative",
    +[](double a, double x) -> double { return boost::math::gamma_p_derivative(a, x); });

  // ==========================================
  // Factorials and Binomial Coefficients
  // ==========================================
  function("factorial", +[](unsigned i) -> double { return boost::math::factorial<double>(i); });
  function(
    "double_factorial",
    +[](unsigned i) -> double { return boost::math::double_factorial<double>(i); });
  function(
    "rising_factorial",
    +[](double x, int i) -> double { return boost::math::rising_factorial(x, i); });
  function(
    "falling_factorial",
    +[](double x, unsigned i) -> double { return boost::math::falling_factorial(x, i); });
  function(
    "binomial_coefficient", +[](unsigned n, unsigned k) -> double {
      return boost::math::binomial_coefficient<double>(n, k);
    });

  // ==========================================
  // Beta Functions
  // ==========================================
  function("beta", +[](double a, double b) -> double { return boost::math::beta(a, b); });
  function(
    "betac", +[](double a, double b, double x) -> double { return boost::math::betac(a, b, x); });
  function(
    "ibeta", +[](double a, double b, double x) -> double { return boost::math::ibeta(a, b, x); });
  function(
    "ibetac", +[](double a, double b, double x) -> double { return boost::math::ibetac(a, b, x); });
  function(
    "ibeta_inv", +[](double a, double b, double p) -> double {
      if (p <= 0.0) { return 0.0; }
      if (p >= 1.0) { return 1.0; }
      double res = boost::math::ibeta_inv(a, b, p);
      if (std::isnan(res) || res < 0.0) {
        double w = boost::math::erf_inv(p);
        w = w * w;
        return w / (w + b);
      }
      return res;
    });
  function(
    "ibetac_inv", +[](double a, double b, double q) -> double {
      if (q <= 0.0) { return 1.0; }
      if (q >= 1.0) { return 0.0; }
      double res = boost::math::ibetac_inv(a, b, q);
      if (std::isnan(res) || res < 0.0) {
        double w = boost::math::erfc_inv(q);
        w = w * w;
        return w / (w + b);
      }
      return res;
    });
  function(
    "ibeta_inva",
    +[](double b, double x, double p) -> double { return boost::math::ibeta_inva(b, x, p); });
  function(
    "ibetac_inva",
    +[](double b, double x, double q) -> double { return boost::math::ibetac_inva(b, x, q); });
  function(
    "ibeta_invb",
    +[](double a, double x, double p) -> double { return boost::math::ibeta_invb(a, x, p); });
  function(
    "ibetac_invb",
    +[](double a, double x, double q) -> double { return boost::math::ibetac_invb(a, x, q); });
  function(
    "ibeta_derivative",
    +[](double a, double b, double x) -> double { return boost::math::ibeta_derivative(a, b, x); });

  // ==========================================
  // Error Functions and Inverses
  // ==========================================
  function("erf", +[](double x) -> double { return boost::math::erf(x); });
  function("erfc", +[](double x) -> double { return boost::math::erfc(x); });
  function("erf_inv", +[](double x) -> double { return boost::math::erf_inv(x); });
  function("erfc_inv", +[](double x) -> double { return boost::math::erfc_inv(x); });

  // ==========================================
  // Polynomials (Legendre, Laguerre, Hermite, Chebyshev, Gegenbauer, Jacobi)
  // ==========================================
  function("legendre_p", +[](int n, double x) -> double { return boost::math::legendre_p(n, x); });
  function(
    "legendre_p_assoc",
    +[](int n, int m, double x) -> double { return boost::math::legendre_p(n, m, x); });
  function(
    "legendre_p_prime",
    +[](int n, double x) -> double { return boost::math::legendre_p_prime(n, x); });
  function(
    "legendre_q", +[](unsigned n, double x) -> double { return boost::math::legendre_q(n, x); });
  function(
    "legendre_next", +[](unsigned l, double x, double Pl, double Plm1) -> double {
      return boost::math::legendre_next(l, x, Pl, Plm1);
    });

  function("laguerre", +[](unsigned n, double x) -> double { return boost::math::laguerre(n, x); });
  function(
    "laguerre_assoc",
    +[](unsigned n, unsigned m, double x) -> double { return boost::math::laguerre(n, m, x); });
  function(
    "laguerre_next", +[](unsigned n, double x, double Ln, double Lnm1) -> double {
      return boost::math::laguerre_next(n, x, Ln, Lnm1);
    });
  function(
    "laguerre_assoc_next", +[](unsigned n, unsigned l, double x, double Ln, double Lnm1) -> double {
      return boost::math::laguerre_next(n, l, x, Ln, Lnm1);
    });

  function("hermite", +[](unsigned n, double x) -> double { return boost::math::hermite(n, x); });
  function(
    "hermite_next", +[](unsigned n, double x, double Hn, double Hnm1) -> double {
      return boost::math::hermite_next(n, x, Hn, Hnm1);
    });

  function(
    "chebyshev_t", +[](unsigned n, double x) -> double { return boost::math::chebyshev_t(n, x); });
  function(
    "chebyshev_u", +[](unsigned n, double x) -> double { return boost::math::chebyshev_u(n, x); });
  function(
    "chebyshev_t_prime",
    +[](unsigned n, double x) -> double { return boost::math::chebyshev_t_prime(n, x); });
  function(
    "chebyshev_next", +[](double x, double Tn, double Tnm1) -> double {
      return boost::math::chebyshev_next(x, Tn, Tnm1);
    });

  function(
    "gegenbauer", +[](unsigned n, double lambda, double x) -> double {
      return boost::math::gegenbauer(n, lambda, x);
    });
  function(
    "gegenbauer_prime", +[](unsigned n, double lambda, double x) -> double {
      return boost::math::gegenbauer_prime(n, lambda, x);
    });

  function(
    "jacobi", +[](unsigned n, double alpha, double beta, double x) -> double {
      return boost::math::jacobi(n, alpha, beta, x);
    });
  function(
    "jacobi_prime", +[](unsigned n, double alpha, double beta, double x) -> double {
      return boost::math::jacobi_prime(n, alpha, beta, x);
    });
  function(
    "jacobi_double_prime", +[](unsigned n, double alpha, double beta, double x) -> double {
      return boost::math::jacobi_double_prime(n, alpha, beta, x);
    });

  function(
    "spherical_harmonic_r", +[](unsigned n, int m, double theta, double phi) -> double {
      return boost::math::spherical_harmonic_r(n, m, theta, phi);
    });
  function(
    "spherical_harmonic_i", +[](unsigned n, int m, double theta, double phi) -> double {
      return boost::math::spherical_harmonic_i(n, m, theta, phi);
    });

  // ==========================================
  // Bessel, Neumann, and Airy Functions
  // ==========================================
  function(
    "cyl_bessel_j", +[](double v, double x) -> double { return boost::math::cyl_bessel_j(v, x); });
  function(
    "cyl_bessel_j_zero",
    +[](double v, int m) -> double { return boost::math::cyl_bessel_j_zero<double>(v, m); });
  function(
    "cyl_bessel_j_prime",
    +[](double v, double x) -> double { return boost::math::cyl_bessel_j_prime(v, x); });

  function(
    "cyl_neumann", +[](double v, double x) -> double { return boost::math::cyl_neumann(v, x); });
  function(
    "cyl_neumann_zero",
    +[](double v, int m) -> double { return boost::math::cyl_neumann_zero<double>(v, m); });
  function(
    "cyl_neumann_prime",
    +[](double v, double x) -> double { return boost::math::cyl_neumann_prime(v, x); });

  function(
    "cyl_bessel_i", +[](double v, double x) -> double { return boost::math::cyl_bessel_i(v, x); });
  function(
    "cyl_bessel_i_prime",
    +[](double v, double x) -> double { return boost::math::cyl_bessel_i_prime(v, x); });
  function(
    "cyl_bessel_k", +[](double v, double x) -> double { return boost::math::cyl_bessel_k(v, x); });
  function(
    "cyl_bessel_k_prime",
    +[](double v, double x) -> double { return boost::math::cyl_bessel_k_prime(v, x); });

  function(
    "sph_bessel", +[](unsigned v, double x) -> double { return boost::math::sph_bessel(v, x); });
  function(
    "sph_bessel_prime",
    +[](unsigned v, double x) -> double { return boost::math::sph_bessel_prime(v, x); });
  function(
    "sph_neumann", +[](unsigned v, double x) -> double { return boost::math::sph_neumann(v, x); });
  function(
    "sph_neumann_prime",
    +[](unsigned v, double x) -> double { return boost::math::sph_neumann_prime(v, x); });

  function("airy_ai", +[](double x) -> double { return boost::math::airy_ai(x); });
  function("airy_bi", +[](double x) -> double { return boost::math::airy_bi(x); });
  function("airy_ai_prime", +[](double x) -> double { return boost::math::airy_ai_prime(x); });
  function("airy_bi_prime", +[](double x) -> double { return boost::math::airy_bi_prime(x); });
  function(
    "airy_ai_zero", +[](unsigned m) -> double { return boost::math::airy_ai_zero<double>(m); });
  function(
    "airy_bi_zero", +[](unsigned m) -> double { return boost::math::airy_bi_zero<double>(m); });

  // ==========================================
  // Elliptic Integrals and Jacobi Elliptic Functions
  // ==========================================
  function(
    "ellint_rf",
    +[](double x, double y, double z) -> double { return boost::math::ellint_rf(x, y, z); });
  function(
    "ellint_rd",
    +[](double x, double y, double z) -> double { return boost::math::ellint_rd(x, y, z); });
  function(
    "ellint_rj", +[](double x, double y, double z, double p) -> double {
      return boost::math::ellint_rj(x, y, z, p);
    });
  function("ellint_rc", +[](double x, double y) -> double { return boost::math::ellint_rc(x, y); });
  function(
    "ellint_rg",
    +[](double x, double y, double z) -> double { return boost::math::ellint_rg(x, y, z); });

  function("ellint_1_complete", +[](double k) -> double { return boost::math::ellint_1(k); });
  function(
    "ellint_1", +[](double k, double phi) -> double { return boost::math::ellint_1(k, phi); });
  function("ellint_2_complete", +[](double k) -> double { return boost::math::ellint_2(k); });
  function(
    "ellint_2", +[](double k, double phi) -> double { return boost::math::ellint_2(k, phi); });
  function(
    "ellint_3_complete", +[](double k, double n) -> double { return boost::math::ellint_3(k, n); });
  function(
    "ellint_3",
    +[](double k, double n, double phi) -> double { return boost::math::ellint_3(k, n, phi); });

  function(
    "jacobi_zeta",
    +[](double k, double phi) -> double { return boost::math::jacobi_zeta(k, phi); });
  function(
    "heuman_lambda",
    +[](double k, double phi) -> double { return boost::math::heuman_lambda(k, phi); });

  function("jacobi_sn", +[](double k, double u) -> double { return boost::math::jacobi_sn(k, u); });
  function("jacobi_cn", +[](double k, double u) -> double { return boost::math::jacobi_cn(k, u); });
  function("jacobi_dn", +[](double k, double u) -> double { return boost::math::jacobi_dn(k, u); });
  function("jacobi_cd", +[](double k, double u) -> double { return boost::math::jacobi_cd(k, u); });
  function("jacobi_sd", +[](double k, double u) -> double { return boost::math::jacobi_sd(k, u); });
  function("jacobi_nd", +[](double k, double u) -> double { return boost::math::jacobi_nd(k, u); });
  function("jacobi_dc", +[](double k, double u) -> double { return boost::math::jacobi_dc(k, u); });
  function("jacobi_nc", +[](double k, double u) -> double { return boost::math::jacobi_nc(k, u); });
  function("jacobi_sc", +[](double k, double u) -> double { return boost::math::jacobi_sc(k, u); });
  function("jacobi_ns", +[](double k, double u) -> double { return boost::math::jacobi_ns(k, u); });
  function("jacobi_ds", +[](double k, double u) -> double { return boost::math::jacobi_ds(k, u); });
  function("jacobi_cs", +[](double k, double u) -> double { return boost::math::jacobi_cs(k, u); });

  // ==========================================
  // Zeta and Exponential Integrals
  // ==========================================
  function("zeta", +[](double s) -> double { return boost::math::zeta(s); });
  function("expint", +[](double z) -> double { return boost::math::expint(z); });
  function("expint_n", +[](unsigned n, double z) -> double { return boost::math::expint(n, z); });

  // ==========================================
  // Number Series, Transcendental, and Auxiliary Functions
  // ==========================================
  function("bernoulli_b2n", +[](int i) -> double { return boost::math::bernoulli_b2n<double>(i); });
  function("tangent_t2n", +[](int i) -> double { return boost::math::tangent_t2n<double>(i); });
  function("prime", +[](unsigned n) -> uint32_t { return boost::math::prime(n); });

  function("sinc_pi", +[](double x) -> double { return boost::math::sinc_pi(x); });
  function("sinhc_pi", +[](double x) -> double { return boost::math::sinhc_pi(x); });
  function("sin_pi", +[](double x) -> double { return boost::math::sin_pi(x); });
  function("cos_pi", +[](double x) -> double { return boost::math::cos_pi(x); });
  function("log1p", +[](double x) -> double { return boost::math::log1p(x); });
  function("expm1", +[](double x) -> double { return boost::math::expm1(x); });
  function("log1pmx", +[](double x) -> double { return boost::math::log1pmx(x); });
  function("hypot", +[](double x, double y) -> double { return boost::math::hypot(x, y); });
  function("powm1", +[](double x, double y) -> double { return boost::math::powm1(x, y); });
  function("cbrt", +[](double x) -> double { return boost::math::cbrt(x); });
  function("sqrt1pm1", +[](double x) -> double { return boost::math::sqrt1pm1(x); });

  function("owens_t", +[](double h, double a) -> double { return boost::math::owens_t(h, a); });
}

int main() { return 0; }
