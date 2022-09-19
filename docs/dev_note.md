## Pitch Related Terms
Some terms related to pitch:

- Note: A list of values consists of at least a pitch and a duration. May contain some
  other informations.
- Pitch: Perceived fundamental frequency of sound. May represented as octave, semitone,
  or cent.
- Octave: Relative magnitude of frequency in power of 2.
- Semitone: Relative magnitude of frequency in power of 2^(1/12).
- Cent: Relative magnitude of frequency in power of 2^(1/1200).

```
(target frequency) = (center freuquency) * 2^(octave + semitone / 12 + cent / 1200).
```

MIDI pitch here means mostly absolute magnitude of frequency, where it must be 60 for
C4. I said "mostly" because center pitch is 440 Hz most of the time, but it can be
changed.
