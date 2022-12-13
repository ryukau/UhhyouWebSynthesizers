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
    this.isMouseDown = false
    this.lastX = 0

    this.set(wave)
    this.element.addEventListener("wheel", this, false)
    this.element.addEventListener("mousedown", this, false)
    this.element.addEventListener("mouseup", this, false)
    this.element.addEventListener("mousemove", this, false)
    this.element.addEventListener("mouseleave", this, false)
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
      case "mousedown":
        this.onMouseDown(event)
        break
      case "mouseup":
        this.onMouseUp(event)
        break
      case "mousemove":
        this.onMouseMove(event)
        break
      case "mouseleave":
        this.onMouseLeave(event)
        break
    }
  }

  onMouseDown(event) {
    this.isMouseDown = true
    var rect = event.target.getBoundingClientRect()
    this.lastX = Math.floor(event.clientX - rect.left)
  }

  onMouseUp(event) {
    this.isMouseDown = false
  }

  onMouseMove(event) {
    if (!this.isMouseDown) return

    var rect = event.target.getBoundingClientRect()
    var x = Math.floor(event.clientX - rect.left)

    var scroll = this.length * (x - this.lastX) / this.width
    this.offset -= (scroll > 0) ? Math.ceil(scroll) : Math.floor(scroll)
    if (this.offset < 0) {
      this.offset = 0
    }
    else if (this.offset + this.length > this.wave.length) {
      this.offset = this.wave.length - this.length
    }
    this.draw()

    this.lastX = x
  }

  onMouseLeave(event) {
    // マウスがcanvasの外に出たらスクロールしない。
    this.isMouseDown = false
  }

  onWheel(event) {
    event.preventDefault() // 画面のスクロールを阻止。
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
    this.context.strokeStyle = "#dddddd"
    this.context.lineWidth = 0.1
    this.context.setLineDash([10, 20])
    this.drawLine({ x: 0, y: y0 }, { x: this.width, y: y0 })
    this.context.setLineDash([0])
  }

  drawWave(y0) {
    this.context.strokeStyle = "#303030"
    this.context.fillStyle = "#303030"
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
    var interval = this.length / this.width
    var limit = this.offset

    var minArray = new Array(this.width)
    var maxArray = new Array(this.width)

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
      if (prevMin !== undefined && prevMin > max) {
        max = prevMin
      }
      if (prevMax !== undefined && prevMax < min) {
        min = prevMax
      }
      minArray[x] = new Vec2(x, this.fixY(min))
      maxArray[x] = new Vec2(x, this.fixY(max))

      var prevMin = min
      var prevMax = max
    }

    var path = minArray.concat(maxArray.reverse())
    this.context.lineWidth = 0.1
    this.drawPolygon(path)
    this.context.stroke()
  }

  drawWaveNarrow() {
    var length = this.length - 1
    if (length < 0) {
      return
    }

    var pointRadius = 3
    var toDrawPoints = (this.width / length) > (3 * pointRadius)

    var path = new Array(length)
    path[0] = new Vec2(0, this.fixY(this.wave[this.offset]))
    for (var i = 1; i <= length; ++i) {
      if (toDrawPoints) {
        this.drawCircle(path[i - 1], pointRadius)
      }
      var index = this.offset + i
      var x = i * this.width / length
      path[i] = new Vec2(x, this.fixY(this.wave[index]))
    }

    this.context.lineWidth = 1
    this.preparePath(path)
    this.context.stroke()
  }
}

class EnvelopeView extends Canvas {
  constructor(parent, width, height, x1, y1, x2, y2, label, refreshFunc) {
    super(parent, width, height)

    this.element.className = "envelopeView"

    this.label = label
    this.refreshFunc = refreshFunc

    this.pointRadius = 8
    this.setControlPoints(x1, y1, x2, y2)
    this.startPoint = new Vec2(0, 0)
    this.endPoint = new Vec2(this.width, this.height)

    this.grabbed = null
    this.element.addEventListener(
      "load", (event) => this.onLoad(event), false)
    this.element.addEventListener(
      "mousedown", (event) => this.onMouseDown(event), false)
    this.element.addEventListener(
      "mousemove", (event) => this.onMouseMove(event), false)
    this.element.addEventListener(
      "mouseup", (event) => this.onMouseUp(event), false)
    this.draw()
  }

  clampX(value) {
    return Math.max(0, Math.min(value, 1))
  }

  get value() {
    return {
      x1: this.clampX(this.points[0].x / this.width),
      y1: this.points[0].y / this.height,
      x2: this.clampX(this.points[1].x / this.width),
      y2: this.points[1].y / this.height,
    }
  }

