#include <emscripten/bind.h>
#include <emscripten/val.h>
#include <string>
#include <vector>

extern "C" {
#include <libavcodec/avcodec.h>
#include <libavformat/avformat.h>
#include <libavutil/channel_layout.h>
#include <libavutil/opt.h>
#include <libavutil/samplefmt.h>
#include <libswresample/swresample.h>
}

// Struct to represent decoded audio internally
struct DecodedAudio {
  std::vector<double> data;
  int channels = 0;
  int sample_rate = 0;

  int get_size() const { return data.size(); }
  int get_channels() const { return channels; }
  int get_sample_rate() const { return sample_rate; }
};

// C++ Helper to decode an audio file into Double-precision interleaved representation
DecodedAudio decode(const std::string &filepath) {
  DecodedAudio result;

  AVFormatContext *format_ctx = nullptr;
  if (avformat_open_input(&format_ctx, filepath.c_str(), nullptr, nullptr) < 0) {
    return result;
  }

  if (avformat_find_stream_info(format_ctx, nullptr) < 0) {
    avformat_close_input(&format_ctx);
    return result;
  }

  // Identify the best audio stream
  int audio_stream_idx = av_find_best_stream(format_ctx, AVMEDIA_TYPE_AUDIO, -1, -1, nullptr, 0);
  if (audio_stream_idx < 0) {
    avformat_close_input(&format_ctx);
    return result;
  }

  AVStream *stream = format_ctx->streams[audio_stream_idx];
  const AVCodec *codec = avcodec_find_decoder(stream->codecpar->codec_id);
  if (!codec) {
    avformat_close_input(&format_ctx);
    return result;
  }

  AVCodecContext *codec_ctx = avcodec_alloc_context3(codec);
  if (!codec_ctx) {
    avformat_close_input(&format_ctx);
    return result;
  }

  if (avcodec_parameters_to_context(codec_ctx, stream->codecpar) < 0) {
    avcodec_free_context(&codec_ctx);
    avformat_close_input(&format_ctx);
    return result;
  }

  if (avcodec_open2(codec_ctx, codec, nullptr) < 0) {
    avcodec_free_context(&codec_ctx);
    avformat_close_input(&format_ctx);
    return result;
  }

  // Set up Resampler only to convert the source format into DBL (keeps original sample rate)
  SwrContext *swr_ctx = swr_alloc();
  if (!swr_ctx) {
    avcodec_free_context(&codec_ctx);
    avformat_close_input(&format_ctx);
    return result;
  }

  AVChannelLayout out_ch_layout{};
  if (codec_ctx->ch_layout.nb_channels > 0) {
    av_channel_layout_copy(&out_ch_layout, &codec_ctx->ch_layout);
  } else {
    av_channel_layout_default(&out_ch_layout, 2); // Default to stereo
  }

  enum AVSampleFormat out_sample_fmt = AV_SAMPLE_FMT_DBL; // Double precision interleaved
  int source_sample_rate = codec_ctx->sample_rate;

  av_opt_set_chlayout(swr_ctx, "in_chlayout", &codec_ctx->ch_layout, 0);
  av_opt_set_int(swr_ctx, "in_sample_rate", source_sample_rate, 0);
  av_opt_set_sample_fmt(swr_ctx, "in_sample_fmt", codec_ctx->sample_fmt, 0);

  av_opt_set_chlayout(swr_ctx, "out_chlayout", &out_ch_layout, 0);
  av_opt_set_int(swr_ctx, "out_sample_rate", source_sample_rate, 0); // Preserve same sample rate
  av_opt_set_sample_fmt(swr_ctx, "out_sample_fmt", out_sample_fmt, 0);

  if (swr_init(swr_ctx) < 0) {
    swr_free(&swr_ctx);
    av_channel_layout_uninit(&out_ch_layout);
    avcodec_free_context(&codec_ctx);
    avformat_close_input(&format_ctx);
    return result;
  }

  int out_channels = out_ch_layout.nb_channels;
  result.channels = out_channels;
  result.sample_rate = source_sample_rate;

  AVPacket *packet = av_packet_alloc();
  AVFrame *frame = av_frame_alloc();

  // Decode & convert loop
  while (av_read_frame(format_ctx, packet) >= 0) {
    if (packet->stream_index == audio_stream_idx) {
      int ret = avcodec_send_packet(codec_ctx, packet);
      if (ret < 0)
        break;

      while (ret >= 0) {
        ret = avcodec_receive_frame(codec_ctx, frame);
        if (ret == AVERROR(EAGAIN) || ret == AVERROR_EOF) {
          break;
        } else if (ret < 0) {
          break;
        }

        int out_samples = swr_get_out_samples(swr_ctx, frame->nb_samples);
        if (out_samples <= 0)
          continue;

        uint8_t *out_data[1] = {nullptr};
        if (av_samples_alloc(out_data, nullptr, out_channels, out_samples, out_sample_fmt, 0) < 0) {
          break;
        }

        int converted = swr_convert(swr_ctx, out_data, out_samples, (const uint8_t **)frame->data,
                                    frame->nb_samples);
        if (converted > 0) {
          double *double_ptr = reinterpret_cast<double *>(out_data[0]);
          result.data.insert(result.data.end(), double_ptr,
                             double_ptr + (converted * out_channels));
        }

        av_freep(&out_data[0]);
      }
    }
    av_packet_unref(packet);
  }

  // Flush remaining samples in resampler
  int delay_samples = swr_get_out_samples(swr_ctx, 0);
  if (delay_samples > 0) {
    uint8_t *out_data[1] = {nullptr};
    if (av_samples_alloc(out_data, nullptr, out_channels, delay_samples, out_sample_fmt, 0) >= 0) {
      int converted = swr_convert(swr_ctx, out_data, delay_samples, nullptr, 0);
      if (converted > 0) {
        double *double_ptr = reinterpret_cast<double *>(out_data[0]);
        result.data.insert(result.data.end(), double_ptr, double_ptr + (converted * out_channels));
      }
      av_freep(&out_data[0]);
    }
  }

  av_packet_free(&packet);
  av_frame_free(&frame);
  swr_free(&swr_ctx);
  av_channel_layout_uninit(&out_ch_layout);
  avcodec_free_context(&codec_ctx);
  avformat_close_input(&format_ctx);

  return result;
}

