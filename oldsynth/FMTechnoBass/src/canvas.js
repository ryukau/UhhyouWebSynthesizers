class Canvas {
  constructor(parent, width, height) {
    this.element = document.createElement("canvas");
    this.width = width;
    this.height = height;
    this.element.width = width;
    this.element.height = height;
    this.context = this.element.getContext("2d");
    this.imageData = this.context.getImageData(0, 0, width, height);
    this.pixels = this.imageData.data;
    parent.appendChild(this.element);

    this.center = this.getCenter();
  }

  get CurrentPixels() {
    this.imageData
      = this.context.getImageData(0, 0, this.element.width, this.element.height);
    this.pixels = this.imageData.data;
    return this.pixels;
  }

  set visible(isVisible) {
    if (isVisible) {
      this.element.sytle.display = "inline";
    } else {
      this.element.style.display = "none";
    }
  }

  getCenter() { return new Vec2(this.element.width / 2, this.element.height / 2); }

  preparePath(poly) {
    if (poly.length < 1) {
      return;
    }

    this.context.beginPath();
    this.context.moveTo(poly[0].x, poly[0].y);
    for (let i = 1; i < poly.length; ++i) {
      this.context.lineTo(poly[i].x, poly[i].y);
    }
  }

  preparePolygon(poly) {
    this.preparePath(poly);
    this.context.closePath();
  }

  drawPath(poly) {
    this.preparePath(poly);
    this.context.stroke();
  }

  drawPolygon(poly) {
    this.preparePolygon(poly);
    this.context.fill();
    this.context.stroke();
  }

  drawPoints(points, radius) {
    for (let index = 0; index < points.length; ++index) {
      this.drawPoint(points[index], radius);
    }
  }

  drawNumbers(points) {
    for (let index = 0; index < points.length; ++index) {
      this.context.fillText(index, points[index].x, points[index].y);
    }
  }

  drawText(point, text) {
    // this.context.font = "12px serif"
    this.context.fillText(text, point.x, point.y);
  }

  drawLine(a, b) {
    this.context.beginPath();
    this.context.moveTo(a.x, a.y);
    this.context.lineTo(b.x, b.y);
    this.context.stroke();
  }

  drawPoint(point, radius) {
    this.context.beginPath();
    this.context.arc(point.x, point.y, radius, 0, Math.PI * 2, false);
    this.context.fill();
  }

  drawCircle(point, radius) {
    this.context.beginPath();
    this.context.arc(point.x, point.y, radius, 0, Math.PI * 2, false);
    this.context.fill();
    this.context.stroke();
  }

  clearWhite() {
    this.context.fillStyle = "#ffffff";
    this.context.fillRect(0, 0, this.element.width, this.element.height);
  }

  clear(color) {
    this.context.fillStyle = color;
    this.context.fillRect(0, 0, this.element.width, this.element.height);
  }

  resetTransform() { this.context.transform(1, 0, 0, 1, 0, 0); }

  putPixels() { this.context.putImageData(this.imageData, 0, 0); }

  setPixel(x, y, color) {
    var index = (y * this.element.width + x) * 4;
    this.pixels[index + 0] = color.r;
    this.pixels[index + 1] = color.g;
    this.pixels[index + 2] = color.b;
    this.pixels[index + 3] = color.a;
  }

  feedback(alpha, white) {
    for (var y = 0; y < this.element.height; ++y) {
      for (var x = 0; x < this.element.width; ++x) {
        var index = (y * this.element.width + x) * 4;
        this.pixels[index + 0] = Math.min(this.pixels[index + 0] * white, 255); // R
        this.pixels[index + 1] = Math.min(this.pixels[index + 1] * white, 255); // G
        this.pixels[index + 2] = Math.min(this.pixels[index + 2] * white, 255); // B
        this.pixels[index + 3] *= alpha;                                        // A
      }
    }
    this.context.putImageData(this.imageData, 0, 0);
  }
}

class Timer {
  constructor() {
    this.now = Date.now() * 0.001;
    this.delta = 0;
    this.zero = this.now;
    this.lap = 0;
    this.isPause = true;
  }

  tick() {
    var now = Date.now() * 0.001;
    if (this.isPause) {
      this.isPause = false;
      this.delta = 0;
    } else {
      this.delta = now - this.now;
      this.lap += this.delta;
    }
    this.now = now;
  }

  pause() { this.isPause = true; }
}

class Div {
  constructor(parent, id, className = "") {
    this.element = document.createElement("div");
    this.element.id = id;
    if (className.length > 0) {
      this.element.classList.add(className);
    }
    parent.appendChild(this.element);
  }
}

