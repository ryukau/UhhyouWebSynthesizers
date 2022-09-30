# Fork of `bezier-easing`
Below is link to the original repository.

- [GitHub - gre/bezier-easing: cubic-bezier implementation for your JavaScript animation easings – MIT License](https://github.com/gre/bezier-easing)

## Usage
```javascript
var easing = BezierEasing(0, 0, 1, 0.5); // BezierEasing(P1.x, P1.y, P2.x, P2.y)
console.log(easing(0.0)); // 0.0
console.log(easing(0.5)); // 0.3125
console.log(easing(1.0)); // 1.0
```

## License
Below is the original license text obtained in 2022-09-29.

    Copyright (c) 2014 Gaëtan Renaudeau

    Permission is hereby granted, free of charge, to any person
    obtaining a copy of this software and associated documentation
    files (the "Software"), to deal in the Software without
    restriction, including without limitation the rights to use,
    copy, modify, merge, publish, distribute, sublicense, and/or sell
    copies of the Software, and to permit persons to whom the
    Software is furnished to do so, subject to the following
    conditions:

    The above copyright notice and this permission notice shall be
    included in all copies or substantial portions of the Software.

    THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
    EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES
    OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
    NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT
    HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY,
    WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
    FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR
    OTHER DEALINGS IN THE SOFTWARE.
