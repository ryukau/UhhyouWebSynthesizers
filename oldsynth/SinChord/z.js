class Z {
  // ベクトル計算と混ぜて使うために（実部、虚部）を (x, y) で表現する。
  constructor(x, y) {
    this.x = x
    this.y = y
  }

  set(x, y) {
    this.x = x
    this.y = y
    return this
  }

  copy(z) {
    this.x = z.x
    this.y = z.y
    return this
  }

  clone() {
    return new Z(this.x, this.y)
  }

  toString() {
    return `(${this.x}, ${this.y})`
  }

  // x, y ともに計算できる値なら true、そうでなければ false。
  isNaN() {
    return isNaN(this.x) || isNaN(this.y)
  }

  // おかしな値を 0 にして計算できるようにする。
  validate() {
    if (isNaN(this.x)) {
      this.x = 0
    }
    if (isNaN(this.y)) {
      this.y = 0
    }
  }

  // 絶対値。
  abs() {
    return Math.sqrt(this.x * this.x + this.y * this.y)
  }

  // 加算。
  add(z) {
    this.x += z.x
    this.y += z.y
    return this
  }

  static add(z1, z2) {
    return new Z(z1.x + z2.x, z1.y + z2.y)
  }

  // 角度を求める。
  arg() {
    return Math.atan2(this.y, this.x)
  }

  // 共役複素数 (conjugate) 。
  con() {
    this.y = -this.y
    return this
  }

  // 除算。
  div(z) {
    var denom = 1 / (z.x * z.x + z.y * z.y)
    this.x = (this.x * z.x + this.y * z.y) * denom
    this.y = (this.y * z.x - this.x * z.y) * denom
    return this
  }

  static div(z1, z2) {
    var denom = 1 / (z2.x * z2.x + z2.y * z2.y)
    var x = (z1.x * z2.x + z1.y * z2.y) * denom
    var y = (z1.y * z2.x - z1.x * z2.y) * denom
    return new Z(x, y)
  }

  // 指数関数。
  exp() {
    var re = Math.exp(this.x)
    this.x = re * Math.cos(this.y)
    this.y = re * Math.sin(this.y)
    return this
  }

  // 逆数 (Inverse, 1 / z) 。
  inv() {
    var denom = 1 / (this.x * this.x + this.y * this.y)
    this.x = this.x * denom
    this.y = -this.y * denom
    return this
  }

  // 自然対数。
  log() {
    var r = Math.sqrt(this.x * this.x + this.y * this.y)
    this.y = Math.atan2(this.y, this.x)
    this.x = Math.log(r)
    return this
  }

  // 乗算。
  mul(z) {
    this.x = this.x * z.x - this.y * z.y
    this.y = this.x * z.y + this.y * z.x
    return this
  }

  static mul(z1, z2) {
    var x = z1.x * z2.x - z1.y * z2.y
    var y = z1.x * z2.y + z1.y * z2.x
    return new Z(x, y)
  }

  // 複素数 a に実数 r をかける。
  mulr(re) {
    this.x *= re
    this.y *= re
    return this
  }

  static mulr(z, re) {
    var x = z.x * re
    var y = z.y * re
    return new Z(x, y)
  }

  // 負の値。
  neg() {
    this.x = -this.x
    this.y = -this.y
    return this
  }

  // べき乗。
  pow(w) {
    this.log()
    this.x = w.x * this.x - w.y * this.y
    this.y = w.x * this.y + w.y * this.x
    return this.exp()
  }

  powr(re) {
    this.log()
    this.x = re * this.x
    this.y = re * this.y
    // ここで{x: -1.8694233116608716, y: -3.141592653589793}
    // となっていると誤差が出る。
    return this.exp()
  }

  // 原点を中心に回転。
  rotate(theta) {
    var sin = Math.sin(theta)
    var cos = Math.cos(theta)
    var x = this.x * cos - this.y * sin
    var y = this.x * sin + this.y * cos
    this.x = x
    this.y = y
    return this
  }

  // 平方根。
  sqrt() {
    var r = Math.sqrt(this.x * this.x + this.y * this.y)
    this.x = Math.sqrt((r + this.x) * 0.5)
    this.y = Math.sign(this.y) * Math.sqrt((r - this.x) * 0.5)
    return this
  }

  // 減算。
  sub(z) {
    this.x -= z.x
    this.y -= z.y
    return this
  }

  static sub(z1, z2) {
    return new Z(z1.x - z2.x, z1.y - z2.y)
  }

  // 三角関数。場合分けしたほうが速そう。
  sin() {
    if (this.y === 0) {
      if (this.x === 0) {
        this.x = 0
      }
      else {
        this.x = Math.sin(this.x)
      }
      this.y = 0
    }
    else if (this.x === 0) {
      this.x = 0
      this.y = Math.sinh(this.y)
    }
    else {
      this.x = Math.sin(this.x) * Math.cosh(this.y)
      this.y = Math.cos(this.x) * Math.sinh(this.y)
    }
    return this
  }

  cos() {
    if (this.y === 0) {
      if (this.x === 0) {
        this.x = 1
      }
      else {
        this.x = Math.cos(this.x)
      }
      this.y = 0
    }
    else if (this.x === 0) {
      if (this.y === 0) {
        this.x = 1
      }
      else {
        this.x = Math.cosh(this.x)
      }
      this.y = 0
    }
    else {
      this.x = Math.cos(this.x) * Math.cosh(this.y)
      this.y = -Math.sin(this.x) * Math.sinh(this.y)
    }
    return this
  }

  tan() {
    var A = 1 + Math.cos(2 * this.x)
    var B = Math.sinh(this.y) * Math.sinh(this.y)
    var denom = 1 / (A + 2 * B)
    this.x = Math.sin(2 * this.x) * denom
    this.y = Math.sinh(2 * this.y) * denom
    return this
  }

  // 双曲関数。
  sinh() {
    var A = this.clone().exp()
    var B = this.clone().neg().exp()
    this.x = (A.x - B.x) * 0.5
    this.y = (A.y - B.y) * 0.5
    return this
  }

  cosh() {
    var A = this.clone().exp()
    var B = this.clone().neg().exp()
    this.x = (A.x + B.x) * 0.5
    this.y = (A.y + B.y) * 0.5
    return this
  }

  tanh() {
    var A = this.clone().exp()
    var B = this.clone().neg().exp()
    var Ax = (A.x - B.x) * 0.5
    var Ay = (A.y - B.y) * 0.5
    var Bx = (A.x + B.x) * 0.5
    var By = (A.y + B.y) * 0.5
    var denom = 1 / (Bx * Bx + By * By)
    this.x = (Ax * Bx + Ay * By) * denom
    this.y = (Ay * Bx - Ax * By) * denom
    return this
  }
}
