import {addSignStr, createTable, freqToMidi, setRefresh, setupResizer} from "../tableutil.js";

function isPrime(n) {
  if (n == 2) return true;
  if (n < 2 || n % 2 == 0) return false;
  const sqrt = Math.ceil(Math.sqrt(n));
  for (let i = 3; i <= sqrt; i += 2) {
    if (n % i == 0) return false;
  }
  return true;
}

function midiNoteToNoteName(freqHz, centerHz, addCents = false) {
  const mod = (n, m) => (n % m + m) % m;
  const note = 12 * Math.log2(freqHz / centerHz) + 69;
  const roundedNote = Math.round(note);
  const octave = Math.floor(roundedNote / 12) - 1;
  const semitone = mod(roundedNote, 12);
  const stInt = Math.floor(semitone);

  const noteStr = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

  if (addCents) {
    const cent = 100 * (note - roundedNote);
    const centStr = (cent < 0 ? "" : "+") + cent.toFixed(3);
    return `${noteStr[stInt]}<sub>${octave}</sub> (${centStr} cent)`;
  }
  return `${noteStr[stInt]}<sub>${octave}</sub>`;
}

function differenceToTarget(freqHz, centerHz) {
  const note = 12 * Math.log2(freqHz / centerHz) + 69;
  const roundedNote = Math.round(note);
  const cent = 100 * (note - roundedNote);
  return addSignStr(cent);
}

function findClosestDenominator(sampleRate, noteFreq, maxDenominator) {
  let result = 0;
  let minError = Number.MAX_VALUE;
  for (let denom = 1; denom <= maxDenominator; ++denom) {
    let period = Math.floor(denom * sampleRate / noteFreq) / denom;
    let candidateFreq = sampleRate / period;
    let relativeError = Math.abs(Math.log2(noteFreq) - Math.log2(candidateFreq));
    if (minError > relativeError) {
      result = denom;
      minError = relativeError;
    }
  }
  return result;
}

function formatPeriod(sampleRate, closestDenom, noteFreq, maxDenominator) {
  const period = Math.floor(closestDenom * sampleRate / noteFreq);
  return maxDenominator == 1 ? `${period}` : `${period} / ${closestDenom}`;
}

function highlightError(errorInCent, maxDenominator, threshold = 1) {
  const errorStr = errorInCent.toFixed(3);
  if (Math.abs(errorInCent) < threshold) return errorStr;
  return `<span class="error">${errorStr}</span>`;
}

function refresh() {
  const paragraphStatus = document.getElementById("status");

  const minPeriod = parseFloat(document.getElementById("minPeriodSample").value);
  if (!(minPeriod >= 2)) {
    paragraphStatus.innerHTML
      = '<span class="error">Error: "Min period" must be greater than or equal to 2 samples.</span>';
    return;
  } else if (minPeriod - Math.floor(minPeriod) != 0) {
    paragraphStatus.innerHTML
      = 'Warning: "Min period" has fractional part. It can\'t be used for anti-aliasing.';
  } else if (!isPrime(minPeriod)) {
    paragraphStatus.innerHTML
      = 'Info: "Min period" is not a prime number. This tuning is just a variation of a prime number tuning but some octaves lower.';
  }

  const sampleRate = parseFloat(document.getElementById("sampleRateHz").value);
  if (!(sampleRate > 0)) {
    paragraphStatus.innerHTML
      = '<span class="error">Error: "Sampling rate" must be greater than 0 Hz.</span>';
    return;
  }

  const lowestFreq = parseFloat(document.getElementById("lowestFreqHz").value);
  if (!(lowestFreq > 0)) {
    paragraphStatus.innerHTML
      = '<span class="error">Error: "Lowest frequency" must be greater than 0 Hz.</span>';
    return;
  }

  const centerHz = parseFloat(document.getElementById("centerHz").value);
  if (!(centerHz > 0)) {
    paragraphStatus.innerHTML
      = '<span class="error">Error: "A<sub>4</sub> frequency" must be greater than 0 Hz.</span>';
    return;
  }

  const maxDenominator = parseInt(document.getElementById("maxDenominator").value);
  if (!(maxDenominator > 0)) {
    paragraphStatus.innerHTML
      = '<span class="error">Error: "Maximum denominator" must be greater than 0 Hz.</span>';
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

  const indices = [];
  const targetNoteNames = [];
  const midiNoteNumbers = [];
  const closestNoteNames = [];
  const freqHz = [];
  const periods = [];
  const errorsInCents = [];

  const highestFreq = sampleRate / minPeriod;
  let noteFreq = highestFreq;
  let index = 0;
  while (noteFreq >= lowestFreq) {
    const closestDenom = findClosestDenominator(sampleRate, noteFreq, maxDenominator);
    const periodSamples = Math.floor(closestDenom * sampleRate / noteFreq) / closestDenom;
    const flooredFreq = sampleRate / periodSamples;
    const midiNN = freqToMidi(flooredFreq, centerHz);
    const errorInCent = 100 * (midiNN - freqToMidi(noteFreq, centerHz));

    indices.push(index);
    targetNoteNames.push(midiNoteToNoteName(noteFreq, centerHz, false));
    midiNoteNumbers.push(midiNN.toFixed(3));
    closestNoteNames.push(midiNoteToNoteName(flooredFreq, centerHz, false));
    freqHz.push(flooredFreq.toFixed(5));
    periods.push(formatPeriod(sampleRate, closestDenom, noteFreq, maxDenominator));
    errorsInCents.push(highlightError(errorInCent, maxDenominator, errorThresholdCent));

    ++index;
    noteFreq = highestFreq * 2 ** (-index / 12);
  }

  for (let idx = 0; idx < targetNoteNames.length; ++idx) {
    if (targetNoteNames[idx] != closestNoteNames[idx]) {
      closestNoteNames[idx] = `<span class="error">${closestNoteNames[idx]}</span>`;
    }
  }

  const data = {
    "Index": indices,
    "Target": targetNoteNames,
    "Closest": closestNoteNames,
    "MIDI [st.]": midiNoteNumbers,
    "Frequency [Hz]": freqHz,
    "Period [sample]": periods,
    "Error [cent]": errorsInCents,
  };

  // Comparing the pitch of note number 69 between MIDI and this tuning.
  const diffEt12 = freqToMidi(highestFreq * 2 ** ((69 - 127) / 12), centerHz) - 69;
  const paragraphDifferenceToEt12 = document.getElementById("differenceTo12Et");
  paragraphDifferenceToEt12.innerText = addSignStr(diffEt12);

  const paragraphDifferenceToTarget = document.getElementById("differenceToTarget");
  paragraphDifferenceToTarget.innerText = differenceToTarget(highestFreq, centerHz);

  createTable(data);

  paragraphStatus.innerText = "Everything is awesome.";
}

setRefresh("minPeriodSample", refresh);
setRefresh("sampleRateHz", refresh);
setRefresh("lowestFreqHz", refresh);
setRefresh("centerHz", refresh);
setRefresh("maxDenominator", refresh);
setRefresh("errorThresholdCent", refresh);

refresh();
setupResizer();
