import {clamp} from "../util.js";

export class NumberInput {
  constructor(parent, label, parameter, onInputFunc) {
    this.param = parameter;
    this.onInputFunc = onInputFunc;

    this.div = document.createElement("div");
    this.div.className = "numberInput";
    parent.appendChild(this.div);

    this.divLabel = document.createElement("div");
    this.divLabel.className = "numberInputLabel";
    this.divLabel.textContent = label;
    this.div.appendChild(this.divLabel);

    this.range = document.createElement("input");
    this.range.type = "range";
    this.range.min = this.param.scale.minUi;
    this.range.max = this.param.scale.maxUi;
    this.range.step = this.param.step;
    this.range.value = this.param.defaultUi;
    this.range.className = "numberInputRange";
    this.div.appendChild(this.range);

    this.number = document.createElement("input");
    this.number.type = "number";
    this.number.min = this.param.minDisplay;
    this.number.max = this.param.maxDisplay;
    this.number.step = this.param.step;
    this.number.value = this.param.display;
    this.number.className = "numberInputNumber";
    this.div.appendChild(this.number);

    this.range.addEventListener("input", (event) => this.onInputRange(event), false);
    this.number.addEventListener("change", (event) => this.onInputNumber(event), false);
  }

  addInput(type, isDisplayValue) {
    let input = document.createElement("input");
    this.div.appendChild(input);
    input.type = type;
    input.min = isDisplay ? this.param.minDisplay : this.param.scale.minUi;
    input.max = isDisplay ? this.param.maxDisplay : this.param.scale.maxUi;
    input.step = this.param.step;
    input.value = isDisplay ? this.param.display : this.param.defaultUi;
    return input;
  }

  onInputRange(event) {
    let value = event.target.valueAsNumber;
    if (isNaN(value)) value = this.param.defaultUi;
    value = clamp(value, this.param.scale.minUi, this.param.scale.maxUi);
    this.param.ui = value;
    this.number.value = this.param.display;
    this.onInputFunc(value);
  }

  onInputNumber(event) {
    let value = event.target.valueAsNumber;
    if (isNaN(value)) value = this.param.defaultDisplay;
    value = clamp(value, this.param.minDisplay, this.param.maxDisplay);
    this.param.display = value;
    this.number.value = value;
    this.range.value = this.param.ui;
    this.onInputFunc(value);
  }
}