  setControlPoints(x1, y1, x2, y2) {
    this.points = [
      new Vec2(x1 * this.width, y1 * this.height),
      new Vec2(x2 * this.width, y2 * this.height)
    ]

    // colorを持たせる。
  }

  getMousePosition(event) {
    var rect = event.target.getBoundingClientRect()
    return new Vec2(event.clientX - rect.left, event.clientY - rect.top)
  }

  getMouseMove(event) {
    return new Vec2(event.movementX, event.movementY)
  }

  onLoad(event) {
    this.grabbed = null
  }

  grabPoint(mousePosition) {
    for (var i = 0; i < this.points.length; ++i) {
      var point = this.points[i]
      if (Vec2.sub(point, mousePosition).length() <= this.pointRadius) {
        return point
      }
    }
    return null
  }

  onMouseDown(event) {
    var mousePosition = this.getMousePosition(event)
    this.grabbed = this.grabPoint(mousePosition)
    if (this.grabbed !== null) {
      this.element.requestPointerLock()
    }
  }

  onMouseMove(event) {
    if (this.grabbed === null) {
      return
    }
    this.grabbed.add(this.getMouseMove(event))
    this.grabbed.x = Math.max(0, Math.min(this.grabbed.x, this.width))
    this.grabbed.y = Math.max(0, Math.min(this.grabbed.y, this.height))
    this.draw()
  }

  onMouseUp(event) {
    this.grabbed = null
    this.refresh()
    document.exitPointerLock();
  }

  refresh() {
    this.refreshFunc()
  }

  random() {
    for (var i = 0; i < this.points.length; ++i) {
      this.points[i].x = this.width * Math.random()
      this.points[i].y = this.height * Math.random()
    }
    this.draw()
  }

  draw() {
    this.clearWhite()

    var fontSize = 16
    this.context.fillStyle = "#666666"
    this.context.font = `${fontSize}px serif`
    this.context.fillText(this.label, fontSize, this.height - fontSize)

    this.context.strokeStyle = "#000000"
    this.context.beginPath()
    this.context.moveTo(this.startPoint.x, this.startPoint.y)
    this.context.bezierCurveTo(
      this.points[0].x, this.points[0].y,
      this.points[1].x, this.points[1].y,
      this.endPoint.x, this.endPoint.y
    )
    this.context.stroke()

    this.context.strokeStyle = "#888888"
    this.context.setLineDash([5, 10])
    this.drawLine(this.startPoint, this.points[0])
    this.drawLine(this.endPoint, this.points[1])
    this.context.setLineDash([0])

    // draw control points.
    this.context.fillStyle = "#0066ff"
    this.context.strokeStyle = "#abe2fc"
    for (var i = 0; i < this.points.length; ++i) {
      this.drawPoint(this.points[i], this.pointRadius)
    }
  }
}

class EnvelopeControl {
  constructor(
    parent,
    label,
    width,
    height,
    x1,
    y1,
    x2,
    y2,
    amount,
    bias,
    minBias,
    maxBias,
    stepBias,
    isBiasLogKnob,
    refreshFunc
  ) {
    this.div = new Div(parent, label, "envelopeControl")
    this.envelopeView = new EnvelopeView(this.div.element,
      width, height, x1, y1, x2, y2, label, refreshFunc)

    this.divInput = new Div(this.div.element, label)
    this.inputAmount = new NumberInput(this.divInput.element,
      "Amount", amount, -1, 1, 0.01, refreshFunc, false)
    this.inputBias = new NumberInput(this.divInput.element,
      "Bias", bias, minBias, maxBias, stepBias, refreshFunc, isBiasLogKnob)
  }

  get value() {
    var env = this.envelopeView.value
    return {
      x1: env.x1,
      y1: env.y1,
      x2: env.x2,
      y2: env.y2,
      amount: this.inputAmount.value,
      bias: this.inputBias.value,
      min: this.inputBias.min,
      max: this.inputBias.max,
    }
  }

  random() {
    this.envelopeView.random()
    this.inputAmount.random()
    this.inputBias.random()
  }
}

class OvertoneControl extends Canvas {
  constructor(parent, width, height, numOvertone, onChangeFunc) {
    super(parent, width, height)

    this.element.className = "overtoneControl"
    this.onChangeFunc = onChangeFunc

    numOvertone = Math.floor(Math.max(1, numOvertone))
    this.overtone = new Array(numOvertone).fill(0)
    this.overtone[0] = 1

    this.sliderWidth = width / numOvertone

    this.isMouseDown = false
    this.mouseX = null

    this.element.addEventListener("wheel", this, false)
    this.element.addEventListener("mousedown", this, false)
    this.element.addEventListener("mouseup", this, false)
    this.element.addEventListener("mousemove", this, false)
    this.element.addEventListener("mouseleave", this, false)
    this.element.addEventListener("touchstart", this, false)
    this.element.addEventListener("touchend", this, false)
    this.element.addEventListener("touchmove", this, false)

    this.draw()
  }

