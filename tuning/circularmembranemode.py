import scipy.special as special
import matplotlib.pyplot as plt
import numpy as np
import json


def printSingleArrayCircular(size=16):
    ratio = []
    base = special.jn_zeros(0, 1)[0]
    for m in range(size):
        ratio.append(special.jn_zeros(m, size) / base)

    ratio = sorted(np.ravel(ratio))

    print(ratio)

    plt.plot(ratio)
    plt.show()


def printCircular(size=65, offset=0, normalize=False):
    functions = [
        special.jn_zeros,
        special.jnp_zeros,
        special.yn_zeros,
        special.ynp_zeros,
    ]

    data = {}
    for fn in functions:
        key0 = fn.__name__
        keyT = fn.__name__ + "_tr"

        data[key0] = np.zeros((size, size))
        for m in range(size):
            data[key0][m] = fn(m + offset, size)

        data[keyT] = data[key0].copy().T
        data[key0] = data[key0]

        # print(data[keyT][0] / data[keyT][0][0])
        if normalize:
            for m in range(size):
                data[keyT][m] /= data[keyT][m][0]
                data[key0][m] /= data[key0][m][0]

        data[keyT] = data[keyT].tolist()
        data[key0] = data[key0].tolist()

    with open("pitches.json", "w", encoding="utf-8") as fp:
        json.dump(data, fp)


def printSpherical(size=16):
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
    printCircular(65, 0, False)
    # printSpherical()
