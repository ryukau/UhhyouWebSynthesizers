// 2次元のベクトル計算。
class Vec2 {
  constructor(x, y) {
    this.x = x
    this.y = y
  }

  set(x, y) {
    this.x = x
    this.y = y
    return this
  }

  copy(v) {
    this.x = v.x
    this.y = v.y
    return this
  }

  clone() {
    return new Vec2(this.x, this.y)
  }

  add(v) {
    this.x += v.x
    this.y += v.y
    return this
  }

  sub(v) {
    this.x -= v.x
    this.y -= v.y
    return this
  }

  mul(r) {
    this.x *= r
    this.y *= r
    return this
  }

  dot(v) {
    return this.x * v.x + this.y * v.y
  }

  cross(v) {
    return this.x * v.y - this.y * v.x
  }

  length() {
    return Math.sqrt(this.x * this.x + this.y * this.y)
  }

  lengthSq() {
    return this.x * this.x + this.y * this.y
  }

  normalize() {
    var length = 1 / Math.sqrt(this.x * this.x + this.y * this.y)
    this.x *= length
    this.y *= length
    return this
  }

  neg() {
    this.x = -this.x
    this.y = -this.y
    return this
  }

  perpendicular() {
    var temp = this.x
    this.x = -this.y
    this.y = temp
    return this
  }

  static add(a, b) {
    return new Vec2(a.x + b.x, a.y + b.y)
  }

  static sub(a, b) {
    return new Vec2(a.x - b.x, a.y - b.y)
  }

  static sub(a, b) {
    return new Vec2(a.x - b.x, a.y - b.y)
  }

  static mul(v, r) {
    return new Vec2(v.x * r, v.y * r)
  }

  static perpendicular(v) {
    return new Vec2(-v.y, v.x)
  }
}
