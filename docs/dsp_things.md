# DSP Things
I wrote some articles about DSP on following link. They are written in Japanese, so I'd recommend to use some machine translation.

- [波ノート](https://ryukau.github.io/filter_notes/)

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

## Formant
## Conversion from Band Width to Q
Conversion from band width in Hz to Q (quality factor).

$$
Q = \frac{f_c}{BW}
$$

- $f_c$ : Cutoff frequency of band-pass filter.
- $BW$ : Band width in Hz.

Conversion from band width in octave $N$ to Q.

$$
\begin{aligned}
BW &= \left( 2^{N/2} - \frac{1}{2^{N/2}} \right) f_c \\
Q &= \frac{f_c}{BW} = \frac{2^{N/2}}{2^{N} - 1}
\end{aligned}
$$

Bilinear transform warps frequency. Therefore band width becomes narrower for higher cutoff frequency ($f_c$).

### References
- [Appendix D. Formant Values](http://www.csounds.com/manual/html/MiscFormants.html)
- [FORMANT TABLE](https://www.classes.cs.uchicago.edu/archive/1999/spring/CS295/Computing_Resources/Csound/CsManual3.48b1.HTML/Appendices/table3.html)
- [fof](http://www.csounds.com/manual/html/fof.html)
- [fof2](http://www.csounds.com/manual/html/fof2.html)
- [Q factor vs bandwidth in octaves band filter -3 dB pass calculator calculation formula quality factor Q to bandwidth BW width octave convert filter BW octave vibration mastering slope dB/oct steepness EQ filter equalizer cutoff freqiency - sengpielaudio Sengpiel Berlin](http://www.sengpielaudio.com/calculator-bandwidth.htm)
- [Q Factor and Bandwidth of a Resonant Circuit | Resonance | Electronics Textbook](https://www.allaboutcircuits.com/textbook/alternating-current/chpt-6/q-and-bandwidth-resonant-circuit/)
- [Cookbook formulae for audio EQ biquad filter coefficients](https://webaudio.github.io/Audio-EQ-Cookbook/audio-eq-cookbook.html)
- [Vowel diagram - Wikipedia](https://en.wikipedia.org/wiki/Vowel_diagram)