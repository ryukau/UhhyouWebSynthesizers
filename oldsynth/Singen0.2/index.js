const TWO_PI = 2 * Math.PI;

class RenderParameters {
  constructor(audioContext, overSampling) {
    this.audioContext = audioContext;
    this.overSampling = overSampling;
  }

  get sampleRate() {
    return this._sampleRate;
  }

  get overSampling() {
    return this._overSampling;
  }

  set overSampling(value) {
    this._overSampling = value;
    this._sampleRate = this._overSampling * this.audioContext.sampleRate;
  }
}

function play(audioContext, wave) {
  if (checkboxQuickSave.value) {
    save(wave);
  }

  var channel = wave.channels;
  var frame = wave.frames;
  var buffer = audioContext.createBuffer(channel, frame, audioContext.sampleRate);

  for (var i = 0; i < wave.channels; ++i) {
    var waveFloat32 = new Float32Array(wave.data[i]);
    buffer.copyToChannel(waveFloat32, i, 0);
  }

  if (this.source !== undefined) {
    this.source.stop();
  }
  this.source = audioContext.createBufferSource();
  this.source.buffer = buffer;
  this.source.connect(audioContext.destination);
  this.source.start();
}

function save(wave) {
  var buffer = Wave.toBuffer(wave, wave.channels);
  var header = Wave.fileHeader(audioContext.sampleRate, wave.channels,
    buffer.length);

  var blob = new Blob([header, buffer], { type: "application/octet-stream" });
  var url = window.URL.createObjectURL(blob);

  var a = document.createElement("a");
  a.style = "display: none";
  a.href = url;
  a.download = document.title + "_" + Date.now() + ".wav";
  document.body.appendChild(a);
  a.click();

  // Firefoxでダウンロードできるようにするための遅延。
  setTimeout(() => {
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  }, 100);
}

// length is time in seconds.
function makeWave(length, sampleRate) {
  var waveLength = Math.floor(sampleRate * length);
  var wave = new Array(waveLength).fill(0);
  for (var t = 0; t < wave.length; ++t) {
    wave[t] += oscillator.oscillate(t);
  }

  // --
  // var clickLength = Math.floor(sampleRate * 0.02)
  // var clickTable = makeClickTable(clickLength, 16, 0.2, 0.4)
  // for (var t = 0; t < clickTable.length; ++t) {
  //   wave[t] *= clickTable[t]
  //   // wave[t] = clickTable[t]
  // }
  // --

  return wave;
}

class TwoPoleLP {
  //
  // Two Poleとして紹介されていた差分方程式の
  // 定数 a1 と a2 に適当な値を入れたフィルタ。
  // y[n] = b0 * x[n] - a1 * y[n-1] - a2 * y[n-2]
  //
  // cutoff の値は [1, 10^8]
  // resonance の値は [0, 0.5]
  //
  constructor(sampleRate) {
    this.sampleRate = sampleRate;
    this.y = new Array(3).fill(0);
    this._cutoff = 1e8;
    this._resonance = 0;

    this.a1 = null;
    this.a2 = null;
    this.refresh();
  }

  cutoff(value) {
    var clamped = Math.max(1, Math.min(value, 1e8));
    this._cutoff = Math.pow(10, clamped * 8);
    this.refresh();
  }

  resonance(value) {
    var clamped = 1 - Math.max(0, Math.min(value, 1));
    this._resonance = 0.5 * (1 - clamped * clamped * clamped);
    this.refresh();
  }

  refresh() {
    this.a1 = 100 * this.sampleRate * this._cutoff;
    this.a2 = -this._resonance * this.a1;
  }

  clear() {
    this.y.fill(0);
  }

  pass(input) {
    var numer = (input + this.a1 * this.y[1] + this.a2 * this.y[2]);
    var denom = 1 + this.a1 + this.a2;
    var output = numer / denom;

    this.y.unshift(output);
    this.y.pop();

    return output;
  }
}

