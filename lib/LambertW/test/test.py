import numpy as np
import scipy.special as special
import json

with open("test.json", "r", encoding="utf-8") as fi:
    data = json.load(fi)

range1 = np.linspace(0, -1 / np.e, 1024, endpoint=True)
range2 = np.linspace(0, 30, 1024, endpoint=True)

test1_0 = special.lambertw(range1, 0)
test1_m1 = special.lambertw(range1, -1)
test2_0 = special.lambertw(range2, 0)

"""
Below are differences between SciPy implementation to `lambertw.js`. SciPy is correct at case 3. This is because JSON replaces `±Infinity` and `NaN` to `null`.

print(test1_0[-1], data["test1_0"][-1])    # case 1: (nan+nanj), -1
print(test1_m1[-1], data["test1_m1"][-1])  # case 2: (nan+nanj), -1
print(test1_m1[0], data["test1_m1"][0])    # case 3: (-inf+0j) , None
"""

np.testing.assert_array_almost_equal(test1_0[:-1], data["test1_0"][:-1])
np.testing.assert_array_almost_equal(test1_m1[1:-1], data["test1_m1"][1:-1])
np.testing.assert_array_almost_equal(test2_0, data["test2_0"])
