import numpy as np
import matplotlib.pyplot as plt


def hv_tanh(x):
    x = np.clip(x, -3, 3)
    x2 = x * x
    return x * (x2 + 27) / (x2 * 9 + 27)


x = np.linspace(-4, 4, 1024)
y = hv_tanh(x)
plt.plot(x, y, label="hv")
plt.plot(x, np.tanh(x), label="tanh")
# plt.plot(x, y / np.tanh(x), label="relative error")
plt.grid()
plt.legend()
plt.show()
