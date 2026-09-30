## Harmonic Series Tuning
### Open Strings (Approx. E-A-D-G-B-E)
The open string pitches are derived from the harmonic series of the bass fundamental $F_0$ (E2, corresponding to the `Bass Note` parameter), octave-shifted:

- String 0 (Low E): 16th harmonic $\times 2^0$ $\rightarrow$ Ratio $\frac{16}{16} \times 1 = 1.0$ (E2 fundamental)
- String 1 (A): 21st harmonic $\times 2^0$ $\rightarrow$ Ratio $\frac{21}{16} \times 1 = 1.3125$ (A2, $-29.2$¢ from 12-TET)
- String 2 (D): 28th harmonic $\times 2^0$ $\rightarrow$ Ratio $\frac{28}{16} \times 1 = 1.75$ (natural 7th harmonic $7/4$, D3, $-31.2$¢)
- String 3 (G): 19th harmonic $\times 2^1$ $\rightarrow$ Ratio $\frac{19}{16} \times 2 = 2.375$ (G3, $-2.5$¢)
- String 4 (B): 24th harmonic $\times 2^1$ $\rightarrow$ Ratio $\frac{24}{16} \times 2 = 3.0$ (pure 3rd harmonic $3/1$, B3, $+2.0$¢)
- String 5 (High E): 16th harmonic $\times 2^2$ $\rightarrow$ Ratio $\frac{16}{16} \times 4 = 4.0$ (4th harmonic $4/1$, E4, $+0.0$¢)

### Frets
For any string with open frequency $f_{\text{open}}$, fret $k$ ($k \ge 0$) scales along its own harmonic series:

$$\text{fretRatio}(k) = \frac{16 + k}{16}$$

- Fret 0: $\frac{16}{16} = 1.0$ (open string)
- Fret 1: $\frac{17}{16} = 1.0625$ ($+1.05$ semitones)
- Fret 2: $\frac{18}{16} = 1.1250$ ($+2.04$ semitones)
- Fret 3: $\frac{19}{16} = 1.1875$ ($+2.98$ semitones)
- Fret 4: $\frac{20}{16} = 1.2500$ ($+3.86$ semitones, exact $5/4$ pure major third)
- Fret 5: $\frac{21}{16} = 1.3125$ ($+4.71$ semitones, exact 21st harmonic interval to the next string)
