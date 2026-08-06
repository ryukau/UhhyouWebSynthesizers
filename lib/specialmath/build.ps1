emcmake cmake -B build -G Ninja -DCMAKE_BUILD_TYPE=Release
cmake --build build
Move-Item build/specialmath.js . -Force
Move-Item build/specialmath.wasm . -Force