class Delay {
  constructor(renderParameters) {
    this.renderParameters = renderParameters;
    this.buffer = [];
    this.index = 0;
    this._feedback = 0.5;
  }

  // value is time in seconds.
  set length(value) {
    var length = Math.floor(value * this.renderParameters.sampleRate / 1000);
    length = (length < 1) ? 1 : length;
    this.buffer = new Array(length).fill(0);
  }

  set feedback(value) {
    this._feedback = Math.max(-0.99, Math.min(value, 0.99));
  }

  refresh() {
    this.buffer.fill(0);
    this.index = 0;
  }

  pass(input) {
    var output = input + this.buffer[this.index] * this._feedback;
    this.buffer[this.index] = output;
    this.index = (this.index + 1) % this.buffer.length;
    return output;
  }
}

class Oscillator {
  // Require TWO_PI = 2 * Math.PI.
  constructor(renderParameters) {
    this.renderParameters = renderParameters;

    this._seed = 0;
    this.rnd = new Rnd(this._seed);

    this.gain = 1;
    this.gainEnvelope = new Envelope(0.5, 0.5, 0.5, 0.5);
    this.pitchEnvelope = new Envelope(0.5, 0.5, 0.5, 0.5);
    this._pitchStart = 200;
    this._pitchEnd = 30;
    this._duration = 1;
    this.length = 0.2;
    this._fmIndex = 16 / this.renderParameters.overSampling;
    this.modulationType = "PhaseShift";

    this.phase = 0;

    this.overtonePhaseTable = [0];
    this.overtoneDetuneTable = [0];

    this.overtoneBase = 32;
    this._overtoneNum = 0;
    this.overtoneDetune = 10;
    this.overtoneAttenuation = 0.9;

    this.twoPiRate = TWO_PI / this.renderParameters.sampleRate;
    this.pitchDiff = this._pitchStart - this._pitchEnd;
    this.pitchEndFixed = this._pitchEnd - 1;
  }

  set duration(value) {
    this._duration = value;
    this._sampleLength = (value < 0) ? 0 : Math.floor(
      this._duration * this.renderParameters.sampleRate * this._timeLength);
  }

  get length() {
    return this._timeLength;
  }

  set length(value) {
    this._timeLength = value;
    this._sampleLength = (value < 0) ? 0
      : Math.floor(this._duration * this.renderParameters.sampleRate * value);
  }

  set fmIndex(index) {
    this._fmIndex = index / this.renderParameters.overSampling;
  }

  get pitchStart() {
    return Math.log2(this._pitchStart / 440) * 1200;
  }

  set pitchStart(cent) {
    this._pitchStart = this.centToFrequency(cent);
    this.pitchDiff = this._pitchStart - this._pitchEnd;
  }

  get pitchEnd() {
    return this.frequencyToCent(this._pitchEnd);
  }

  set pitchEnd(cent) {
    this._pitchEnd = this.centToFrequency(cent);
    this.pitchDiff = this._pitchStart - this._pitchEnd;
    this.pitchEndFixed = this._pitchEnd - 1;
  }

  set overtoneNum(value) {
    this._overtoneNum = value;
    this.makeOvertoenTable();
  }

  set seed(value) {
    this._seed = value;
    this.makeOvertoenTable();
  }

  set modulationType(type) {
    switch (type) {
      case "FM":
        this.modulationFunc = (modulation, gain, pitch) => {
          var mod = this._fmIndex * modulation;
          var output = gain * this.oscillateFunc(this.phase + mod);
          this.phase += this.twoPiRate * (pitch + this.pitchEndFixed);
          return output;
        };
        break;
      case "AM":
        this.modulationFunc = (modulation, gain, pitch) => {
          var output = gain * this.oscillateFunc(this.phase)
            * (1 - Math.abs(modulation));
          this.phase += this.twoPiRate * (pitch + this.pitchEndFixed);
          return output;
        };
        break;
      case "PhaseShift":
      default:
        this.modulationFunc = (modulation, gain, pitch) => {
          var output = gain * this.oscillateFunc(this.phase);
          var mod = this._fmIndex * modulation * output;
          this.phase += this.twoPiRate * (pitch + this.pitchEndFixed) + mod;
          return output;
        };
        break;
    }
  }