class Heading {
  constructor(parent, level, text) {
    this.element = document.createElement("h" + level);
    this.element.textContent = text;
    parent.appendChild(this.element);
  }
}

class Description {
  constructor(parent, descriptionArray) {
    this.details = document.createElement("details");
    this.details.id = "description";
    parent.appendChild(this.details);

    this.summary = document.createElement("summary");
    this.summary.textContent = "使い方";
    this.details.appendChild(this.summary);

    this.dl = document.createElement("dl");
    this.details.appendChild(this.dl);

    this.addArray(descriptionArray);
  }

  add(term, description) {
    var dt = document.createElement("dt");
    dt.textContent = term;
    this.details.appendChild(dt);

    var dd = document.createElement("dd");
    dd.textContent = description;
    this.details.appendChild(dd);
  }

  addImage(src, alt) {
    var img = document.createElement("img");
    img.src = src;
    img.alt = alt;
    this.details.appendChild(img);
  }

  addArray(descriptions) {
    // descriptions = [["term0", "description0"], ["term1", "description1"], ...]
    for (var desc of descriptions) {
      this.add(desc[0], desc[1]);
    }
  }
}

class Button {
  constructor(parent, label, onClickFunc) {
    this.element = document.createElement("input");
    this.element.type = "button";
    this.element.value = label;
    parent.appendChild(this.element);
    this.element.addEventListener("click", (event) => this.onClick(event), false);
    this.element.addEventListener("keyup", (event) => this.onKeyUp(event), false);
    this.onClickFunc = onClickFunc;
  }

  onClick(event) { this.onClickFunc(event); }

  onKeyUp(event) {
    if (event.keyCode === 32) {
      event.preventDefault();
    }
  }
}

class Checkbox {
  constructor(parent, label, checked, onChangeFunc) {
    this.onChangeFunc = onChangeFunc;
    this.value = checked;

    this.div = document.createElement("div");
    this.div.className = "checkbox";
    parent.appendChild(this.div);

    this.label = document.createElement("label");
    this.label.className = "checkboxLabel";
    this.label.innerHTML = label;
    this.label.setAttribute("for", label);

    this.input = document.createElement("input");
    this.input.type = "checkbox";
    this.input.addEventListener("change", (event) => this.onChange(event), false);
    this.input.id = label;
    if (checked) {
      this.input.setAttribute("checked", checked);
    }

    this.div.appendChild(this.input);
    this.div.appendChild(this.label);
  }

  get element() { return this.label; }

  check() {
    if (!this.value) this.label.click();
  }

  unCheck() {
    if (this.value) this.label.click();
  }

  toggle() { this.label.click(); }

  random() {
    if (Math.random() < 0.5) this.label.click();
  }

  onChange(event) {
    this.value = event.target.checked;
    this.onChangeFunc(this.value);
  }
}

class RadioButton {
  // nameが""だと正しく動かない。
  constructor(parent, name, onChangeFunc, showLabel = true) {
    this.name = name;
    this.onChangeFunc = onChangeFunc;
    this.buttons = [];
    this.value = null;

    this.div = document.createElement("div");
    this.div.className = "radioButton";
    parent.appendChild(this.div);

    if (showLabel) {
      this.divLabel = document.createElement("div");
      this.divLabel.className = "radioButtonLabel";
      this.divLabel.textContent = name;
      this.div.appendChild(this.divLabel);
    }

    this.divButtons = document.createElement("div");
    this.divButtons.className = "radioButtonControls";
    this.div.appendChild(this.divButtons);
  }

  onChange(event) {
    this.value = event.target.value;
    this.onChangeFunc(this.value);
  }

  add(label) {
    var input = document.createElement("input");
    input.type = "radio";
    input.name = this.name;
    input.value = label;
    if (this.buttons.length <= 0) {
      input.setAttribute("checked", true);
      this.value = label;
    }
    this.buttons.push(input);

    var labelElement = document.createElement("label");
    labelElement.addEventListener("change", (event) => this.onChange(event), false);
    labelElement.innerHTML = input.outerHTML + label;
    this.divButtons.appendChild(labelElement);
  }
}

class NumberInput {
  constructor(parent, label, value, min, max, step, onInputFunc) {
    this.defaultValue = value;
    this.min = min;
    this.max = max;
    this.step = step;
    this.onInputFunc = onInputFunc;

    this.div = document.createElement("div");
    this.div.className = "numberInput";
    parent.appendChild(this.div);

    this.divLabel = document.createElement("div");
    this.divLabel.className = "numberInputLabel";
    this.divLabel.textContent = label;
    this.div.appendChild(this.divLabel);

    this.addRangeInput();
    this.setRangeValue(value);
    this.range.className = "numberInputRange";
    this.div.appendChild(this.range);

    this.number = this.addInput("number", value, min, max, step);
    this.number.className = "numberInputNumber";
    this.div.appendChild(this.number);

    this.range.addEventListener("input", (event) => this.onInputRange(event), false);
    this.number.addEventListener("change", (event) => this.onInputNumber(event), false);
  }

