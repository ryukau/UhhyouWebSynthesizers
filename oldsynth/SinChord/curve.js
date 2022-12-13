//
// Curve
//
// エンベロープ用のカーブ
//
// var bspline = new BSpline(width, height)
// var bSplineCurve = new BSplineCurve(CURVE_RESOLUTION, CURVE_RESOLUTION)
// var aCurve = bSplineCurve.Attack
// var dCurve = bSplineCurve.Decay
//

class BSplineCurve {
  constructor(width, height) {
    this.resolution = 1000
    this.bspline = new BSpline(width, height)
    this.attackCurve = this.makeCurve(width, height)
    this.decayCurve = this.flip(this.attackCurve)
  }

  get Attack() {
    return this.attackCurve
  }

  get Decay() {
    return this.decayCurve
  }

  flip(curve) {
    var dest = new Array(curve.length)
    for (var i = 0; i < dest.length; ++i) {
      dest[i] = curve[i].slice()
      dest[i].reverse()
    }

    dest.reverse()
    return dest
  }

  // 曲線を canvas に描画して読み取ることで無理やりサンプリングする関数。
  // 返り値は width * width の大きさの Array。
  makeCurve(width, height) {
    // 曲線を描画する canvas。
    var canvasBack = document.createElement("canvas")
    canvasBack.width = width
    canvasBack.height = height
    canvasBack.style.display = "none"
    var ctxBack = canvasBack.getContext("2d")
    ctxBack.fillStyle = "#888888"

    this.bspline.MidPoint = [width, 0]
    var curve = []
    for (var i = 0; i < width; ++i) {
      curve[i] = new Float32Array(width)

      // canvas に描画。
      ctxBack.clearRect(0, 0, width, height)
      ctxBack.beginPath()
      var first = [0, 0]
      ctxBack.moveTo(first[0], first[1])
      for (var t = 0; t < this.resolution; ++t) {
        var p = this.bspline.getDrawPoint(t / this.resolution)
        ctxBack.lineTo(p[0], p[1])
      }
      ctxBack.lineTo(0, height)
      ctxBack.fill()
      var pixels = ctxBack.getImageData(0, 0, width, height).data

      // 描画したキャンバスから読み取り。
      for (var x = 0; x < width; ++x) {
        curve[i][x] = 1.0
        for (var y = 0; y < height; ++y) {
          if (0 < pixels[(y * width + x) * 4]) {
            curve[i][x] = y / height
            break
          }
        }
      }

      // テンションを上げる。
      var tension = i / (width - 1)
      this.bspline.MidPoint = [
        this.interp(0, width, tension),
        this.interp(height, 0, tension)
      ]
    }

    return curve
  }

  interp(a, b, r) {
    return a * r + b * (1 - r)
  }
}

class BSpline {
  constructor(width, height) {
    this.points = [
      [0, 0],
      [0, 0],
      [0, height],
      [width, height],
      [width, height]
    ]
    this.KK = 3
    this.kv = []
    this.setKnotVector()
  }

  get FirstPoint() {
    return this.points[0]
  }

  get LastPoint() {
    if (0 < this.points.length) {
      return this.points[this.points.length - 1]
    }
  }

  set MidPoint(point) {
    this.points[Math.floor(this.points.length / 2)] = point
  }

  getDrawPoint(t) {
    var sum = [0, 0]
    for (var i = 0; i < this.points.length; ++i) {
      var temp = this.N(i, this.KK, t)
      sum[0] += temp * this.points[i][0]
      sum[1] += temp * this.points[i][1]
    }
    return sum
  }

  N(i, k, t) {
    if (k == 1) {
      if (this.kv[i] <= t && t < this.kv[i + 1]) {
        return 1
      }
      else {
        return 0
      }
    }
    else {
      var w1 = 0
      var w2 = 0

      if (this.kv[i + k - 1] - this.kv[i] != 0) {
        w1 = ((t - this.kv[i]) / (this.kv[i + k - 1] - this.kv[i])) * this.N(i, k - 1, t)
      }
      if (this.kv[i + k] - this.kv[i + 1] != 0) {
        w2 = ((this.kv[i + k] - t) / (this.kv[i + k] - this.kv[i + 1])) * this.N(i + 1, k - 1, t)
      }
      return (w1 + w2)
    }
  }

  setKnotVector() {
    this.kv.length = 0

    var div = 1 / (this.points.length + 1 - this.KK)

    var i
    for (i = 0; i < this.KK; ++i) {
      this.kv.push(0)
    }
    for (i = this.KK; i < this.points.length + 1; ++i) {
      this.kv.push(this.kv[i - 1] + div)
    }
    for (i = this.points.length + 1; i < this.points.length + this.KK; ++i) {
      this.kv.push(this.kv[i - 1])
    }
  }
}