  makeOvertoenTable() {
    this.rnd.seed(this._seed);

    this.overtoneDetuneTable = [0];
    this.overtonePhaseTable = [0];
    for (var i = 1; i <= this._overtoneNum; ++i) {
      var cent = (0.5 - this.rnd.random()) * 2 * this.overtoneDetune;
      var ratio = Math.pow(i + 1, 1 + cent / 1200) - 1;
      this.overtoneDetuneTable.push(ratio / this.overtoneBase);
      this.overtonePhaseTable.push(this.rnd.random() * TWO_PI);
    }
  }

  oscillateFunc(phase) {
    var signal = 0;
    var attenuation = 1;
    var mulAttenu = 1 - this.overtoneAttenuation;
    for (var i = 0; i <= this._overtoneNum; ++i) {
      signal += attenuation * Math.sin(
        this.overtonePhaseTable[i] + phase * (1 + this.overtoneDetuneTable[i]));
      attenuation *= mulAttenu;
    }
    return signal;
  }

  // Pitch is represented by cents with center frequency at 440Hz.
  frequencyToCent(frequency) {
    return Math.log2(frequency / 440) * 1200;
  }

  centToFrequency(cent) {
    return 440 * Math.pow(2, cent / 1200);
  }

  refresh(phase) {
    this.twoPiRate = TWO_PI / this.renderParameters.sampleRate;
    this.phase = phase;
  }

  // time is number of audio samples.
  oscillate(time, modulation) {
    if (time > this._sampleLength || time < 0) {
      return 0;
    }
    var envTime = time / this._sampleLength;
    var gain = this.gain * this.gainEnvelope.decay(envTime);
    var pitchEnv = this.pitchEnvelope.decay(envTime);
    var pitch = this.pow(this.pitchDiff, pitchEnv);

    var output = this.modulationFunc(modulation, gain, pitch);

    return output;
  }

  // 虚数になる場合でも値を返す。
  pow(base, exponent) {
    if (base === 0) {
      return (exponent === 1) ? 1 : 0;
    }
    return Math.sign(base) * Math.pow(Math.abs(base), exponent);
  }
}

class OscillatorControl {
  constructor(parent, renderParameters, id, refreshFunc) {
    this.div = new Div(divMain.element, "OscillatorControl");
    this.div.element.className = "synthControls";

    this.oscillator = new Oscillator(renderParameters);

    this.headingOscillatorControls = new Heading(this.div.element, 6,
      "Oscillator" + id);
    this.gainTension = new EnvelopeView(this.div.element,
      256, 128, 0.2, 0.2, 0.8, 0.8, "gain", refresh);
    this.pitchTension = new EnvelopeView(this.div.element,
      256, 128, 0.2, 0.2, 0.8, 0.8, "pitch", refresh);
    this.duration = new NumberInput(this.div.element, "Duration",
      1, 0, 1, 0.01, refresh);
    this.gain = new NumberInput(this.div.element, "Gain",
      0.5, 0, 1, 0.01, refresh);
    this.pitchStart = new NumberInput(this.div.element, "PitchStart",
      0, -6000, 6000, 1, refresh);
    this.pitchEnd = new NumberInput(this.div.element, "PitchEnd",
      0, -6000, 6000, 1, refresh);
    this.phase = new NumberInput(this.div.element, "Phase",
      0, 0, 1, 0.01, refresh);

    // Overtone parameters.
    this.overtoneBase = new NumberInput(this.div.element, "OT.Base",
      32, 1, 128, 1, refresh);
    this.overtoneNum = new NumberInput(this.div.element, "OT.Num",
      0, 0, 16, 1, refresh);
    this.overtoneDetune = new NumberInput(this.div.element, "OT.Detune",
      10, 0, 1200, 1, refresh);
    this.overtoneAttenuation = new NumberInput(this.div.element, "OT.Attenuation",
      0.9, 0, 1, 0.001, refresh);
    this.seed = new NumberInput(this.div.element, "Seed",
      0, 0, 4294967296, 1, refresh);
  }

