class BezierEnvelope {
  constructor(x1, y1, x2, y2) {
    this.easing = bezier(x1, y1, x2, y2)
    this.x1 = x1
    this.y1 = y1
    this.x2 = x2
    this.y2 = y2
  }

  set(x1, y1, x2, y2) {
    this.easing = bezier(x1, y1, x2, y2)
  }

  attack(value) {
    return this.easing(value)
  }

  decay(value) {
    return 1 - this.easing(value)
  }

  // Return lookup table of envelope. This will be used for drawing UI.
  makeTable(length) {
    var table = new Array(length)
    var denom = length - 1
    for (var i = 0; i < table.length; ++i) {
      table[i] = this.decay(i / denom)
    }
    return table
  }
}

class ExpDecay {
  // https://en.wikipedia.org/wiki/Exponential_decay
  constructor(length, endValue = 1e-5) {
    this.gamma = Math.pow(endValue, 1 / length)
    this.value = 1
  }

  process(input) {
    var output = input * this.value
    this.value *= this.gamma
    return output
  }
}

class CosDecay {
  constructor(length) {
    this.length = length - 1
    this.n = 0
  }

  process(input) {
    return input * (1 + Math.cos(Math.PI * this.n++ / this.length)) / 2
  }
}

class BezierClipper {
  constructor(
    sampleRate,
    threshold,
    ratio,
    attackTime,
    releaseTime,
    x1,
    y1,
    x2,
    y2
  ) {
    this.sampleRate = sampleRate
    this.threshold = threshold
    this.ratio = ratio
    this.attackTime = Math.ceil(attackTime * sampleRate)
    this.releaseTime = Math.ceil(releaseTime * sampleRate)

    this.envelope = new BezierEnvelope(x1, y1, x2, y2)

    this.envelopeTime = 0
    this.wetRatio = 0
    this.isOnAttack = true
  }

  applyRatio(input) {
    return this.ratio * input
  }

  process(input) {
    if (Math.abs(input) < this.threshold) {
      if (this.envelopeTime > 0) {
        // Release.
        if (this.isOnAttack) {
          this.isOnAttack = false
          this.envelopeTime = Math.ceil(this.wetRatio * this.releaseTime)
        }

        --this.envelopeTime
        this.wetRatio = this.envelopeTime / this.releaseTime
        var amount = this.envelope.attack(this.wetRatio)
        return input + amount * (this.applyRatio(input) - input)
      }

      // Bypass.
      return input
    }

    // Sustain.
    if (this.envelopeTime >= this.attackTime) {
      return this.applyRatio(input)
    }

    // Attack.
    this.isOnAttack = true
    ++this.envelopeTime
    this.wetRatio = this.envelopeTime / this.attackTime
    var amount = this.envelope.attack(this.wetRatio)
    return input + amount * (this.applyRatio(input) - input)
  }
}
