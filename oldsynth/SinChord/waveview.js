class WaveView extends Canvas {
  // 1チャンネルのみ表示。
  // this.wave は {mid, min, max, point} の配列。
  // this.offset は波形の表示を開始するサンプルの位置。
  constructor(parent, x, y, wave, autoScale) {
    super(parent, x, y)
    this.offset = 0
    this.length = 0
    this.wave = null
    this.autoScale = autoScale
    this.isUpperHalf = false
    this.lastMousePosition = new Vec2(0, 0)

    this.set(wave)
    this.element.addEventListener("wheel", this, false)
  }

  set(wave) {
    this.offset = 0
    if (typeof wave !== "undefined") {
      this.wave = wave
      this.length = wave.length
    }
    else {
      this.wave = null
      this.length = 0
    }

    if (this.autoScale) {
      this.isUpperHalf = true
      for (var i = 0; i < this.wave.length; ++i) {
        if (this.wave[i] < 0) {
          this.isUpperHalf = false
          break
        }
      }
    }

    this.draw()
  }

  waveAt(index) {
    if (index < 0 || index >= this.wave.length) {
      return 0
    }
    return this.wave[index]
  }

  // イベント。
  handleEvent(event) {
    switch (event.type) {
      case "wheel":
        this.onWheel(event)
        break
    }
  }

  onWheel(event) {
    // console.log(event)
    if (event.ctrlKey || event.altKey) {
      this.scroll(event)
    }
    else {
      this.zoom(event)
    }
  }

  scroll(event) {
    var dx = Math.floor(this.length / 8)
    if (event.deltaY > 0) {
      this.offset += dx
    }
    else {
      this.offset -= dx
    }
    this.clampOffset()
    this.draw()
  }

  zoom(event) {
    var positionX = (event.offsetX < 0) ? 0 : event.offsetX
    var xOffset = Math.max(positionX / this.width, 0)
    var scale = 2
    var previous = this.length
    if (event.deltaY > 0) {
      this.length *= scale
    }
    else {
      this.length /= scale
    }
    this.offset += xOffset * (previous - this.length)
    this.trimLength()
    this.trimOffset()
    this.draw()
  }

  trimLength() {
    this.length = Math.floor(this.length)
    if (this.length > this.wave.length) {
      this.length = this.wave.length
    }
    else if (this.length < 16) {
      this.length = 16
    }
  }

  trimOffset() {
    this.offset = Math.floor(this.offset)
    if (this.offset < 0) {
      this.offset = 0
    }
    else {
      var offset = this.wave.length - (this.length + this.offset)
      this.offset += Math.min(offset, 0)
    }
  }

  clampOffset() {
    var maxOffset = this.wave.length - this.length - 1
    this.offset = Math.max(0, Math.min(this.offset, maxOffset))
  }

  // 描画。
  draw() {
    this.clearWhite()
    var y0 = this.isUpperHalf ? this.height : this.center.y
    this.drawAxes(y0)
    this.drawWave(y0)
  }

  drawAxes(y0) {
    this.context.strokeStyle = "#B4B4DC"
    this.context.lineWidth = 0.3
    this.drawLine({ x: 0, y: y0 }, { x: this.width, y: y0 })
  }

  drawWave(y0) {
    this.context.strokeStyle = "#303030"
    this.context.fillStyle = "#303030"
    this.context.lineWidth = 1
    this.context.lineCap = "round"
    this.context.save()
    this.context.translate(0, y0)
    this.context.scale(1, -1)
    if (this.length >= this.width) {
      this.drawWaveWide()
    }
    else {
      this.drawWaveNarrow()
    }
    this.context.restore()
  }

  fixY(y) {
    return (this.isUpperHalf ? this.height : this.center.y) * y
  }

  drawWaveWide() {
    var yPerDot = 2 / this.height
    var interval = this.length / this.width
    var limit = this.offset
    for (var x = 0; x < this.width; ++x) {
      var min = Number.MAX_VALUE
      var max = -Number.MAX_VALUE

      var index = Math.floor(limit)
      limit += interval
      while (index < limit) {
        min = Math.min(min, this.wave[index])
        max = Math.max(max, this.wave[index])
        ++index
      }
      if (prevMin > max) {
        max = prevMin
      }
      if (prevMax < min) {
        min = prevMax
      }
      var top = new Vec2(x, this.fixY(min))
      var bottom = new Vec2(x, this.fixY(max))
      this.drawLine(top, bottom)

      var prevMin = min
      var prevMax = max
    }
  }

  drawWaveNarrow() {
    var length = this.length - 1

    var pointRadius = 3
    var toDrawPoints = (this.width / length) > (3 * pointRadius)

    var previous = new Vec2(0, this.fixY(this.wave[this.offset]))
    for (var i = 1; i <= length; ++i) {
      if (toDrawPoints) {
        this.drawCircle(previous, pointRadius)
      }
      var index = this.offset + i
      var x = i * this.width / length
      var current = new Vec2(x, this.fixY(this.wave[index]))
      this.drawLine(previous, current)
      previous = current
    }
    this.context.stroke()
  }
}
