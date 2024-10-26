import scipy.special as special
import matplotlib.pyplot as plt
import numpy as np
import json


def printSingleArrayCircular():
    size = 16

    ratio = []
    base = special.jn_zeros(0, 1)[0]
    for m in range(size):
        ratio.append(special.jn_zeros(m, size) / base)

    ratio = sorted(np.ravel(ratio))

    print(ratio)

    plt.plot(ratio)
    plt.show()


def printCircular():
    size = 17

    functions = [
        special.jn_zeros,
        special.jnp_zeros,
        special.yn_zeros,
        special.ynp_zeros,
    ]

    data = {}
    for fn in functions:
        data[fn.__name__] = np.zeros((size, size))
        for m in range(size):
            data[fn.__name__][m] = fn(m, size)

        data[fn.__name__ + "_tr"] = data[fn.__name__].T.tolist()
        data[fn.__name__] = data[fn.__name__].tolist()

    with open("pitches.json", "w", encoding="utf-8") as fp:
        json.dump(data, fp)


def printSpherical():
    size = 16

    ratio = []
    for n in range(size):
        tmp = []
        for m in range(size):
            if np.abs(m) > n:
                break
            tmp.append(special.sph_harm(m, n, 2 * np.pi * 0.125, 2 * np.pi * 0.8))
        ratio.append(tmp)

    print(ratio)


if __name__ == "__main__":
    # printSingleArrayCircular()
    printCircular()
    # printSpherical()
