# Port of `LambertW`
Below is the link to the original repository.

- [GitHub - DarkoVeberic/LambertW: C++ implementation of the Lambert W(x) function](https://github.com/DarkoVeberic/LambertW)

Note that this implementation is ported for hobby use. Accuracy is not verified comprehensively. In the original repository, there's a issue that this routine is less accurate around `1/e`.

- [Accuracy near branch point · Issue #2 · DarkoVeberic/LambertW · GitHub](https://github.com/DarkoVeberic/LambertW/issues/2)

A modification is made to return `-Infinity` for `LambertWm1(0)`.

## Usage
```javascript
import * as lambartw from "./path/to/lambartw.js";

const z = -1 / Math.E;

const w0 = lambartw.LambertW0(z);
const wm1 = lambartw.LambertWm1(z);

w0  == lambartw.LambertW(z, 0);  // true
wm1 == lambartw.LambertW(z, -1); // true
```

## License
The original code is dual licensed under the GPL version 2 and the two-clause BSD license. This port is using the two-clause BSD license. Below is the license text obtained in 2024-05-14.

```
Copyright (c) 2014 Darko Veberic
All rights reserved.

Redistribution and use in source and binary forms, with or without modification, are permitted provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice, this list of conditions and the following disclaimer.

2. Redistributions in binary form must reproduce the above copyright notice, this list of conditions and the following disclaimer in the documentation and/or other materials provided with the distribution.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
```
