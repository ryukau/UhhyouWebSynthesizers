class Canvas {
  constructor(parent, width, height) {
    this.element = document.createElement("canvas")
    this.width = width
    this.height = height
    this.element.width = width
    this.element.height = height
    this.context = this.element.getContext("2d")
    this.imageData = this.context.getImageData(0, 0, width, height)
    this.pixels = this.imageData.data
    parent.appendChild(this.element)

    this.center = this.getCenter()
  }

  get CurrentPixels() {
    this.imageData = this.context.getImageData(0, 0, this.element.width, this.element.height)
    this.pixels = this.imageData.data
    return this.pixels
  }

  set visible(isVisible) {
    if (isVisible) {
      this.element.sytle.display = "inline"
    }
    else {
      this.element.style.display = "none"
    }
  }

  getCenter() {
    return new Vec2(this.element.width / 2, this.element.height / 2)
  }

  preparePath(poly) {
    if (poly.length < 1) {
      return
    }

    this.context.beginPath()
    this.context.moveTo(poly[0].x, poly[0].y)
    for (let i = 1; i < poly.length; ++i) {
      this.context.lineTo(poly[i].x, poly[i].y)
    }
  }

  preparePolygon(poly) {
    this.preparePath(poly)
    this.context.closePath()
  }

  drawPath(poly) { // compat
    this.drawPolygon(poly)
  }

  drawPolygon(poly) {
    this.preparePolygon(poly)
    this.context.fill()
    this.context.stroke()
  }

  drawPoints(points, radius) {
    for (let index = 0; index < points.length; ++index) {
      this.drawPoint(points[index], radius)
    }
  }

  drawNumbers(points) {
    for (let index = 0; index < points.length; ++index) {
      this.context.fillText(index, points[index].x, points[index].y)
    }
  }

  drawText(point, text) {
    // this.context.font = "12px serif"
    this.context.fillText(text, point.x, point.y)
  }

  drawLine(a, b) {
    this.context.beginPath()
    this.context.moveTo(a.x, a.y)
    this.context.lineTo(b.x, b.y)
    this.context.stroke()
  }

  drawPoint(point, radius) {
    this.context.beginPath()
    this.context.arc(point.x, point.y, radius, 0, Math.PI * 2, false)
    this.context.fill()
  }

  drawCircle(point, radius) {
    this.context.beginPath()
    this.context.arc(point.x, point.y, radius, 0, Math.PI * 2, false)
    this.context.fill()
    this.context.stroke()
  }

  clearWhite() {
    this.context.fillStyle = "#ffffff"
    this.context.fillRect(0, 0, this.element.width, this.element.height)
    this.context.fill()
  }

  clear(color) {
    this.context.fillStyle = color
    this.context.fillRect(0, 0, this.element.width, this.element.height)
    this.context.fill()
  }

  resetTransform() {
    this.context.transform(1, 0, 0, 1, 0, 0)
  }

  putPixels() {
    this.context.putImageData(this.imageData, 0, 0)
  }

  setPixel(x, y, color) {
    var index = (y * this.element.width + x) * 4
    this.pixels[index + 0] = color.r
    this.pixels[index + 1] = color.g
    this.pixels[index + 2] = color.b
    this.pixels[index + 3] = color.a
  }

  feedback(alpha, white) {
    for (var y = 0; y < this.element.height; ++y) {
      for (var x = 0; x < this.element.width; ++x) {
        var index = (y * this.element.width + x) * 4
        this.pixels[index + 0] = Math.min(this.pixels[index + 0] * white, 255) // R
        this.pixels[index + 1] = Math.min(this.pixels[index + 1] * white, 255) // G
        this.pixels[index + 2] = Math.min(this.pixels[index + 2] * white, 255) // B
        this.pixels[index + 3] *= alpha // A
      }
    }
    this.context.putImageData(this.imageData, 0, 0)
  }
}

class Timer {
  constructor() {
    this.now = Date.now() * 0.001
    this.delta = 0
    this.zero = this.now
    this.lap = 0
    this.isPause = true
  }

  tick() {
    var now = Date.now() * 0.001
    if (this.isPause) {
      this.isPause = false
      this.delta = 0
    }
    else {
      this.delta = now - this.now
      this.lap += this.delta
    }
    this.now = now
  }

  pause() {
    this.isPause = true
  }
}