  show() {
    this.div.element.style.display = "";
  }

  hide() {
    this.div.element.style.display = "none";
  }

  refresh() {
    this.gainTension.draw();
    var { x1, y1, x2, y2 } = this.gainTension.value;
    this.oscillator.gainEnvelope.set(x1, y1, x2, y2);

    this.pitchTension.draw();
    var { x1, y1, x2, y2 } = this.pitchTension.value;
    this.oscillator.pitchEnvelope.set(x1, y1, x2, y2);

    this.oscillator.duration = this.duration.value;
    this.oscillator.gain = this.gain.value;
    this.oscillator.pitchStart = this.pitchStart.value;
    this.oscillator.pitchEnd = this.pitchEnd.value;
    // this.oscillator.gainEnvelope.tension = this.gainTension.value

    this.oscillator.overtoneBase = this.overtoneBase.value;
    this.oscillator.overtoneNum = this.overtoneNum.value;
    this.oscillator.overtoneDetune = this.overtoneDetune.value;
    this.oscillator.overtoneAttenuation = this.overtoneAttenuation.value;
    this.oscillator.seed = this.seed.value;

    this.oscillator.refresh(this.phase.value * TWO_PI);
  }

  random() {
    this.duration.random();
    this.gain.random();

    this.gainTension.random();
    this.pitchTension.random();
    this.pitchStart.random();
    this.pitchEnd.random();

    this.overtoneBase.random();
    this.overtoneNum.random();
    this.overtoneDetune.random();
    this.overtoneAttenuation.random();
    this.seed.random();
  }
}

class OscillatorGroup {
  constructor(parent, renderParameters, refreshFunc) {
    this.renderParameters = renderParameters;
    this.refreshFunc = refreshFunc;

    this.div = new Div(parent, "OscillatorGroup");
    this.radioButtonSelector = new RadioButton(this.div.element, "Oscillator",
      (index) => { this.toggle(index); });
    this.controls = [];
    for (var i = 0; i < 3; ++i) {
      this.push();
    }
    this.toggle(0);
  }

  push() {
    var index = this.controls.length;
    // this.buttonSelectOscillator = new Button(this.div.element,
    //   "Osc" + index, () => this.toggle(index))
    this.radioButtonSelector.add(index);
    this.controls.push(
      new OscillatorControl(this.div.element, this.renderParameters,
        index, this.refreshFunc));
  }

  pop() {
    var child = this.controls.pop().div.element;
    this.div.element.removeChild(child);
  }

  toggle(index) {
    for (let control of this.controls) {
      control.hide();
    }
    this.controls[index].show();
  }

  set length(length) {
    for (let control of this.controls) {
      control.oscillator.length = length;
    }
  }

  set fmIndex(index) {
    for (let control of this.controls) {
      control.oscillator.fmIndex = index;
    }
  }

  set modulationType(type) {
    for (let control of this.controls) {
      control.oscillator.modulationType = type;
    }
  }

  refresh() {
    for (var i = 0; i < this.controls.length; ++i) {
      this.controls[i].refresh();
    }
  }

  randomValue(min, max) {
    return (max - min) * Math.random() + min;
  }

  random() {
    for (var i = 0; i < this.controls.length; ++i) {
      this.controls[i].random();
    }
    this.controls[0].duration.value = 1;
    this.controls[0].gain.value = 1;
  }

  randomFullDuration() {
    for (var i = 0; i < this.controls.length; ++i) {
      this.controls[i].random();
      this.controls[i].duration.value = 1;
    }
    this.controls[0].gain.value = 1;
  }

