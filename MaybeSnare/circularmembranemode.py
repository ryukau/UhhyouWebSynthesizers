from scipy.special import jn_zeros
import matplotlib.pyplot as plt
import numpy as np

size = 16

ratio = []
base = jn_zeros(0, 1)[0]
for m in range(size):
    ratio.append(jn_zeros(m, size) / base)

ratio = sorted(np.ravel(ratio))

print(ratio)

plt.plot(ratio)
plt.show()