class Div {
  constructor(parent, id, className = "") {
    this.element = document.createElement("div")
    this.element.id = id
    if (className.length > 0) {
      this.element.classList.add(className)
    }
    parent.appendChild(this.element)
  }
}

class Heading {
  constructor(parent, level, text) {
    this.element = document.createElement("h" + level)
    this.element.textContent = text
    parent.appendChild(this.element)
  }
}

class Description {
  constructor(parent) {
    this.details = document.createElement("details")
    this.details.id = "description"
    parent.appendChild(this.details)

    this.summary = document.createElement("summary")
    this.summary.textContent = "使い方"
    this.details.appendChild(this.summary)

    this.dl = document.createElement("dl")
    this.details.appendChild(this.dl)
  }

  add(term, description) {
    var dt = document.createElement("dt")
    dt.textContent = term
    this.details.appendChild(dt)

    var dd = document.createElement("dd")
    dd.textContent = description
    this.details.appendChild(dd)
  }
}

class Button {
  constructor(parent, label, onClickFunc) {
    this.element = document.createElement("input")
    this.element.type = "button"
    this.element.value = label
    parent.appendChild(this.element)
    this.element.addEventListener("click", (event) => this.onClick(event), false)
    this.element.addEventListener("keyup", (event) => this.onKeyUp(event), false)
    this.onClickFunc = onClickFunc
  }

  onClick(event) {
    this.onClickFunc(event)
  }

  onKeyUp(event) {
    if (event.keyCode === 32) {
      event.preventDefault()
    }
  }
}

class Checkbox {
  constructor(parent, label, checked, onChangeFunc) {
    this.onChangeFunc = onChangeFunc
    this.value = checked

    this.input = document.createElement("input")
    this.input.type = "checkbox"
    if (checked) {
      this.input.setAttribute("checked", checked)
    }

    this.label = document.createElement("label")
    this.label.className = "checkbox"
    this.label.addEventListener("change", (event) => this.onChange(event), false)
    this.label.innerHTML = this.input.outerHTML + label
    parent.appendChild(this.label)
  }

  get element() {
    return this.label
  }

  onChange(event) {
    this.value = event.target.checked
    this.onChangeFunc(this.value)
  }
}

class RadioButton {
  // nameが""だと正しく動かない。
  constructor(parent, name, onChangeFunc) {
    this.name = name
    this.onChangeFunc = onChangeFunc
    this.buttons = []
    this.value = null

    this.div = document.createElement("div")
    this.div.className = "radioButton"
    parent.appendChild(this.div)

    this.divLabel = document.createElement("div")
    this.divLabel.className = "radioButtonLabel"
    this.divLabel.textContent = name
    this.div.appendChild(this.divLabel)

    this.divButtons = document.createElement("div")
    this.divButtons.className = "radioButtonControls"
    this.div.appendChild(this.divButtons)
  }

  onChange(event) {
    this.value = event.target.value
    this.onChangeFunc(this.value)
  }

  add(label) {
    var input = document.createElement("input")
    input.type = "radio"
    input.name = this.name
    input.value = label
    if (this.buttons.length <= 0) {
      input.setAttribute("checked", true)
      this.value = label
    }
    this.buttons.push(input)

    var labelElement = document.createElement("label")
    labelElement.addEventListener("change", (event) => this.onChange(event), false)
    labelElement.innerHTML = input.outerHTML + label
    this.divButtons.appendChild(labelElement)
  }
}

class NumberInput {
  constructor(
    parent,
    label,
    value,
    min,
    max,
    step,
    onInputFunc,
    logKnob = false
  ) {
    this.defaultValue = value
    this.min = min
    this.max = max
    this.step = step
    this.logKnob = logKnob
    this.onInputFunc = onInputFunc

    this.div = document.createElement("div")
    this.div.className = "numberInput"
    parent.appendChild(this.div)

    this.divLabel = document.createElement("div")
    this.divLabel.className = "numberInputLabel"
    this.divLabel.textContent = label
    this.div.appendChild(this.divLabel)

    this.range = this.addInput("range", 0, 0, 1, 0.001)
    this.range.className = "numberInputRange"
    this.div.appendChild(this.range)

    this.valueRange = Math.abs(this.max - this.min)
    this.maxKnobValue = 6
    this.maxKnobValueExp = 2 ** this.maxKnobValue - 1
    this.setRangeValue(value)

    this.number = this.addInput("number", value, min, max, step)
    this.number.className = "numberInputNumber"
    this.div.appendChild(this.number)

    this.range.addEventListener(
      "change", (event) => this.onInputRange(event), false)
    this.number.addEventListener(
      "change", (event) => this.onInputNumber(event), false)
  }

