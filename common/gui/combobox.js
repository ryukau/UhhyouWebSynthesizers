export function select(parent, label, id, className, items, defaultValue, onChangeFunc) {
  let select = document.createElement("select");
  select.ariaLabel = label;
  if (id !== undefined) select.id = id;
  if (className !== undefined) select.className = className;
  select.addEventListener("change", (event) => onChangeFunc(event), false);
  parent.appendChild(select);

  for (const item of items) {
    console.assert(typeof item === "string", "item must be string.", new Error());

    let option = document.createElement("option");
    option.textContent = item;
    option.value = item;
    select.appendChild(option);
  }

  select.value = defaultValue;
  console.assert(
    select.selectedIndex >= 0, "defaultValue doesn't exist in provided items",
    new Error());

  return select;
}

export class ComboBoxLine {
  constructor(parent, label, parameter, onChangeFunc) {
    this.param = parameter;
    this.onChangeFunc = onChangeFunc;

    this.div = document.createElement("div");
    this.div.className = "inputLine";
    parent.appendChild(this.div);
    if (typeof label === 'string' || label instanceof String) {
      this.label = document.createElement("label");
      this.label.className = "inputLine";
      this.label.textContent = label;
      this.div.appendChild(this.label);
    }

    this.select = select(
      this.div,
      label,
      undefined,
      "inputLine",
      this.param.scale.items,
      this.param.scale.items[this.param.defaultUi],
      (e) => this.onChange(e),
    );

    this.options = Array.from(this.select.children);
  }

  get value() { return this.select.value; }

  refresh() { this.select.value = this.options[this.param.ui].value; }

  random() {
    const index = Math.floor(Math.random() * this.options.length);
    this.select.value = this.options[index].value;
  }

  onChange(event) {
    this.param.ui = this.param.scale.items.indexOf(event.target.value);
    this.onChangeFunc();
  }
}
