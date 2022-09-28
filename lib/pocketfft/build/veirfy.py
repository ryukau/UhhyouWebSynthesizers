import json
import numpy as np
import matplotlib.pyplot as plt

with open("pocketfft.json", "r", encoding="utf-8") as fi:
    data = json.load(fi)

np_spc = np.fft.rfft(data["input"])
np_out = np.fft.irfft(np_spc)

cpp_spc = np.array([v[0] + 1j * v[1] for v in data["spectrum"]])
cpp_out = np.array(data["output"])

assert np_spc.shape == cpp_spc.shape
assert np_out.shape == cpp_out.shape
np.testing.assert_allclose(cpp_spc, np_spc)
np.testing.assert_allclose(cpp_out, np_out)

exit()

plt.figure()
plt.title("Real")
plt.plot(np_spc.real, label="np_spc")
plt.plot(cpp_spc.real, label="cpp_spc")
plt.grid()
plt.legend()

plt.figure()
plt.title("Imag")
plt.plot(np_spc.imag, label="np_spc")
plt.plot(cpp_spc.imag, label="cpp_spc")
plt.grid()
plt.legend()

plt.figure()
plt.title("Output")
plt.plot(np_spc.imag, label="np_out")
plt.plot(cpp_spc.imag, label="cpp_out")
plt.grid()
plt.legend()

plt.show()