  randomBassdrum() {
    var o0 = this.controls[0];
    o0.gainTension.random();
    o0.pitchTension.random();
    o0.duration.value = 1;
    o0.gain.value = 1;
    o0.pitchStart.value = this.randomValue(-2400, 1200);
    o0.pitchEnd.value = this.randomValue(-6000, -2400);
    o0.overtoneNum.value = 0;

    var o1 = this.controls[1];
    o1.gainTension.random();
    o1.pitchTension.random();
    o1.duration.value = this.randomValue(0, 0.035);
    o1.gain.random();
    o1.pitchStart.value = this.randomValue(1200, 4800);
    o1.pitchEnd.value = o1.pitchStart.value - this.randomValue(0, 1700);
    o1.overtoneNum.value = 0;

    // Mute the rest of oscillators.
    for (var i = 2; i < this.controls.length; ++i) {
      this.controls[i].gain.value = 0;
    }
  }

  randomBassdrumOvertone() {
    var o0 = this.controls[0];
    o0.gainTension.random();
    o0.pitchTension.random();
    o0.duration.value = 1;
    o0.gain.value = 1;
    o0.pitchStart.value = this.randomValue(-2400, 1200);
    o0.pitchEnd.value = this.randomValue(-6000, -2400);
    var otbase = Math.random();
    o0.overtoneBase.value = Math.floor(
      1 + otbase * otbase * otbase * this.randomValue(0, 127));
    o0.overtoneNum.random();
    o0.overtoneDetune.value = this.randomValue(0, 1200);
    o0.overtoneAttenuation.value = this.randomValue(0.25, 0.9);
    o0.seed.random();

    var o1 = this.controls[1];
    o1.gainTension.random();
    o1.pitchTension.random();
    o1.duration.value = this.randomValue(0, 0.035);
    o1.gain.random();
    o1.pitchStart.value = this.randomValue(1200, 4800);
    o1.pitchEnd.value = o1.pitchStart.value - this.randomValue(0, 1700);
    o1.overtoneBase.random();
    o1.overtoneNum.random();
    o1.overtoneDetune.random();
    o1.overtoneAttenuation.random();
    o1.seed.random();

    // Mute the rest of oscillators.
    for (var i = 2; i < this.controls.length; ++i) {
      this.controls[i].gain.value = 0;
    }
  }

  randomTomA() {
    var o0 = this.controls[0];
    o0.gainTension.random();
    o0.pitchTension.random();
    o0.duration.value = 1;
    o0.gain.value = 1;
    o0.pitchStart.value = this.randomValue(-1200, 1200);
    o0.pitchEnd.value = this.randomValue(-6000, -3600);
    o0.overtoneBase.value = this.randomValue(64, 128);
    o0.overtoneNum.random();
    o0.overtoneDetune.value = 0;
    o0.overtoneAttenuation.random();
    o0.seed.random();

    var o1 = this.controls[1];
    o1.gainTension.random();
    o1.pitchTension.random();
    o1.duration.value = 1;
    o1.gain.value = this.randomValue(0.01, 0.5);
    o1.pitchStart.value = this.randomValue(0, 6000);
    o1.pitchEnd.value = this.randomValue(1200, 4800);
    o1.overtoneBase.value = 0;
    o1.overtoneNum.value = 0;
    o1.overtoneDetune.value = 0;
    o1.overtoneAttenuation.value = 0;
    o1.seed.value = 0;

    var o2 = this.controls[2];
    o2.gainTension.random();
    o2.pitchTension.random();
    o2.duration.value = 1;
    o2.gain.random();
    o2.pitchStart.value = this.randomValue(3600, 6000);
    o2.pitchEnd.value = o2.pitchStart.value - this.randomValue(0, 3600);
    o2.overtoneBase.value = 0;
    o2.overtoneNum.value = 0;
    o2.overtoneDetune.value = 0;
    o2.overtoneAttenuation.value = 0;
    o2.seed.value = 0;

    // Mute the rest of oscillators.
    for (var i = 3; i < this.controls.length; ++i) {
      this.controls[i].gain.value = 0;
    }
  }

