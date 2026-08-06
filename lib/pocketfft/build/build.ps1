em++ `
  -s MODULARIZE=1 `
  -s EXPORT_ES6=1 `
  -s ALLOW_MEMORY_GROWTH=1 `
  -lembind `
  -std=c++20 `
  -O3 `
  -flto `
  -o "pocketfft.js" `
  .\pocketfftbind.cpp
