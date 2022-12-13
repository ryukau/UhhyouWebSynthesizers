class Wave {
  constructor(channels) {
    this.data = []
    for (var i = 0; i < channels; ++i) {
      this.data.push([])
    }

    this.peakValue = null
  }

  get frames() {
    return this.data[0].length
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

  get channels() {
    return this.data.length
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
    if (isNaN(divisor)) {
      var peak = this.findPeak()
      if (peak === null) {
        return
      }
      this.peakValue = peak.value
    }
    else {
      this.peakValue = divisor
    }


    for (var i = 0; i < this.data.length; ++i) {
      for (var j = 0; j < this.data[i].length; ++j) {
        this.data[i][j] /= this.peakValue
      }
    }
  }

  declick() {
    var fadeLength = 400
    for (var channel = 0; channel < this.data.length; ++channel) {
      var length = Math.min(fadeLength, this.data[channel].length)
      var coefficient = Math.pow(256, 1 / length)
      var gain = coefficient / 256
      for (var sample = 0, back = this.data[channel].length - 1;
        sample < length; ++sample, --back) {
        this.data[channel][sample] *= gain
        this.data[channel][back] *= gain
        gain *= coefficient
      }
    }
  }

  // resample(sourceRate, destRate) {
  //   for (var i = 0; i < this.data.length; ++i) {
  //     this.data[i] = Resampler.pass(this.data[i], sourceRate, destRate)
  //   }
  // }

  // Wave ファイルの出力。Node.js 上でのみ動作。
  // 2チャンネルのデータまで対応。
  // フォーマットは IEEE 32bit float で固定。
  // http://www-mmsp.ece.mcgill.ca/documents/audioformats/wave/wave.html
  static write(filename, audio, format) {
    if (audio.data.length <= 0 || audio.data.length > 2) {
      console.log("WaveFile Write failed: audio.data.length <= 0 || audio.data.length > 2.")
    }

    var buffer = this.arrayToBuffer(audio, format.channels)
    if (buffer === null) {
      console.log("WaveFile Write failed: buffer === null.")
    }

    var fs = require("fs")
    var wstream = fs.createWriteStream(filename)
    var int32 = Buffer.alloc(4)
    // ヘッダ。
    wstream.write(Buffer.from("RIFF", "ascii"))
    wstream.write(this.uint32buffer(50 + buffer.length))
    wstream.write(Buffer.from("WAVE", "ascii"))
    wstream.write(Buffer.from("fmt ", "ascii"))
    wstream.write(this.uint32buffer(18))
    wstream.write(this.uint16buffer(0x0003)) // IEEE 32bit float
    wstream.write(this.uint16buffer(format.channels))
    wstream.write(this.uint32buffer(format.sampleRate))
    wstream.write(this.uint32buffer(format.sampleRate * format.bytesPerFrame))
    wstream.write(this.uint16buffer(format.bytesPerFrame))
    wstream.write(this.uint16buffer(format.sampleSize))
    wstream.write(this.uint16buffer(0x0000))
    wstream.write(Buffer.from("fact", "ascii"))
    wstream.write(this.uint32buffer(4))
    wstream.write(this.uint32buffer(buffer.length / format.bytesPerFrame))
    wstream.write(Buffer.from("data", "ascii"))
    wstream.write(this.uint32buffer(buffer.length))
    // ヘッダ終わり。
    wstream.write(buffer)
    wstream.end()
  }

  static uint16buffer(value) {
    var uint16 = Buffer.alloc(2)
    uint16.writeInt16LE(value, 0)
    return uint16
  }

  static uint32buffer(value) {
    var uint32 = Buffer.alloc(4)
    uint32.writeInt32LE(value, 0)
    return uint32
  }

  // 複数チャンネルの Audio を Wave の並び順にフォーマットする。
  // いったん Uint8Array に直さないと Buffer.from() がうまくいかない。
  static arrayToBuffer(audio, channels) {
    audio.align()
    var float = new Float32Array(audio.left.length * channels)
    for (var i = 0, ic = 0; i < audio.left.length; ++i, ic += channels) {
      for (var j = 0; j < channels; ++j) {
        float[ic + j] = audio.data[j][i]
      }
    }
    return Buffer.from(new Uint8Array(float.buffer))
  }

  // write() で利用する format を生成。
  static fileFormat(sampleRate, sampleSize, channels) {
    return {
      sampleRate,
      sampleSize,
      channels,
      bytesPerFrame: channels * sampleSize / 8
    }
  }
}