  randomToneA() {
    var o0 = this.controls[0];
    o0.gainTension.random();
    o0.duration.value = 1;
    o0.gain.value = 1;
    o0.pitchStart.value = Math.round(this.randomValue(-3, 1)) * 1200;
    o0.pitchEnd.value = o0.pitchStart.value;
    o0.overtoneBase.random();
    o0.overtoneNum.random();
    o0.overtoneDetune.random();
    o0.overtoneAttenuation.random();
    o0.seed.random();

    var o1 = this.controls[1];
    o1.gainTension.random();
    o1.duration.value = 1;
    o1.gain.value = this.randomValue(0.01, 0.5);
    var o0pitch = o0.pitchStart.value;
    var freq = 440 * Math.pow(2, o0pitch / 1200);
    var overtone = Math.floor(this.randomValue(1, 16));
    var raw = Math.log2(freq * overtone / 440) * 1200;
    var fixed = o0pitch + (raw - o0pitch) % 2400;
    o1.pitchStart.value = fixed + this.randomValue(-25, 25);
    o1.pitchEnd.value = o1.pitchStart.value;
    o1.overtoneBase.random();
    o1.overtoneNum.random();
    o1.overtoneDetune.random();
    o1.overtoneAttenuation.random();
    o1.seed.random();

    var o2 = this.controls[2];
    o2.gainTension.random();
    o2.duration.value = 1;
    o2.gain.random();
    o2.pitchStart.value = this.randomValue(-6000, 6000);
    o2.pitchEnd.value = o2.pitchStart.value;
    o2.overtoneBase.random();
    o2.overtoneNum.random();
    o2.overtoneDetune.random();
    o2.overtoneAttenuation.random();
    o2.seed.random();

    // Mute the rest of oscillators.
    for (var i = 3; i < this.controls.length; ++i) {
      this.controls[i].gain.value = 0;
    }
  }

  randomToneB() {
    var o0 = this.controls[0];
    o0.gainTension.random();
    o0.duration.value = 1;
    o0.gain.value = 1;
    o0.pitchStart.value = this.randomValue(-5, 5) * 1200;
    o0.pitchEnd.value = o0.pitchStart.value;
    o0.overtoneBase.value = this.randomValue(0, 16);
    o0.overtoneNum.random();
    o0.overtoneDetune.random();
    o0.overtoneAttenuation.random();
    o0.seed.random();

    var o1 = this.controls[1];
    o1.gainTension.random();
    o1.duration.random();
    o1.gain.random();
    o1.pitchStart.value = this.randomValue(0, 6000);
    o1.pitchEnd.value = o1.pitchStart.value;
    o1.overtoneBase.value = this.randomValue(0, 16);
    o1.overtoneNum.random();
    o1.overtoneDetune.random();
    o1.overtoneAttenuation.random();
    o1.seed.random();

    var o2 = this.controls[2];
    o2.gainTension.random();
    o2.duration.value = o1.duration.value / 2;
    o2.gain.random();
    o2.pitchStart.value = this.randomValue(3600, 6000);
    o2.pitchEnd.value = o2.pitchStart.value;
    o2.overtoneNum.value = 0;

    // Mute the rest of oscillators.
    for (var i = 3; i < this.controls.length; ++i) {
      this.controls[i].gain.value = 0;
    }
  }

  oscillate(time) {
    var out = 0;
    for (var i = this.controls.length - 1; i >= 0; --i) {
      out = this.controls[i].oscillator.oscillate(time, out);
    }
    return out;
  }
}

function random() {
  switch (pullDownMenuRandomType.value) {
    case "AllMaxDuration":
      oscillator.randomFullDuration();
      break;
    case "Bassdrum":
      oscillator.randomBassdrum();
      break;
    case "BassdrumOT":
      oscillator.randomBassdrumOvertone();
      break;
    case "TomA":
      oscillator.randomTomA();
      break;
    case "ToneA":
      oscillator.randomToneA();
      break;
    case "ToneB":
      oscillator.randomToneB();
      break;
    case "All":
    default:
      inputLength.random();
      oscillator.random();
      break;
  }
  refresh();
  play(audioContext, wave);
}

