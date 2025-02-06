"""
Test data is not JSON. It is written as JavaScript module to keep ±Infinity and NaN.
"""

import numpy as np
import scipy.special as special
import json


def bipolerGeomSpace(low, high, size):
    half = np.geomspace(low, high, size // 2)
    return np.hstack([-half[::-1], half, np.inf, -np.inf, np.nan])


def writeData():
    nData = 2**16
    data = {}

    eps64 = np.finfo(np.float64).eps

    # sici
    data["sici_x"] = bipolerGeomSpace(eps64, 100, nData).tolist()
    si, ci = special.sici(data["sici_x"])
    data["si_y"] = si.tolist()
    data["ci_y"] = ci.tolist()

    # spence
    data["spence_x"] = bipolerGeomSpace(eps64, 100, nData).tolist()
    data["spence_y"] = special.spence(data["spence_x"]).tolist()

    # gamma
    data["gamma_x"] = bipolerGeomSpace(eps64, 100, nData).tolist()
    data["gamma_y"] = special.gamma(data["gamma_x"]).tolist()
    data["gammaln_y"] = special.gammaln(data["gamma_x"]).tolist()

    # erfc
    data["erfc_x"] = bipolerGeomSpace(eps64, 100, nData).tolist()
    data["erfc_y"] = special.erfc(data["erfc_x"]).tolist()

    # gammainc
    gammainc_a = np.geomspace(eps64, 16, 64)
    gammainc_x = np.hstack(
        [np.geomspace(eps64, 100, 1020), [0, np.inf, -np.inf, np.nan]]
    )
    gammainc_y = [special.gammainc(a, gammainc_x).tolist() for a in gammainc_a]
    gammaincc_y = [special.gammaincc(a, gammainc_x).tolist() for a in gammainc_a]
    data["gammainc_a"] = gammainc_a.tolist()
    data["gammainc_x"] = gammainc_x.tolist()
    data["gammainc_y"] = gammainc_y
    data["gammaincc_y"] = gammaincc_y

    with open("data_scipy.js", "w", encoding="utf-8") as fp:
        fp.write(f"export const data_scipy = {json.dumps(data)}")


if __name__ == "__main__":
    # writeData()
    print(special.gammainc(0.11573433903591146, 0.000049421937427006774))
