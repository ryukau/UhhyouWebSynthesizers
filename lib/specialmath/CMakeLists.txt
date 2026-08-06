cmake_minimum_required(VERSION 3.20)
project(UhhyouSpecialMath LANGUAGES CXX C)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

add_executable(specialmath
  bindings.cpp
  include/Faddeeva/Faddeeva.cc
)

target_include_directories(specialmath PRIVATE
  ${CMAKE_CURRENT_SOURCE_DIR}/include
)

target_compile_options(specialmath PRIVATE
  -flto
  -O3
  -msimd128
  -mfma
)

target_link_options(specialmath PRIVATE
  -lembind
  -flto
  -O3
  -msimd128
  -mfma
  -sUSE_BOOST_HEADERS=1
  -sMODULARIZE=1
  -sEXPORT_ES6=1
  -sPOLYFILL=1
)

set_target_properties(specialmath PROPERTIES
  RUNTIME_OUTPUT_DIRECTORY "${CMAKE_CURRENT_SOURCE_DIR}/build"
  OUTPUT_NAME "specialmath"
  SUFFIX ".js"
)
