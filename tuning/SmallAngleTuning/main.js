import {addSignStr, createTable, freqToMidi, setRefresh, setupResizer} from "../tableutil.js";

function midiToFreq(note, centerHz = 440) { return centerHz * Math.pow(2, (note - 69) / 12); }

function midiNoteToNoteName(note) {
  const mod = (n, m) => (n % m + m) % m;
  const roundedNote = Math.round(note);
  const octave = Math.floor(roundedNote / 12) - 1;
  const semitone = mod(roundedNote, 12);
  const stInt = Math.floor(semitone);

  const noteStr = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

  return `${noteStr[stInt]}<sub>${octave}</sub>`;
}

function highlightError(errorInCent, threshold = 1) {
  if (isNaN(errorInCent)) return `<span class="error">NaN</span>`;
  const errorStr = addSignStr(errorInCent.toFixed(3));
  if (Math.abs(errorInCent) < threshold) return errorStr;
  return `<span class="error">${errorStr}</span>`;
}

function refresh() {
  const paragraphStatus = document.getElementById("status");

  const sampleRate = parseFloat(document.getElementById("sampleRateHz").value);
  if (!(sampleRate > 0)) {
    paragraphStatus.innerHTML
      = '<span class="error">Error: "Sampling rate" must be greater than 0 Hz.</span>';
    return;
  }

  const highestNote = parseInt(document.getElementById("highestNote").value);
  const lowestNote = parseInt(document.getElementById("lowestNote").value);
  if (isNaN(highestNote) || isNaN(lowestNote) || highestNote < lowestNote) {
    paragraphStatus.innerHTML
      = '<span class="error">Error: Invalid MIDI note range. "Highest MIDI note" must be &ge; "Lowest MIDI note".</span>';
    return;
  }

  const centerHz = parseFloat(document.getElementById("centerHz").value);
  if (!(centerHz > 0)) {
    paragraphStatus.innerHTML
      = '<span class="error">Error: "A<sub>4</sub> frequency" must be greater than 0 Hz.</span>';
    return;
  }

  const errorThresholdCent = parseFloat(document.getElementById("errorThresholdCent").value);
  if (!(errorThresholdCent >= 0)) {
    paragraphStatus.innerHTML
      = '<span class="error">Error: "Error highlight threshold" must be greater than or equal to 0 cent.</span>';
    return;
  }
  const errorThresholdIndicator = document.getElementById("errorThresholdIndicator");
  errorThresholdIndicator.innerText = errorThresholdCent.toFixed(3);

  const midiNotes = [];
  const targetNoteNames = [];
  const targetFreqHz = [];
  const actualFreqHz = [];
  const actualMidiNotes = [];
  const errorsInCents = [];

  let isUnstable = false;

  for (let note = highestNote; note >= lowestNote; --note) {
    const targetFreq = midiToFreq(note, centerHz);
    const k = 2 * Math.PI * targetFreq / sampleRate;

    let actualFreq = NaN;
    let actualMidi = NaN;
    let errorInCent = NaN;

    if (k <= 2) {
      actualFreq = (sampleRate / Math.PI) * Math.asin(k / 2);
      actualMidi = freqToMidi(actualFreq, centerHz);
      errorInCent = 100 * (actualMidi - note);
    } else {
      isUnstable = true;
    }

    midiNotes.push(note);
    targetNoteNames.push(midiNoteToNoteName(note));
    targetFreqHz.push(targetFreq.toFixed(5));
    actualFreqHz.push(
      isNaN(actualFreq) ? `<span class="error">Unstable</span>` : actualFreq.toFixed(5));
    actualMidiNotes.push(
      isNaN(actualMidi) ? `<span class="error">-</span>` : actualMidi.toFixed(3));
    errorsInCents.push(highlightError(errorInCent, errorThresholdCent));
  }

  const data = {
    "MIDI [st.]": midiNotes,
    "Target Note": targetNoteNames,
    "Target Frequency [Hz]": targetFreqHz,
    "Actual Frequency[Hz]": actualFreqHz,
    "Actual MIDI [st.]": actualMidiNotes,
    "Error [cent]": errorsInCents,
  };

  createTable(data);

  if (isUnstable) {
    paragraphStatus.innerHTML
      = '<span class="error">Warning: Some high notes exceed the stability limit (f &gt; f<sub>s</sub> / &pi;).</span>';
  } else {
    paragraphStatus.innerText = "Everything is awesome.";
  }
}

setRefresh("sampleRateHz", refresh);
setRefresh("highestNote", refresh);
setRefresh("lowestNote", refresh);
setRefresh("centerHz", refresh);
setRefresh("errorThresholdCent", refresh);

refresh();
setupResizer();