function refresh() {
  oscillator.length = inputLength.value;
  oscillator.fmIndex = Math.pow(2, inputFmIndex.value);
  oscillator.refresh();

  var raw = makeWave(inputLength.value, renderParameters.sampleRate);
  if (checkboxResample.value) {
    wave.left = Resampler.pass(raw, renderParameters.sampleRate, audioContext.sampleRate);
  }
  else {
    wave.left = Resampler.reduce(raw, renderParameters.sampleRate, audioContext.sampleRate);
  }
  wave.declick(inputDeclickIn.value, inputDeclickOut.value);
  if (checkboxNormalize.value) {
    wave.normalize();
  }

  waveView.set(wave.left);
}


//-- UI.

var audioContext = new AudioContext();
var renderParameters = new RenderParameters(audioContext, 16);

var wave = new Wave(1);

var divMain = new Div(document.body, "main");
var headingTitle = pageTitle(divMain.element);

var description = new Description(divMain.element);
description.add("簡単な使い方", "Randomを押すとパラメータがランダムに変わって音を探すことができます。気に入った音はSaveで保存できます。");

var divWaveform = new Div(divMain.element, "waveform");
var headingWaveform = new Heading(divWaveform.element, 6, "Waveform");
var waveView = new WaveView(divWaveform.element, 512, 256, wave.left, false);

var divRenderControls = new Div(divMain.element, "renderControls");
var buttonPlay = new Button(divRenderControls.element, "Play",
  () => play(audioContext, wave));
var buttonRandom = new Button(divRenderControls.element, "Random",
  () => random());
var pullDownMenuRandomType = new PullDownMenu(divRenderControls.element, null,
  () => { });
pullDownMenuRandomType.add("All");
pullDownMenuRandomType.add("AllMaxDuration");
pullDownMenuRandomType.add("Bassdrum");
pullDownMenuRandomType.add("BassdrumOT");
pullDownMenuRandomType.add("TomA");
pullDownMenuRandomType.add("ToneA");
pullDownMenuRandomType.add("ToneB");
var buttonSave = new Button(divRenderControls.element, "Save",
  () => save(wave));
var checkboxQuickSave = new Checkbox(divRenderControls.element, "QuickSave",
  false, (checked) => { });

var divMiscControls = new Div(divMain.element, "MiscControls");
var headingRender = new Heading(divMiscControls.element, 6, "Render Settings");
var inputLength = new NumberInput(divMiscControls.element, "Length",
  0.2, 0.01, 1, 0.01, (value) => { refresh(); });
var inputFmIndex = new NumberInput(divMiscControls.element, "Mod. Index",
  4, 0, 8, 0.05, (value) => { refresh(); });
var radioButtonModulationType = new RadioButton(divMiscControls.element,
  "Mod. Type", (value) => { oscillator.modulationType = value; refresh(); });
radioButtonModulationType.add("PhaseShift");
radioButtonModulationType.add("FM");
var tenMilliSecond = audioContext.sampleRate / 100;
var inputDeclickIn = new NumberInput(divMiscControls.element, "Declick In",
  0, 0, tenMilliSecond, 1, refresh);
var inputDeclickOut = new NumberInput(divMiscControls.element, "Declick Out",
  0, 0, tenMilliSecond, 1, refresh);
var checkboxNormalize = new Checkbox(divMiscControls.element, "Normalize",
  true, refresh);
var checkboxResample = new Checkbox(divMiscControls.element, "16x Sampling",
  true, (checked) => {
    renderParameters.overSampling = checked ? 16 : 1;
    refresh();
    play(audioContext, wave);
  }
);

var oscillator = new OscillatorGroup(divMain.element, renderParameters, () => { });


refresh();

// If startup is succeeded, remove "unsupported" paragaraph.
document.getElementById("unsupported").outerHTML = "";
