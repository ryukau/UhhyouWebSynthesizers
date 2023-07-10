import numpy as np
import matplotlib.pyplot as plt

from sympy import nextprime


def writeTable():
    overtone = np.arange(1, 2**5 + 1)
    octave = np.log2(overtone)
    semitone = 12 * octave
    wrapped = np.mod(semitone, 12)
    multiplier = np.exp2(np.mod(octave, 1))

    text = """## Overtone to Pitch Table

|Overtone|Octave|12 ET Semitone|12 ET Wrapped|Wrapped Multiplier|
|-:|-:|-:|-:|-:|
"""

    for i in range(len(overtone)):
        text += f"|{overtone[i]:.0f}|{octave[i]:.7f}|{semitone[i]:.3f}|{wrapped[i]:.3f}|{multiplier[i]:.7f}|\n"

    overtone = []

    p = 2
    while p < 1024:
        overtone.append(p)
        p = nextprime(p)
    overtone = np.array(overtone)

    octave = np.mod(np.log2(overtone), 1.0)
    wrapped = 12 * octave
    multiplier = np.exp2(np.mod(octave, 1))

    sortIndices = np.argsort(wrapped)
    overtone = np.take_along_axis(overtone, sortIndices, axis=None)
    octave = np.take_along_axis(octave, sortIndices, axis=None)
    wrapped = np.take_along_axis(wrapped, sortIndices, axis=None)
    multiplier = np.take_along_axis(multiplier, sortIndices, axis=None)

    text += """
## Prime Overtone Table (Sorted by Wrapped values)

|Overtone|12 ET Wrapped|Octave Wrapped|Wrapped Multiplier|
|-:|-:|-:|-:|
"""

    for i in range(len(overtone)):
        text += f"|{overtone[i]:.0f}|{wrapped[i]:.3f}|{octave[i]:.7f}|{multiplier[i]:.7f}|\n"

    with open("overtone.md", "w", encoding="utf-8") as fi:
        fi.write(text)


def findNearest12ET():
    overtone = np.arange(1, 2**5 + 1)
    semitone = 12 * np.mod(np.log2(overtone), 1)
    nearest = np.round(semitone)

    rejected = np.where(np.abs(semitone - nearest) <= 0.1, overtone, -1)
    print(list(filter(lambda x: x >= 0, rejected)))


# writeTable()
findNearest12ET()