  addRangeInput() {
    this.range = this.addInput("range", this.defaultValue, this.min, this.max, this.step);
    this.setRangeValue(this.defaultValue);
  }

  setRangeValue(value) { this.range.value = value; }

  clamp(value) {
    if (isNaN(value)) {
      return this.defaultValue;
    }
    return Math.max(this.min, Math.min(value, this.max));
  }

  onInputRange(event) {
    this.number.value = this.clamp(event.target.valueAsNumber);
    this.onInputFunc(this.number.value);
  }

  onInputNumber(event) {
    var value = this.clamp(event.target.valueAsNumber);
    this.number.value = value;
    this.setRangeValue(value);
    this.onInputFunc(value);
  }

  get value() { return parseFloat(this.number.value); }

  set value(value) {
    var value = this.clamp(value);
    this.number.value = value;
    this.setRangeValue(value);
    // this.onInputFunc(value)
  }

  random() {
    var randomStep = Math.floor(Math.random() * (this.max - this.min) / this.step);
    this.value = randomStep * this.step + this.min;
  }

  addInput(type, value, min, max, step) {
    var input = document.createElement("input");
    this.div.appendChild(input);
    input.type = type;
    input.min = min;
    input.max = max;
    input.step = step;
    input.value = value;
    return input;
  }
}

class NumberInputLog extends NumberInput {
  addRangeInput() {
    this.valueRange = Math.abs(this.max - this.min);
    this.maxInLog = 6;
    this.maxInLinear = 2 ** this.maxInLog - 1;

    this.range = this.addInput("range", 0, 0, 1, 0.001);
    this.setRangeValue(this.defaultValue);
  }

  setRangeValue(value) {
    this.range.value
      = Math.log2(this.maxInLinear * (value - this.min) / (this.max - this.min) + 1)
      / this.maxInLog;
  }

  onInputRange(event) {
    this.number.value
      = (2 ** (this.range.value * this.maxInLog) - 1) * this.valueRange / this.maxInLinear
      + this.min;
    this.onInputFunc(this.number.value);
  }
}

class PullDownMenu {
  constructor(parent, label, menus, onChangeFunc) {
    this.onChangeFunc = onChangeFunc;
    this.value = null;
    this.index = null;
    this.options = [];

    this.div = document.createElement("div");
    this.div.className = "pullDownMenu";
    if (typeof label === 'string' || label instanceof String) {
      this.divLabel = document.createElement("div");
      this.divLabel.className = "numberInputLabel";
      this.divLabel.textContent = label;
      this.div.appendChild(this.divLabel);
    }
    this.select = document.createElement("select");
    this.div.appendChild(this.select);
    parent.appendChild(this.div);

    this.select.addEventListener("change", (event) => this.onChange(event), false);

    this.addArray(menus);
  }

  setValue(value, triggerOnChange = true) {
    var backup = this.select.value;
    this.select.value = value;
    if (this.select.selectedIndex < 0) {
      this.select.value = backup;
      console.warn("PullDownMenu: Invalid value.");
      return;
    }
    this.refreshValue(this.select, triggerOnChange);
  }

  setIndex(index, triggerOnChange = true) {
    if (index < 0 || index >= this.options.length) {
      console.warn("PullDownMenu: Index out of range.");
      return;
    }
    this.select.value = this.options[index].value;
    this.refreshValue(this.select, triggerOnChange);
  }

  onChange(event) { this.refreshValue(event.target, true); }

  refreshValue(select, triggerOnChange) {
    this.value = select.value;
    this.index = select.selectedIndex;
    if (triggerOnChange) {
      this.onChangeFunc(this.value);
    }
  }

  random() {
    var index = Math.floor(Math.random() * this.options.length);
    this.select.value = this.options[index].value;
    this.refreshValue(this.select, false);
  }

  add(menu) {
    if (typeof menu !== 'string' && !(menu instanceof String)) {
      console.log("PullDownMenu.add() failed to invalid type.");
    }
    var option = document.createElement('option');
    option.textContent = menu;
    option.value = menu;
    if (this.options.length <= 0) {
      this.value = menu;
      this.index = 0;
    }
    this.options.push(option);
    this.select.appendChild(option);
  }

  addArray(menus) {
    // menus = ["foo", "bar", ...]
    for (var i = 0; i < menus.length; ++i) {
      this.add(menus[i]);
    }
  }
}
