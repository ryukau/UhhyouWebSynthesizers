class Wave1D {
  constructor(nNode, a, c, dt, dx) {
    this.wave = [];
    for (let i = 0; i < 3; ++i) this.wave.push(new Array(nNode).fill(0));
    this.setParameter(a, c, dt, dx);
  }

  getDisplacement() { return this.wave[0]; }

  pick(x, displacement) {
    this.wave[0][x] = displacement + 0.995 * (this.wave[0][x] - displacement);
  }

  // `a` is damping factor.
  // `c` is wave speed in [m/s].
  // `dt` is interval of time step in [s].
  // `dx` is distance between node in [m].
  setParameter(a, c, dt, dx) {
    this.a = a;
    this.c = c;
    this.dt = dt;
    this.dx = dx;

    this.C0 = (this.c * this.dt / this.dx) ** 2;
    this.C1 = 2 * (1 - this.C0);
  }

  step() {
    this.wave.unshift(this.wave.pop());
    for (let x = 1; x < this.wave[0].length - 1; ++x) {
      // clang-format off
      this.wave[0][x] = this.a * (
        + this.C0 * (this.wave[1][x + 1] + this.wave[1][x - 1])
        + this.C1 * this.wave[1][x]
        - this.wave[2][x]
      );
      // clang-format on
    }
  }
}

class Wave1DDampedForwardFD extends Wave1D {
  // `a` is damping factor.
  // `c` is wave speed in [m/s].
  // `dt` is interval of time step in [s].
  // `dx` is distance between node in [m].
  setParameter(a, c, dt, dx) {
    this.C0 = 1 / (dt * dt);
    this.C1 = 1 / (this.C0 + a / dt);
    this.C2 = c * c / (dx * dx);
    this.C3 = 2 * this.C0 + a / dt - 2 * this.C2;
  }

  step() {
    this.wave.unshift(this.wave.pop());
    for (let x = 1; x < this.wave[0].length - 1; ++x) {
      // clang-format off
      this.wave[0][x] = this.C1 * (
        + this.C2 * (this.wave[1][x - 1] + this.wave[1][x + 1])
        + this.C3 * this.wave[1][x]
        - this.C0 * this.wave[2][x]
      );
      // clang-format on
    }
  }
}

class Wave1DDampedCentralFD extends Wave1D {
  // `a` is damping factor.
  // `c` is wave speed in [m/s].
  // `dt` is interval of time step in [s].
  // `dx` is distance between node in [m].
  setParameter(a, c, dt, dx) {
    this.C0 = 1 / (dt * dt);
    this.C1 = a / dt / 2;
    this.C2 = c * c / (dx * dx);
    this.C3 = 1 / (this.C0 + this.C1);
    this.C4 = 2 * (this.C0 - this.C2);
    this.C5 = this.C0 - this.C1;
  }

  step() {
    this.wave.unshift(this.wave.pop());
    for (let x = 1; x < this.wave[0].length - 1; ++x) {
      // clang-format off
      this.wave[0][x] = this.C3 * (
        + this.C2 * (this.wave[1][x - 1] + this.wave[1][x + 1])
        + this.C4 * this.wave[1][x]
        - this.C5 * this.wave[2][x]
      );
      // clang-format on
    }
  }
}

class CollidingWave1DWallWire {
  constructor(nNode, a, c, dt, dx, distance = 0) {
    this.wire = new Wave1DDampedCentralFD(nNode, a, c, dt, dx);
    this.distance = distance;
  }

  getDisplacement() { return this.wire.getDisplacement(); }

  pick(x, displacement) {
    this.wire.pick(x, displacement > this.distance ? this.distance : displacement);
  }

  step() {
    this.wire.step();

    const last = this.wire.wave[0].length - 1;
    for (let x = 1; x < last; ++x) {
      if (this.distance < this.wire.wave[0][x]) {
        this.wire.wave[0][x]
          = this.distance - 0.8 * (this.wire.wave[0][x] - this.distance);
      }
    }
  }
}

class CollidingWave1DWireWire {
  constructor(nNode, a, c, dt, dx, distance = 0) {
    this.w0 = new Wave1DDampedCentralFD(nNode, a, c, dt, dx);
    this.w1 = new Wave1DDampedCentralFD(nNode, a, c, dt, dx);

    this.distance = 32;
    this.restitution = 0.98;
    this.mass0 = 1;
    this.mass1 = 1;
  }

  getDisplacement(index) {
    if (index === 0) return this.w0.getDisplacement();
    return this.w1.getDisplacement();
  }

  pick(x, displacement) { this.w1.pick(x, displacement); }

  step() {
    this.w0.step();
    this.w1.step();

    const last = this.w0.wave[0].length - 1;
    for (let x = 1; x < last; ++x) {
      if (this.w1.wave[0][x] - this.distance > this.w0.wave[0][x]) {
        const mid = 0.5 * (this.w0.wave[1][x] + this.w1.wave[1][x]);
        this.w0.wave[0][x] = mid + 0.99 * (this.w0.wave[1][x] - mid);
        this.w1.wave[0][x] = mid + 0.9 * (this.w1.wave[1][x] - mid);
      }
    }
  }
}

class Canvas {
  #isMouseLeftDown = false;
  #isMouseRightDown = false;
  #testbox = {rotation: 0};
  #camera;
  #pickPos = null;