// C++ Helper to resample double array
std::vector<double> resample(const std::vector<double> &input_data, int in_sample_rate, int out_sample_rate, int channels) {
  std::vector<double> output_data;
  if (input_data.empty() || channels <= 0) {
    return output_data;
  }

  SwrContext *swr_ctx = swr_alloc();
  if (!swr_ctx) {
    return output_data;
  }

  AVChannelLayout in_ch_layout{};
  av_channel_layout_default(&in_ch_layout, channels);
  AVChannelLayout out_ch_layout{};
  av_channel_layout_default(&out_ch_layout, channels);

  enum AVSampleFormat sample_fmt = AV_SAMPLE_FMT_DBL;

  av_opt_set_chlayout(swr_ctx, "in_chlayout", &in_ch_layout, 0);
  av_opt_set_int(swr_ctx, "in_sample_rate", in_sample_rate, 0);
  av_opt_set_sample_fmt(swr_ctx, "in_sample_fmt", sample_fmt, 0);

  av_opt_set_chlayout(swr_ctx, "out_chlayout", &out_ch_layout, 0);
  av_opt_set_int(swr_ctx, "out_sample_rate", out_sample_rate, 0);
  av_opt_set_sample_fmt(swr_ctx, "out_sample_fmt", sample_fmt, 0);

  if (swr_init(swr_ctx) < 0) {
    swr_free(&swr_ctx);
    av_channel_layout_uninit(&in_ch_layout);
    av_channel_layout_uninit(&out_ch_layout);
    return output_data;
  }

  int in_samples = input_data.size() / channels;
  int out_samples = swr_get_out_samples(swr_ctx, in_samples);

  uint8_t *in_data[1] = { const_cast<uint8_t*>(reinterpret_cast<const uint8_t*>(input_data.data())) };
  uint8_t *out_data[1] = { nullptr };

  if (av_samples_alloc(out_data, nullptr, channels, out_samples, sample_fmt, 0) >= 0) {
    int converted = swr_convert(swr_ctx, out_data, out_samples, (const uint8_t **)in_data, in_samples);
    if (converted > 0) {
      double *double_ptr = reinterpret_cast<double *>(out_data[0]);
      output_data.insert(output_data.end(), double_ptr, double_ptr + (converted * channels));
    }
    av_freep(&out_data[0]);
  }

  int delay_samples = swr_get_out_samples(swr_ctx, 0);
  if (delay_samples > 0) {
    uint8_t *out_data_flush[1] = { nullptr };
    if (av_samples_alloc(out_data_flush, nullptr, channels, delay_samples, sample_fmt, 0) >= 0) {
      int converted = swr_convert(swr_ctx, out_data_flush, delay_samples, nullptr, 0);
      if (converted > 0) {
        double *double_ptr = reinterpret_cast<double *>(out_data_flush[0]);
        output_data.insert(output_data.end(), double_ptr, double_ptr + (converted * channels));
      }
      av_freep(&out_data_flush[0]);
    }
  }

  swr_free(&swr_ctx);
  av_channel_layout_uninit(&in_ch_layout);
  av_channel_layout_uninit(&out_ch_layout);

  return output_data;
}

// Wrapper for JS `decode` returning an Object with metadata
emscripten::val decode_js(const std::string &filepath) {
  DecodedAudio audio = decode(filepath);
  emscripten::val result_obj = emscripten::val::object();

  if (audio.get_size() > 0) {
    emscripten::val view{ emscripten::typed_memory_view(audio.get_size(), audio.data.data()) };
    emscripten::val float_array = emscripten::val::global("Float64Array").new_(audio.get_size());
    float_array.call<void>("set", view);

    result_obj.set("data", float_array);
    result_obj.set("sampleRate", audio.get_sample_rate());
    result_obj.set("channels", audio.get_channels());
  } else {
    result_obj.set("data", emscripten::val::global("Float64Array").new_(0));
    result_obj.set("sampleRate", 0);
    result_obj.set("channels", 0);
  }

  return result_obj;
}

// Wrapper for JS `resample` converting a TypedArray input and returning Float64Array
emscripten::val resample_js(const emscripten::val &input_val, int in_sample_rate, int out_sample_rate, int channels) {
  std::vector<double> input_data = emscripten::convertJSArrayToNumberVector<double>(input_val);
  std::vector<double> output_data = resample(input_data, in_sample_rate, out_sample_rate, channels);

  if (!output_data.empty()) {
    emscripten::val view{ emscripten::typed_memory_view(output_data.size(), output_data.data()) };
    emscripten::val result = emscripten::val::global("Float64Array").new_(output_data.size());
    result.call<void>("set", view);
    return result;
  } else {
    return emscripten::val::global("Float64Array").new_(0);
  }
}

EMSCRIPTEN_BINDINGS(ffmpeg_audio_loader) {
  emscripten::function("decode", &decode_js);
  emscripten::function("resample", &resample_js);
}
