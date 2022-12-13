class Wave {
  constructor(channels) {
    this.data = []
    for (var i = 0; i < channels; ++i) {
      this.data.push([])
    }
  }

  get frames() {
    return this.data[0].length
  }

  get channels() {
    return this.data.length
  }

  get left() {
    return this.data[0]
  }

  set left(data) {
    this.data[0] = data
  }

  get right() {
    return this.data[1]
  }

  set right(data) {
    this.data[1] = data
  }

  isMono() {
    if (this.data.length === 1) {
      return true
    }
    return false
  }

  isStereo() {
    if (this.data.length === 2) {
      return true
    }
    return false
  }

  // 左右のチャンネルの長さを 0 で埋めてそろえる。
  align() {
    var maxLength = 0
    for (var i = 0; i < this.data.length; ++i) {
      if (maxLength < this.data[i].length) {
        maxLength = this.data[i].length
      }
    }
    for (var i = 0; i < this.data.length; ++i) {
      for (var j = this.data[i].length; j < maxLength; ++j) {
        this.data[i].push(0)
      }
    }
  }

  findPeak() {
    var peak = null
    var max = -Number.MAX_VALUE
    for (var channel = 0; channel < this.data.length; ++channel) {
      for (var sample = 0; sample < this.data[channel].length; ++sample) {
        var value = Math.abs(this.data[channel][sample])
        if (max < value) {
          max = value
          peak = { channel, sample, value }
        }
      }
    }
    return peak
  }

  // 引数を指定しない場合は this.data のピーク値を1.0として正規化。
  normalize(divisor) {
    var peakValue = divisor
    if (!Number.isFinite(divisor)) {
      var peak = this.findPeak()
      if (peak === null || peak.value === 0) {
        console.log("findPeak failed.")
        return
      }
      this.peakValue = peak.value
      peakValue = this.peakValue
    }

    for (var i = 0; i < this.data.length; ++i) {
      for (var j = 0; j < this.data[i].length; ++j) {
        this.data[i][j] /= peakValue
      }
    }
  }

  declick(fadein, fadeout) {
    this.declickIn(fadein)
    this.declickOut(fadeout)
  }

  declickRatio(fadein, fadeout) {
    var length = this.data[0].length
    this.declickIn(Math.floor(length * fadein / 100))
    this.declickOut(Math.floor(length * fadeout / 100))
  }

  declickIn(fadeLength) {
    for (var channel = 0; channel < this.data.length; ++channel) {
      var length = Math.min(fadeLength, this.data[channel].length)
      var coefficient = Math.pow(256, 1 / length)
      var gain = 1 / 256
      for (var sample = 0; sample < length; ++sample) {
        this.data[channel][sample] *= gain
        gain *= coefficient
      }
    }
  }

  declickOut(fadeLength) {
    for (var channel = 0; channel < this.data.length; ++channel) {
      var length = Math.min(fadeLength, this.data[channel].length)
      var coefficient = Math.pow(256, 1 / length)
      var gain = coefficient / 256
      var last = this.data[channel].length - 1
      for (var sample = 0; sample < length; ++sample) {
        this.data[channel][last - sample] *= gain
        gain *= coefficient
      }

      length = Math.min(32, this.data[channel].length)
      for (var sample = 0; sample < length; ++sample) {
        this.data[channel][last - sample]
          *= 0.5 - Math.cos(Math.PI * sample / length) / 2
      }
    }
  }

  zeroOut(fadeLength) {
    for (var channel = 0; channel < this.data.length; ++channel) {
      var length = Math.min(fadeLength, this.data[channel].length)
      var last = this.data[channel].length - 1
      for (var sample = 0; sample < length; ++sample) {
        this.data[channel][last - sample]
          *= 0.5 - Math.cos(Math.PI * sample / length) / 2
      }
    }
  }

  trim() {
    var threshold = 1e-3
    var start = this.frames
    var end = 0
    for (var channel = 0; channel < this.data.length; ++channel) {
      var length = this.data[channel].length
      for (var sample = 0; sample < length; ++sample) {
        var sampleAbs = Math.abs(this.data[channel][sample])
        if (sampleAbs >= threshold && start > sample) {
          start = sample
          continue
        }
      }
      for (var sample = length - 1; sample >= 0; --sample) {
        var sampleAbs = Math.abs(this.data[channel][sample])
        if (sampleAbs >= threshold && end < sample) {
          end = sample
          continue
        }
      }
    }
    // console.log(start, end)
    for (var channel = 0; channel < this.data.length; ++channel) {
      this.data[channel] = this.data[channel].slice(start, end + 1)
    }
  }

  copyChannel(channel) {
    for (var ch = 0; ch < this.channels; ++ch) {
      if (channel !== ch) {
        this.data[ch] = Array.from(this.data[channel])
      }
    }
  }

  rotate(channel, amount) {
    var data = this.data[channel]
    if (amount > 0) {
      var temp = data.splice(amount, data.length - amount)
      this.data[channel] = temp.concat(data)
    }
    else if (amount < 0) {
      var temp = data.splice(0, Math.abs(amount))
      this.data[channel] = data.concat(temp)
    }
  }

  // Quick references.
  // http://www.piclist.com/techref/io/serial/midi/wave.html
  // https://sites.google.com/site/musicgapi/technical-documents/wav-file-format
  static fileHeader(sampleRate, channels, bufferLength, loop = false) {
    var format = this.fileFormat(sampleRate, 32, channels)

    var header = []

    //
    // fmt_, 18 + 8 = 26 [byte]
    // fact, 4 + 8 = 12 [byte]
    // smpl, 36 + 24 * numLoop + 8 = 68 [byte]
    // data, 4 + bufferLength [byte]
    //
    var riffChunkSize = loop ? 110 : 42

    header.push(this.stringToAscii("RIFF")) // riff
    header.push(this.uint32buffer(riffChunkSize + bufferLength)) // riffChunkSize

    header.push(this.stringToAscii("WAVE")) // wave

    header.push(this.stringToAscii("fmt ")) // fmt_
    header.push(this.uint32buffer(18)) // fmtChunkSize
    header.push(this.uint16buffer(0x0003)) // formatTag, 0x0003 = IEEE 32bit float
    header.push(this.uint16buffer(format.channels)) // channels
    header.push(this.uint32buffer(format.sampleRate)) // samplePerSec
    header.push(this.uint32buffer(format.sampleRate * format.bytesPerFrame)) // bytesPerSec
    header.push(this.uint16buffer(format.bytesPerFrame)) // blockAlign
    header.push(this.uint16buffer(format.sampleSize)) // bitsPerSample
    header.push(this.uint16buffer(0x0000)) // cbSize

    header.push(this.stringToAscii("fact")) // fact
    header.push(this.uint32buffer(4)) // factChunkSize
    header.push(this.uint32buffer(bufferLength / format.bytesPerFrame)) // sampleLength

    if (loop) {
      header.push(this.stringToAscii("smpl")) // smpl
      header.push(this.uint32buffer(60)) // smplChunkSize
      header.push(this.uint32buffer(0)) // manufacturer
      header.push(this.uint32buffer(0)) // product
      header.push(this.uint32buffer(1e9 / format.sampleRate)) // samplePeriod
      header.push(this.uint32buffer(60)) // midiUnityNote
      header.push(this.uint32buffer(0)) // midiPitchFraction
      header.push(this.uint32buffer(0)) // smpteFormat
      header.push(this.uint32buffer(0)) // smpteOffset
      header.push(this.uint32buffer(1)) // numSampleLoops
      header.push(this.uint32buffer(24)) // samplerData

      header.push(this.uint32buffer(0)) // cuePointID
      header.push(this.uint32buffer(0)) // type
      header.push(this.uint32buffer(0)) // start
      header.push(this.uint32buffer(bufferLength - format.bytesPerFrame)) // end
      header.push(this.uint32buffer(0)) // fraction
      header.push(this.uint32buffer(0)) // playCount
    }

    header.push(this.stringToAscii("data")) // data
    header.push(this.uint32buffer(bufferLength)) // dataChunkSize

    return this.concatTypedArray(header)
  }

  static uint16buffer(value) {
    var array = new Uint16Array(1)
    array[0] = value
    return array
  }

  static uint32buffer(value) {
    var array = new Uint32Array(1)
    array[0] = value
    return array
  }

  static stringToAscii(string) {
    var ascii = new Uint8Array(string.length)
    for (var i = 0; i < string.length; ++i) {
      ascii[i] = string.charCodeAt(i)
    }
    return ascii
  }

  static concatTypedArray(arrays) {
    var length = 0
    for (var i = 0; i < arrays.length; ++i) {
      length += arrays[i].byteLength
    }
    var array = new Uint8Array(length)
    var index = 0
    for (var i = 0; i < arrays.length; ++i) {
      var uint8 = new Uint8Array(arrays[i].buffer)
      for (var j = 0; j < uint8.length; ++j) {
        array[index] = uint8[j]
        ++index
      }
    }
    return array
  }

  // 複数チャンネルの wave の並び順をフォーマットする。
  static toBuffer(wave, channels) {
    wave.align()
    var float = new Float32Array(wave.left.length * channels)
    for (var i = 0, ic = 0; i < wave.left.length; ++i, ic += channels) {
      for (var j = 0; j < channels; ++j) {
        float[ic + j] = wave.data[j][i]
      }
    }
    var buffer = new Uint8Array(float.buffer)
    return buffer
  }

  // ヘッダで利用する format を生成。
  // sampleSize は 1 サンプルのビット数。
  static fileFormat(sampleRate, sampleSize, channels) {
    return {
      sampleRate,
      sampleSize,
      channels,
      bytesPerFrame: channels * sampleSize / 8
    }
  }
}
