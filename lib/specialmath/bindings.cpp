#include <boost/math/special_functions/gamma.hpp>
#include <boost/version.hpp>
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

  // Boost math functions
  function("gamma_p", &boost::math::gamma_p<double, double>);
  function("gamma_q", &boost::math::gamma_q<double, double>);
  function("tgamma_lower", &boost::math::tgamma_lower<double, double>);
  function("tgamma", &boost::math::tgamma<double, double>);

  // Fresnel output object
  value_object<FresnelResult>("FresnelResult")
    .field("c", &FresnelResult::c)
    .field("s", &FresnelResult::s);

  // Fresnel functions
  function("fresnel", &fresnel_both);
  function("fresnel_cos", &special_math::fresnel_cos<double>);
  function("fresnel_sin", &special_math::fresnel_sin<double>);
}
