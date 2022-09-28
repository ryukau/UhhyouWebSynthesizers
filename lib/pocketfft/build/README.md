- `pocketfft_hdronly.h` is the original C++ file from [pocketfft repository](https://gitlab.mpcdf.mpg.de/mtr/pocketfft).
- `pocketfftbind.cpp` is Embind code.

## Build
Run `build.ps1`.

## Test
There are 2 tests. One is to check C++ implementation. Other is to check bindings in JavaScript.

### C++ Test
1. Run `test.ps1`. `pocketfft.json` will be written when C++ test runs successfully.
2. Run `verify.py`. `verify.py` uses `numpy.fft` output as ground truth, because NumPy is using pocketfft.
3. Success if there's no output. If there's any output at step 2, fix bug and start again from step 1.

### JavaScript Binding Test
1. Run `python server.py` to open `test.html`.
2. Open browser developer console for `test.html`.
3. Success if there's no output. If there's any output at step 2, fix bug and start again from step 1.