  setRangeValue(value) {
    this.range.value = this.logKnob
      ? Math.log2(
        this.maxKnobValueExp * (value - this.min) / (this.max - this.min) + 1)
      / this.maxKnobValue
      : (value - this.min) / (this.max - this.min)
  }

  clamp(value) {
    if (isNaN(value)) {
      return this.defaultValue
    }
    return Math.max(this.min, Math.min(value, this.max))
  }

  onInputRange(event) {
    var value = this.clamp(event.target.valueAsNumber)

    this.number.value = this.logKnob
      ? (2 ** (this.range.value * this.maxKnobValue) - 1) * this.valueRange
      / this.maxKnobValueExp + this.min
      : this.range.value * this.valueRange + this.min

    this.onInputFunc(value)
  }

  onInputNumber(event) {
    var value = this.clamp(event.target.valueAsNumber)
    this.setRangeValue(value)
    this.onInputFunc(value)
  }

  get value() {
    return parseFloat(this.number.value)
  }

  set value(value) {
    var value = this.clamp(value)
    this.number.value = value
    this.setRangeValue(value)
    this.onInputFunc(value)
  }

  random() {
    var randomStep = Math.floor(Math.random() * (this.max - this.min) / this.step)
    this.value = randomStep * this.step + this.min
  }

  addInput(type, value, min, max, step) {
    var input = document.createElement("input")
    this.div.appendChild(input)
    input.type = type
    input.min = min
    input.max = max
    input.step = step
    input.value = value
    return input
  }
}

class KnobInput {
  constructor(
    parent,
    label,
    value,
    min,
    max,
    step,
    onInputFunc,
    logKnob = false
  ) {
    this.defaultValue = value
    this.min = min
    this.max = max
    this.step = step
    this.logKnob = logKnob
    this.onInputFunc = onInputFunc

    this.valueRange = Math.abs(this.max - this.min)
    this.maxKnobValue = 6
    this.maxKnobValueExp = 2 ** this.maxKnobValue - 1
    this.setKnobValue(value)

    this.div = document.createElement("div")
    this.div.className = "knobInput"
    parent.appendChild(this.div)

    this.divLabel = document.createElement("div")
    this.divLabel.className = "knobInputLabel"
    this.divLabel.textContent = label
    this.div.appendChild(this.divLabel)

    this.canvas = document.createElement("canvas")
    this.canvas.className = "knobInputCanvas"
    this.context = this.canvas.getContext("2d")
    this.width = 48
    this.height = 48
    this.canvas.width = this.width
    this.canvas.height = this.height
    this.div.appendChild(this.canvas)

    this.center = new Vec2(this.width / 2, this.height / 2)
    this.knobRadius = this.width > this.height ? this.center.y : this.center.x

    this.number = this.addInput("number", value, min, max, step)
    this.number.className = "knobInputNumber"

    this.grabbed = false
    this.canvas.addEventListener(
      "mousedown", (event) => this.onMouseDown(event), false)
    this.canvas.addEventListener(
      "mousemove", (event) => this.onMouseMove(event), false)
    this.canvas.addEventListener(
      "mouseup", (event) => this.onMouseUp(event), false)

    this.number.addEventListener(
      "change", (event) => this.onInput(event), false)

    this.draw()
  }

  setKnobValue(value) {
    this.knobValue = this.logKnob
      ? Math.log2(
        this.maxKnobValueExp * (value - this.min) / (this.max - this.min) + 1)
      / this.maxKnobValue
      : (value - this.min) / (this.max - this.min)
  }

  clamp(value) {
    if (isNaN(value)) {
      return this.defaultValue
    }
    return Math.max(this.min, Math.min(value, this.max))
  }

  onInput(event) {
    this.value = this.clamp(event.target.valueAsNumber)
  }

  get value() {
    return parseFloat(this.number.value)
  }

  set value(value) {
    var value = this.clamp(value)
    this.number.value = value
    this.setKnobValue(value)
    this.draw()
    this.onInputFunc(value)
  }

  random() {
    var randomStep = Math.floor(Math.random() * (this.max - this.min) / this.step)
    this.value = randomStep * this.step + this.min
  }

