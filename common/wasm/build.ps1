em++.bat `
  -sMODULARIZE=1 `
  -sEXPORT_ES6=1 `
  -sALLOW_MEMORY_GROWTH=1 `
  -lembind `
  -flto `
  -fno-exceptions `
  -O3 `
  -o"basiclimiter.js" `
  .\basiclimiter.cpp