  constructor() {
    this.canvas = document.createElement("canvas");
    this.canvas.width = 512;
    this.canvas.height = 512;
    this.canvas.tabIndex = 0;
    this.canvas.addEventListener("pointerdown", (e) => this.onPointerDown(e), false);
    this.canvas.addEventListener("pointerup", (e) => this.onPointerUp(e), false);
    this.canvas.addEventListener("pointermove", (e) => this.onPointerMove(e), false);
    // this.canvas.addEventListener("pointerenter", (e) => this.onPointerEnter(e), false);
    this.canvas.addEventListener("pointerleave", (e) => this.onPointerLeave(e), false);
    this.canvas.addEventListener("wheel", (e) => this.onWheel(e), false);
    this.canvas.addEventListener("keydown", (e) => this.onKeyDown(e), false);
    this.canvas.addEventListener("contextmenu", (e) => {
      e.preventDefault(); // Prevent browser context menu on right click.
    }, false);
    document.body.appendChild(this.canvas);
    this.ctx = this.canvas.getContext("2d");

    this.resetCamera();

    this.wave = new CollidingWave1DWireWire(
      this.canvas.width,
      0.01,
      10,
      1 / 48000,
      0.3 / this.canvas.width,
      0.0001,
    );
  }

  resetCamera() {
    this.#camera = {
      // x : this.canvas.width / 2,
      // y : this.canvas.height / 2,
      x: 0,
      y: this.canvas.height / 2,
      zoom: 0,
    };
  }

  #getWorldPosition(event) {
    const point = event.type.includes("touch") ? event.touches[0] : event;
    const rect = event.target.getBoundingClientRect();
    const mouseX = Math.floor(point.clientX - rect.left);
    const mouseY = Math.floor(point.clientY - rect.top);
    const scale = 0.5 ** this.#camera.zoom;
    return {x: scale * (mouseX - this.#camera.x), y: scale * (this.#camera.y - mouseY)};
  }

  #pickWave(event) {
    const pos = this.#getWorldPosition(event);
    this.wave.pick(Math.floor(pos.x), -0.1 * pos.y);
  }

  #releaseMouse() {
    this.#isMouseLeftDown = false;
    this.#isMouseRightDown = false;
    this.#pickPos = null;
    this.draw();
  }

  onPointerDown(event) {
    this.canvas.focus();
    if (event.button === 0) {
      this.#isMouseLeftDown = true;
      this.#pickPos = this.#getWorldPosition(event);
    } else if (event.button === 2) {
      this.#isMouseRightDown = true;
    }
    this.draw();
  }

  onPointerUp(event) { this.#releaseMouse(); }

  onPointerMove(event) {
    if (this.#isMouseLeftDown) {
      this.#pickPos = this.#getWorldPosition(event);
    }
    if (this.#isMouseRightDown) {
      this.#camera.x += event.movementX;
      this.#camera.y += event.movementY;
    }
    this.draw();
  }

  onPointerLeave(event) { this.#releaseMouse(); }

  onWheel(event) {
    const zoomAmount = 0.25;
    if (event.deltaY > 0) {
      this.#camera.zoom -= zoomAmount;
    } else if (event.deltaY < 0) {
      this.#camera.zoom += zoomAmount;
    }
    this.draw();
  }

  onKeyDown(event) {
    if (event.key === " ") {
      pause = !pause;
      animate();
    } else if (event.key === "f") {
      this.animate(1000 / 60);
    } else if (event.key === "r") {
      this.resetCamera();
    }
  }

  animate(deltaMilliSec) {
    this.#testbox.rotation += deltaMilliSec / 1000;
    this.#testbox.rotation -= Math.floor(this.#testbox.rotation);

    for (let i = 0; i < 16; ++i) {
      if (this.#pickPos !== null) {
        this.wave.pick(Math.floor(this.#pickPos.x), -this.#pickPos.y);
      }
      this.wave.step();
    }

    this.draw();
  }

  draw() {
    const width = this.canvas.width;
    const height = this.canvas.height;

    this.ctx.resetTransform();

    // Background.
    this.ctx.fillStyle = "#ffffff";
    this.ctx.fillRect(0, 0, width, height);

    // Camera.
    this.ctx.translate(this.#camera.x, this.#camera.y);
    const cameraScale = 2 ** this.#camera.zoom;
    this.ctx.scale(cameraScale, cameraScale);

    // // Test box.
    // this.ctx.fillStyle = "#303030";
    // this.ctx.save();
    // this.ctx.rotate(2 * Math.PI * this.#testbox.rotation);
    // this.ctx.fillRect(-16, -16, 32, 32);
    // this.ctx.restore();

    // Wave.
    const wd = this.wave.getDisplacement();
    this.ctx.lineWidth = 2;
    this.ctx.strokeStyle = "#b0b0b0";
    this.ctx.beginPath();
    this.ctx.moveTo(0, wd[0]);
    for (let x = 1; x < wd.length; ++x) this.ctx.lineTo(x, wd[x]);
    this.ctx.stroke();

    const wd0 = this.wave.getDisplacement(0);
    this.ctx.lineWidth = 2;
    this.ctx.strokeStyle = "#606060";
    this.ctx.beginPath();
    this.ctx.moveTo(0, wd0[0] + this.wave.distance);
    for (let x = 1; x < wd0.length; ++x) this.ctx.lineTo(x, wd0[x] + this.wave.distance);
    this.ctx.stroke();

    // Info text.
    this.ctx.resetTransform();
    this.ctx.fillStyle = "#000000";
    this.ctx.fillText(
      `x:${this.#camera.x}, y:${this.#camera.y}, scale:${cameraScale.toFixed(3)}`, 0, 16);
    if (pause) this.ctx.fillText("Pause", 0, 32);
  }
}

function animate(timestamp) {
  if (!pause) requestAnimationFrame(animate);

  if (timestamp === undefined) return;

  if (prevTime === null) prevTime = timestamp;
  const deltaTime = timestamp - prevTime;
  prevTime = timestamp;

  canvas.animate(deltaTime);
}

let pause = false;
let prevTime = null;

const canvas = new Canvas();
animate();
