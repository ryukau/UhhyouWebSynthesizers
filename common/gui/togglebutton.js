export class ToggleButton {
  constructor(parent, label, id, className, defaultState, onClickFunc) {
    this.className = className === undefined ? "" : className;
    this.onClickFunc = onClickFunc;
    this.nState = 2;

    this.button = document.createElement("input");
    this.button.type = "button";
    this.button.value = label;
    this.button.ariaLabel = label;
    if (id !== undefined) this.button.id = id;
    this.button.addEventListener("click", (event) => this.onClick(event), false);
    parent.appendChild(this.button);

    this.setState(defaultState);
  }

  setState(state) {
    console.assert(
      Number.isInteger(state) && state >= 0,
      "ToggleButton.state must be 0 or positive integer.", new Error());
    this.state = state;
    this.button.className = this.className;
    this.button.classList.add(`toggleState${this.state}`);
  }

  onClick(event) {
    this.setState((this.state + 1) % this.nState);
    this.onClickFunc(this.state);
  }
}
