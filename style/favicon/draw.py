import numpy as np
from PIL import Image

size = 16
stripe = np.zeros((size, size), dtype=np.float64)

center = 7.5
# scale = 0.489
# t = 2.39 * np.pi
scale = 1.001
t = 1 * np.pi
for x in range(size):
    for y in range(size):
        cx = 64 * (x - center)
        cy = 64 * (y - center)
        # cy = 1.8 * (y - center)
        r0 = np.sqrt(cx * cx + cy * cy)

        v0 = np.sin(t * scale) * cx + np.cos(t * scale) * cy

        px = r0 * np.cos(t) - v0 * np.sin(t)
        py = r0 * np.sin(t) + v0 * np.cos(t)
        xy = px + py
        # stripe[x][y] = 1 if np.mod(20 * xy, 1) < 0.5 else 0
        stripe[x][y] = np.mod(xy, 8)
stripe *= 255 / np.max(stripe)
stripe += 128
# stripe = np.where(stripe < 32, 31, stripe)
stripe *= 255 / np.max(stripe)

# Round corner.
stripe[0][0] = 255
stripe[0][size - 1] = 255
stripe[size - 1][0] = 255
stripe[size - 1][size - 1] = 255

im = Image.fromarray(stripe.astype(np.uint8), mode="L")
im.save("favicon.png")