  addInput(type, value, min, max, step) {
    var input = document.createElement("input")
    this.div.appendChild(input)
    input.type = type
    input.min = min
    input.max = max
    input.step = step
    input.value = value
    return input
  }

  getMousePosition(event) {
    var rect = event.target.getBoundingClientRect()
    return new Vec2(event.clientX - rect.left, event.clientY - rect.top)
  }

  getMouseMove(event) {
    return new Vec2(event.movementX, event.movementY)
  }

  onMouseDown(event) {
    var mousePosition = this.getMousePosition(event)
    this.grabbed = true
    this.canvas.requestPointerLock()
  }

  onMouseMove(event) {
    if (!this.grabbed) {
      return
    }

    var mouseMovement = this.getMouseMove(event)

    this.knobValue -= mouseMovement.y / screen.height
    if (this.knobValue < 0) {
      this.knobValue = 0
    } else if (this.knobValue > 1) {
      this.knobValue = 1
    }

    this.value = this.logKnob
      ? (2 ** (this.knobValue * this.maxKnobValue) - 1) * this.valueRange
      / this.maxKnobValueExp + this.min
      : this.knobValue * this.valueRange + this.min

    this.draw()
  }

  onMouseUp(event) {
    this.grabbed = false
    this.draw()
    document.exitPointerLock()
  }

  draw() {
    // Reset to white background.
    this.context.fillStyle = "#ffffff"
    this.context.fillRect(0, 0, this.width, this.height)

    // Draw knob.
    const knobWidth = 12
    const halfKnobWidth = knobWidth / 2
    const startAngle = Math.PI * 0.7
    const angleRange = Math.PI * 1.6
    const endAngle = startAngle + angleRange * this.knobValue

    // Knob rail.
    this.context.strokeStyle = "#888888"
    this.context.lineWidth = 1
    this.context.lineCap = "butt"
    this.context.beginPath()
    this.context.arc(
      this.center.x,
      this.center.y,
      this.knobRadius - halfKnobWidth,
      startAngle,
      startAngle + angleRange
    )
    this.context.stroke()

    // Knob body.
    this.context.strokeStyle = "#2e9fea"
    this.context.lineWidth = knobWidth
    this.context.beginPath()
    this.context.arc(
      this.center.x,
      this.center.y,
      this.knobRadius - halfKnobWidth,
      startAngle,
      endAngle
    )
    this.context.stroke()

    // Knob head.
    this.context.strokeStyle = "#000000"
    this.context.lineWidth = knobWidth
    this.context.lineCap = "round"
    this.context.beginPath()
    this.context.arc(
      this.center.x,
      this.center.y,
      this.knobRadius - halfKnobWidth,
      endAngle,
      endAngle + Math.PI * 0.01
    )
    this.context.stroke()
  }
}

class NumberCanvasInput {
  constructor(
    parent,
    label,
    value,
    min,
    max,
    fractionDigit,
    fontSize,
    onInputFunc
  ) {
    if (value > max) {
      value = max
    }

    if (value < min) {
      value = min
    }

    this.defaultValue = value
    this._value = value
    this.min = min
    this.max = max
    this.onInputFunc = onInputFunc

    this.integerDigit = Math.floor(Math.log10(Math.abs(max))) + 1
    this.fractionDigit = fractionDigit
    this.stringLength = this.integerDigit + 1 + this.fractionDigit
    this.fontSize = fontSize

    this.div = document.createElement("div")
    this.div.className = "numberCanvasInput"
    parent.appendChild(this.div)

    this.divLabel = document.createElement("div")
    this.divLabel.className = "numberCanvasInputLabel"
    this.divLabel.textContent = label
    this.div.appendChild(this.divLabel)

    this.canvas = document.createElement("canvas")
    this.canvas.className = "numberCanvasInput"
    this.context = this.canvas.getContext("2d")

    this.context.font = `${this.fontSize}px monospace`
    const textMeasure = this.context.measureText("M")
    this.singleLetterWidth = textMeasure.width

    this.width = this.singleLetterWidth * (this.stringLength + 1)
    this.height = fontSize
    this.canvas.width = this.width
    this.canvas.height = this.height
    this.div.appendChild(this.canvas)

    this.grabbedDigit = null
    this.sumMovementY = 0
    this.tempValue = value
    this.canvas.addEventListener(
      "load", (event) => this.onLoad(event), false)
    this.canvas.addEventListener(
      "mousedown", (event) => this.onMouseDown(event), false)
    this.canvas.addEventListener(
      "mousemove", (event) => this.onMouseMove(event), false)
    this.canvas.addEventListener(
      "mouseup", (event) => this.onMouseUp(event), false)

    this.draw()
  }

