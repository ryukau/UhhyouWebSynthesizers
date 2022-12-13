class Envelope {
  constructor(tension) {
    this.easing
    this.tension = tension
  }

  set tension(value) {
    value = this.clamp(value)
    var x = 1 - value
    var y = value
    this.easing = bezier(x, y, x, y)
  }

  attack(value) {
    return this.easing(value)
  }

  decay(value) {
    return this.easing(1 - value)
  }

  clamp(value) {
    return Math.max(0, Math.min(value, 1))
  }

  makeTable(length) {
    var table = new Array(length)
    for (var i = 0; i < table.length; ++i) {
      table[i] = this.decay(i / (length - 1))
    }
    return table
  }
}
