// https://stackoverflow.com/questions/521295/seeding-the-random-number-generator-in-javascript

class Rnd {
  constructor(seed) {
    this.m_w = isNaN(seed) ? 123456789 : seed;
    this.m_z = 987654321;
    this.mask = 0xffffffff;
  }

  // Takes any integer
  seed(i) {
    this.m_w = isNaN(i) ? 123456789 : i;
    this.m_z = 987654321;
  }

  // Returns number between 0 (inclusive) and 1.0 (exclusive),
  // just like Math.random().
  random() {
    this.m_z = (36969 * (this.m_z & 65535) + (this.m_z >> 16)) & this.mask;
    this.m_w = (18000 * (this.m_w & 65535) + (this.m_w >> 16)) & this.mask;
    var result = ((this.m_z << 16) + this.m_w) & this.mask;
    result /= 4294967296;
    return result + 0.5;
  }
}