  getMousePosition(event) {
    var rect = event.target.getBoundingClientRect()
    return new Vec2(event.clientX - rect.left, event.clientY - rect.top)
  }

  getMouseMove(event) {
    return new Vec2(event.movementX, event.movementY)
  }

  onLoad(event) {
    this.grabbedDigit = null
  }

  grabDigit(mousePosition) {
    if (mousePosition.x < this.singleLetterWidth) {
      return null
    }

    var nthDigit = Math.floor(mousePosition.x / this.singleLetterWidth)
    if (nthDigit > this.integerDigit) {
      nthDigit -= 1
    }
    return this.integerDigit - nthDigit
  }

  onMouseDown(event) {
    var mousePosition = this.getMousePosition(event)
    this.grabbedDigit = this.grabDigit(mousePosition)
    if (this.grabbedDigit !== null) {
      this.sumMovementY = 0
      this.tempValue = this.value
      this.canvas.requestPointerLock()
    }
  }

  onMouseMove(event) {
    if (this.grabbedDigit === null) {
      return
    }

    var mouseMovement = this.getMouseMove(event)
    this.sumMovementY += mouseMovement.y
    var step = 16
    this.value = this.tempValue
      - Math.floor(this.sumMovementY / step) * 10 ** this.grabbedDigit

    if (this.value <= this.min || this.value >= this.max) {
      this.sumMovementY = 0
      this.tempValue = this.value
    }

    this.draw()
  }

  onMouseUp(event) {
    this.grabbedDigit = null
    this.draw()
    document.exitPointerLock()
  }

  clamp(value) {
    if (isNaN(value)) {
      return this.defaultValue
    }
    return Math.max(this.min, Math.min(value, this.max))
  }

  get value() {
    return this._value
  }

  set value(value) {
    this._value = this.clamp(value)
    this.draw()
    this.onInputFunc(this.value)
  }

  random() {
    var randomStep = Math.floor(Math.random() * (this.max - this.min) / this.step)
    this._value = randomStep * this.step + this.min
  }

  valueToString() {
    const sign = this._value < 0 ? "-" : "+"
    var value = Math.abs(this._value)
    return sign + value.toFixed(this.fractionDigit).padStart(this.stringLength, "0")
  }

  draw() {
    this.context.fillStyle = "#ffffff"
    this.context.fillRect(0, 0, this.width, this.height)

    const text = this.valueToString()

    // Draw ticks.
    this.context.fillStyle = "#113366"
    for (var n = 1; n < text.length; ++n) {
      var x = n * this.singleLetterWidth
      var h = this.fontSize * 0.4
      this.context.fillRect(x - 0.5, this.height - h, 0.5, h)
    }

    this.context.fillStyle = "#000000"
    this.context.font = `${this.fontSize}px monospace`
    this.context.fillText(text, 0, this.fontSize)
  }
}

class PullDownMenu {
  constructor(parent, label, onChangeFunc) {
    this.onChangeFunc = onChangeFunc
    this.value = null
    this.options = []

    this.div = document.createElement("div")
    this.div.className = "pullDownMenu"
    if (typeof label === 'string' || label instanceof String) {
      this.divLabel = document.createElement("div")
      this.divLabel.className = "numberInputLabel"
      this.divLabel.textContent = label
      this.div.appendChild(this.divLabel)
    }
    this.select = document.createElement("select")
    this.select.className = "pullDownMenuSelect"
    this.div.appendChild(this.select)
    parent.appendChild(this.div)

    this.select.addEventListener("change", (event) => this.onChange(event), false)
  }

  onChange(event) {
    this.value = event.target.value
    this.onChangeFunc(this.value)
  }

  add(label) {
    if (typeof label !== 'string' && !(label instanceof String)) {
      console.log("PullDownMenu.add() failed to invalid type.")
    }
    var option = document.createElement('option')
    option.textContent = label
    if (this.options.length <= 0) {
      this.value = label
    }
    this.options.push(option)
    this.select.appendChild(option)
  }
}