  setOvertone(overtone) {
    if (overtone.length !== this.overtone.length) {
      console.log("Overtone length mismatch")
      console.trace()
      return
    }

    var min = Number.MAX_VALUE
    var max = Number.MIN_VALUE
    for (var i = 0; i < overtone.length; ++i) {
      if (overtone[i] < min)
        min = overtone[i]
      else if (overtone[i] > max)
        max = overtone[i]
    }

    var diff = max - min
    for (var i = 0; i < this.overtone.length; ++i) {
      this.overtone[i] = (overtone[i] - min) / diff
    }

    this.draw()
  }

  handleEvent(event) {
    switch (event.type) {
      case "wheel":
        this.onWheel(event)
        break
      case "mousedown":
        this.onMouseDown(event)
        break
      case "mouseup":
        this.onMouseUp(event)
        break
      case "mousemove":
        this.onMouseMove(event)
        break
      case "mouseleave":
        this.onMouseLeave(event)
        break
      case "touchstart":
        this.onMouseDown(event)
        break
      case "touchend":
        this.onMouseUp(event)
        break
      case "touchmove":
        this.onMouseMove(event)
        break
    }
  }

  getMousePosition(event) {
    var point = event.type.includes("touch") ? event.touches[0] : event

    var rect = event.target.getBoundingClientRect()
    var x = Math.floor(point.clientX - rect.left)
    var y = event.ctrlKey ? this.height
      : event.altKey ? 0 : Math.floor(point.clientY - rect.top)
    return new Vec2(x, y)
  }

  onMouseDown(event) {
    this.isMouseDown = true

    this.setValueFromPosition(this.getMousePosition(event))
  }

  onMouseUp(event) {
    this.isMouseDown = false
    this.onChangeFunc()
  }

  onMouseMove(event) {
    var pos = this.getMousePosition(event)
    this.mouseX = pos.x

    if (this.isMouseDown)
      this.setValueFromPosition(pos)
    else
      this.draw()
  }

  onMouseLeave(event) {
    if (this.isMouseDown === true)
      this.onChangeFunc()

    this.isMouseDown = false
    this.mouseX = null
    this.draw()
  }

  onWheel(event) {
    event.preventDefault() // 画面のスクロールを阻止。

    var rect = event.target.getBoundingClientRect()
    var x = Math.floor(event.clientX - rect.left)
    var index = Math.floor(x / this.sliderWidth)

    if (event.ctrlKey) {
      this.setValue(index, this.overtone[index] - 0.001 * event.deltaY)
    }
    else {
      this.setValue(index, this.overtone[index] - 0.003 * event.deltaY)
    }

    this.draw()
    this.onChangeFunc()
  }

  setValue(index, value) {
    if (index < this.overtone.length) {
      this.overtone[index] = Math.max(0, Math.min(value, 1))
    }
  }

  random() {
    for (var i = 0; i < this.overtone.length; ++i) {
      this.overtone[i] = Math.random()
    }
    this.draw()
  }

  sparseRandom() {
    this.overtone[0] = 1

    var chance = Math.pow(1 / this.overtone.length, 0.55)
    for (var i = 1; i < this.overtone.length; ++i) {
      this.overtone[i] = Math.random() < chance ? Math.random() : 0
    }
    this.draw()
  }

  setValueFromPosition(position) {
    var index = Math.floor(position.x / this.sliderWidth)
    var value = 1 - position.y / this.height

    this.setValue(index, value)
    this.draw()
  }

  draw() {
    this.clearWhite()

    var ctx = this.context

    ctx.fillStyle = "#88bbff"
    ctx.strokeStyle = "#333333"
    ctx.lineWidth = 2

    ctx.beginPath()
    for (var i = 0; i < this.overtone.length; ++i) {
      var sliderHeight = this.overtone[i] * this.height
      ctx.rect(
        i * this.sliderWidth,
        this.height - sliderHeight,
        this.sliderWidth,
        sliderHeight
      )
    }
    ctx.fill()
    ctx.stroke()

    ctx.fillStyle = "#000000"
    ctx.font = "8px monospace"
    for (var i = 0; i < this.overtone.length; ++i) {
      ctx.fillText((i + 1), i * this.sliderWidth + 2, this.height - 4)
    }

    if (this.mouseX !== null) {
      var index = Math.floor(this.overtone.length * this.mouseX / this.width)
      if (index >= 0 && index < this.overtone.length) {
        ctx.fillStyle = "#00ff0033"
        ctx.fillRect(index * this.sliderWidth, 0, this.sliderWidth, this.height)
      }
    }
  }
}
