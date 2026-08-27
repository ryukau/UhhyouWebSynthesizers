em++ `
  -s MODULARIZE=1 `
  -s EXPORT_ES6=1 `
  -s ALLOW_MEMORY_GROWTH=1 `
  -s USE_BOOST_HEADERS=1 `
  -lembind `
  -std=c++20 `
  -O3 `
  -flto `
  -msimd128 `
  -I include `
  -o "specialmath.js" `
  bindings.cpp `
  include/Faddeeva/Faddeeva.cc
