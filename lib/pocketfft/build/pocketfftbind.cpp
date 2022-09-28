#include "pocketfft_hdronly.h"

struct PocketFFTData {
  pocketfft::shape_t shape;
  pocketfft::stride_t strideR;
  pocketfft::stride_t strideC;
  pocketfft::shape_t axes;
  size_t ndata = 1;
};

PocketFFTData getData1D(size_t length) {
  PocketFFTData dt;

  dt.shape = {length};

  dt.strideR.resize(dt.shape.size());
  dt.strideC.resize(dt.shape.size());

  size_t tmpR = sizeof(double);
  size_t tmpC = sizeof(std::complex<double>);
  for (int i = int(dt.shape.size()) - 1; i >= 0; --i) {
    dt.strideR[i] = tmpR;
    tmpR *= dt.shape[i];
    dt.strideC[i] = tmpC;
    tmpC *= dt.shape[i];
  }

  dt.ndata = 1;
  for (const auto &shp : dt.shape) dt.ndata *= shp;

  dt.axes.resize(dt.shape.size());

  return dt;
}

std::vector<std::complex<double>> r2c(const std::vector<double> &sig) {
  auto dt = getData1D(sig.size());
  std::vector<std::complex<double>> spc(sig.size() / 2 + 1);
  pocketfft::r2c(dt.shape, dt.strideR, dt.strideC, dt.axes, true, &sig[0], &spc[0], 1.0);
  return spc;
}

std::vector<double> c2r(const std::vector<std::complex<double>> &spc) {
  auto dt = getData1D((spc.size() - 1) * 2);
  std::vector<double> sig(dt.ndata);
  pocketfft::c2r(
    dt.shape, dt.strideC, dt.strideR, dt.axes, false, &spc[0], &sig[0], 1.0 / dt.ndata);
  return sig;
}

#ifndef UHHYOU_TEST

  #include <emscripten/bind.h>

using namespace emscripten;

template<typename Complex> struct ComplexAccess {
  static val getReal(const Complex &v) { return val(v.real()); }
  static val getImag(const Complex &v) { return val(v.imag()); }

  static bool setReal(Complex &v, const typename Complex::value_type &value) {
    v.real(value);
    return true;
  }

  static bool setImag(Complex &v, const typename Complex::value_type &value) {
    v.imag(value);
    return true;
  }
};

template<typename T> class_<std::complex<T>> register_complex(const char *name) {
  typedef std::complex<T> C;

  return class_<std::complex<T>>(name)
    .template constructor<>()
    .property("real", &ComplexAccess<C>::getReal, &ComplexAccess<C>::setReal)
    .property("imag", &ComplexAccess<C>::getImag, &ComplexAccess<C>::setImag);
}

template<typename VecType> struct ComplexVectorAccess {
  typedef typename VecType::value_type::value_type ValueType;

  static val get(const VecType &v, typename VecType::size_type index) {
    if (index < v.size()) {
      return val(v[index]);
    } else {
      return val::undefined();
    }
  }

  static val getReal(const VecType &v, typename VecType::size_type index) {
    return (index < v.size()) ? val(v[index].real()) : val::undefined();
  }

  static val getImag(const VecType &v, typename VecType::size_type index) {
    return (index < v.size()) ? val(v[index].imag()) : val::undefined();
  }

  static bool set(
    VecType &v,
    typename VecType::size_type index,
    const typename VecType::value_type &value) {
    v[index] = value;
    return true;
  }

  static bool setValue(
    VecType &v,
    typename VecType::size_type index,
    const ValueType real,
    const ValueType imag) {
    v[index].real(real);
    v[index].imag(imag);
    return true;
  }

  static bool
  setReal(VecType &v, typename VecType::size_type index, const ValueType value) {
    v[index].real(value);
    return true;
  }

  static bool
  setImag(VecType &v, typename VecType::size_type index, const ValueType value) {
    v[index].imag(value);
    return true;
  }
};

template<typename T>
class_<std::vector<std::complex<T>>> register_complex_vector(const char *name) {
  typedef std::vector<std::complex<T>> VecType;

  void (VecType::*push_back)(const std::complex<T> &) = &VecType::push_back;
  void (VecType::*resize)(const size_t) = &VecType::resize;
  size_t (VecType::*size)() const = &VecType::size;
  return class_<VecType>(name)
    .template constructor<>()
    .function("push_back", push_back)
    .function("resize", resize)
    .function("size", size)
    .function("get", &ComplexVectorAccess<VecType>::get)
    .function("getReal", &ComplexVectorAccess<VecType>::getReal)
    .function("getImag", &ComplexVectorAccess<VecType>::getImag)
    .function("set", &ComplexVectorAccess<VecType>::set)
    .function("setValue", &ComplexVectorAccess<VecType>::setValue)
    .function("setReal", &ComplexVectorAccess<VecType>::setReal)
    .function("setImag", &ComplexVectorAccess<VecType>::setImag);
}

EMSCRIPTEN_BINDINGS(PocketFFT) {
  register_complex<double>("complex128");
  register_vector<double>("vector_f64");
  register_complex_vector<double>("vector_complex128");

  function("r2c", &r2c);
  function("c2r", &c2r);
}

int main() { return 0; }

#else

  #include <format>
  #include <fstream>
  #include <iostream>
  #include <random>
  #include <string>

int main() {
  std::string text;

  std::vector<double> input(1111);
  std::minstd_rand rng{0};
  std::normal_distribution<double> dist{};
  for (auto &v : input) v = dist(rng);

  auto spectrum = r2c(input);
  auto output = c2r(spectrum);

  text += "{\"input\":[";
  for (const auto &v : input) text += std::format("{},", v);
  text.pop_back();

  text += "],\"spectrum\":[";
  for (const auto &v : spectrum) text += std::format("[{},{}],", v.real(), v.imag());
  text.pop_back();

  text += "],\"output\":[";
  for (const auto &v : output) text += std::format("{},", v);
  text.pop_back();
  text += "]}";

  std::ofstream fs("pocketfft.json");
  if (fs.is_open()) fs << text;

  return 0;
}

#endif
