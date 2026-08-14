#include <algorithm>
#include <cstdint>
#include <cstdlib>
#include <emscripten/bind.h>
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

struct DecodeResult {
  uintptr_t data_ptr = 0;
  size_t total_samples = 0;
  int sample_rate = 0;
  int channels = 0;
  std::string error;
};

struct ResampleResult {
  uintptr_t data_ptr = 0;
  size_t total_samples = 0;
  std::string error;
};

// Allocate memory on the WebAssembly heap
uintptr_t alloc_buffer(size_t num_doubles) {
  return reinterpret_cast<uintptr_t>(malloc(num_doubles * sizeof(double)));
}

// Free memory on the WebAssembly heap
void free_buffer(uintptr_t ptr) {
  if (ptr) { free(reinterpret_cast<void *>(ptr)); }
}

// Decodes audio using chunked block allocation to prevent heap fragmentation
DecodeResult decode_direct(const std::string &filepath) {
  DecodeResult result;

  AVFormatContext *format_ctx = nullptr;
  if (avformat_open_input(&format_ctx, filepath.c_str(), nullptr, nullptr) < 0) {
    result.error = "Failed to open input file in FFmpeg.";
    return result;
  }

  if (avformat_find_stream_info(format_ctx, nullptr) < 0) {
    avformat_close_input(&format_ctx);
    result.error = "Failed to find stream information.";
    return result;
  }

  int audio_stream_idx = av_find_best_stream(format_ctx, AVMEDIA_TYPE_AUDIO, -1, -1, nullptr, 0);
  if (audio_stream_idx < 0) {
    avformat_close_input(&format_ctx);
    result.error = "No audio stream found in the file.";
    return result;
  }

  AVStream *stream = format_ctx->streams[audio_stream_idx];
  const AVCodec *codec = avcodec_find_decoder(stream->codecpar->codec_id);
  if (!codec) {
    avformat_close_input(&format_ctx);
    result.error = "Decoder codec not found.";
    return result;
  }

  AVCodecContext *codec_ctx = avcodec_alloc_context3(codec);
  if (!codec_ctx) {
    avformat_close_input(&format_ctx);
    result.error = "Memory allocation failed while allocating codec context.";
    return result;
  }

  if (avcodec_parameters_to_context(codec_ctx, stream->codecpar) < 0) {
    avcodec_free_context(&codec_ctx);
    avformat_close_input(&format_ctx);
    result.error = "Failed to copy codec parameters to context.";
    return result;
  }

  if (avcodec_open2(codec_ctx, codec, nullptr) < 0) {
    avcodec_free_context(&codec_ctx);
    avformat_close_input(&format_ctx);
    result.error = "Failed to open audio codec.";
    return result;
  }

  SwrContext *swr_ctx = swr_alloc();
  if (!swr_ctx) {
    avcodec_free_context(&codec_ctx);
    avformat_close_input(&format_ctx);
    result.error = "Memory allocation failed while allocating SwrContext.";
    return result;
  }

  AVChannelLayout out_ch_layout{};
  if (codec_ctx->ch_layout.nb_channels > 0) {
    av_channel_layout_copy(&out_ch_layout, &codec_ctx->ch_layout);
  } else {
    av_channel_layout_default(&out_ch_layout, 2);
  }

  enum AVSampleFormat out_sample_fmt = AV_SAMPLE_FMT_DBL;
  int source_sample_rate
    = codec_ctx->sample_rate > 0 ? codec_ctx->sample_rate : stream->codecpar->sample_rate;

  av_opt_set_chlayout(swr_ctx, "in_chlayout", &codec_ctx->ch_layout, 0);
  av_opt_set_int(swr_ctx, "in_sample_rate", source_sample_rate, 0);
  av_opt_set_sample_fmt(swr_ctx, "in_sample_fmt", codec_ctx->sample_fmt, 0);

  av_opt_set_chlayout(swr_ctx, "out_chlayout", &out_ch_layout, 0);
  av_opt_set_int(swr_ctx, "out_sample_rate", source_sample_rate, 0);
  av_opt_set_sample_fmt(swr_ctx, "out_sample_fmt", out_sample_fmt, 0);

  if (swr_init(swr_ctx) < 0) {
    swr_free(&swr_ctx);
    av_channel_layout_uninit(&out_ch_layout);
    avcodec_free_context(&codec_ctx);
    avformat_close_input(&format_ctx);
    result.error = "Failed to initialize audio resampler.";
    return result;
  }

  int out_channels = out_ch_layout.nb_channels;
  result.channels = out_channels;
  result.sample_rate = source_sample_rate;

  AVPacket *packet = av_packet_alloc();
  AVFrame *frame = av_frame_alloc();

  // Accumulate frames in small, fixed-size chunks to eliminate massive vector reallocations
  std::vector<std::vector<double>> chunks;
  size_t total_samples_accumulated = 0;
  bool alloc_failed = false;

  auto convert_and_append_frame = [&](AVFrame *src_frame) {
    if (alloc_failed) { return; }
    int out_samples = swr_get_out_samples(swr_ctx, src_frame->nb_samples);
    if (out_samples <= 0) { return; }

    uint8_t *out_data[1] = {nullptr};
    if (av_samples_alloc(out_data, nullptr, out_channels, out_samples, out_sample_fmt, 0) < 0) {
      alloc_failed = true;
      return;
    }

    int converted = swr_convert(
      swr_ctx, out_data, out_samples, (const uint8_t **)src_frame->data, src_frame->nb_samples);
    if (converted > 0) {
      size_t count = static_cast<size_t>(converted * out_channels);
      double *double_ptr = reinterpret_cast<double *>(out_data[0]);
      try {
        chunks.emplace_back(double_ptr, double_ptr + count);
        total_samples_accumulated += count;
      } catch (const std::bad_alloc &) { alloc_failed = true; }
    }
    av_freep(&out_data[0]);
  };

  while (!alloc_failed && av_read_frame(format_ctx, packet) >= 0) {
    if (packet->stream_index == audio_stream_idx) {
      int ret = avcodec_send_packet(codec_ctx, packet);
      if (ret >= 0) {
        while (ret >= 0) {
          ret = avcodec_receive_frame(codec_ctx, frame);
          if (ret == AVERROR(EAGAIN) || ret == AVERROR_EOF) {
            break;
          } else if (ret < 0) {
            break;
          }
          convert_and_append_frame(frame);
          if (alloc_failed) { break; }
        }
      }
    }
    av_packet_unref(packet);
  }

  if (!alloc_failed) {
    avcodec_send_packet(codec_ctx, nullptr);
    while (avcodec_receive_frame(codec_ctx, frame) >= 0) {
      convert_and_append_frame(frame);
      if (alloc_failed) { break; }
    }
  }

  if (!alloc_failed) {
    int delay_samples = swr_get_out_samples(swr_ctx, 0);
    if (delay_samples > 0) {
      uint8_t *out_data[1] = {nullptr};
      if (av_samples_alloc(out_data, nullptr, out_channels, delay_samples, out_sample_fmt, 0) >= 0)
      {
        int converted = swr_convert(swr_ctx, out_data, delay_samples, nullptr, 0);
        if (converted > 0) {
          size_t count = static_cast<size_t>(converted * out_channels);
          double *double_ptr = reinterpret_cast<double *>(out_data[0]);
          try {
            chunks.emplace_back(double_ptr, double_ptr + count);
            total_samples_accumulated += count;
          } catch (const std::bad_alloc &) { alloc_failed = true; }
        }
        av_freep(&out_data[0]);
      }
    }
  }

  av_packet_free(&packet);
  av_frame_free(&frame);
  swr_free(&swr_ctx);
  av_channel_layout_uninit(&out_ch_layout);
  avcodec_free_context(&codec_ctx);
  avformat_close_input(&format_ctx);

  if (alloc_failed || total_samples_accumulated == 0) {
    result.error = "Memory allocation failed: decoded audio data is too large.";
    return result;
  }

  // Allocate single contiguous output block directly in Wasm heap
  double *flat_buf = static_cast<double *>(malloc(total_samples_accumulated * sizeof(double)));
  if (!flat_buf) {
    result.error = "Memory allocation failed for final decoded buffer (size too large).";
    return result;
  }

  // Copy chunk-by-chunk and release chunk memory immediately
  size_t offset = 0;
  for (auto &chunk : chunks) {
    std::copy(chunk.begin(), chunk.end(), flat_buf + offset);
    offset += chunk.size();
    chunk.clear();
    chunk.shrink_to_fit();
  }

  result.data_ptr = reinterpret_cast<uintptr_t>(flat_buf);
  result.total_samples = total_samples_accumulated;
  return result;
}

// Zero-copy streaming resampler processing directly between raw heap pointers
ResampleResult resample_direct(
  uintptr_t in_ptr, size_t in_samples, int in_sample_rate, int out_sample_rate, int channels) {
  ResampleResult result;
  if (in_ptr == 0 || in_samples == 0 || channels <= 0) { return result; }

  SwrContext *swr_ctx = swr_alloc();
  if (!swr_ctx) {
    result.error = "Memory allocation failed while allocating SwrContext.";
    return result;
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
    result.error = "Failed to initialize resampler.";
    return result;
  }

  int64_t in_frames = static_cast<int64_t>(in_samples / channels);
  int64_t max_out_frames = swr_get_out_samples(swr_ctx, in_frames) + 16384;
  int64_t max_out_samples = max_out_frames * channels;

  // Allocate exact output buffer in Wasm heap
  double *out_buf = static_cast<double *>(malloc(max_out_samples * sizeof(double)));
  if (!out_buf) {
    swr_free(&swr_ctx);
    av_channel_layout_uninit(&in_ch_layout);
    av_channel_layout_uninit(&out_ch_layout);
    result.error = "Memory allocation failed for resampled output buffer (size too large).";
    return result;
  }

  const double *in_buf = reinterpret_cast<const double *>(in_ptr);

  // Stream in 16k frame blocks directly to destination buffer without intermediate vector
  // allocations
  int64_t converted_frames_total = 0;
  const int64_t chunk_frames = 16384;
  int64_t in_frames_processed = 0;

  while (in_frames_processed < in_frames) {
    int64_t cur_in_frames = std::min(chunk_frames, in_frames - in_frames_processed);
    const uint8_t *in_data[1]
      = {reinterpret_cast<const uint8_t *>(in_buf + (in_frames_processed * channels))};

    int64_t out_space_frames = max_out_frames - converted_frames_total;
    uint8_t *out_data[1]
      = {reinterpret_cast<uint8_t *>(out_buf + (converted_frames_total * channels))};

    int converted = swr_convert(
      swr_ctx, out_data, static_cast<int>(out_space_frames), in_data,
      static_cast<int>(cur_in_frames));
    if (converted < 0) {
      free(out_buf);
      swr_free(&swr_ctx);
      av_channel_layout_uninit(&in_ch_layout);
      av_channel_layout_uninit(&out_ch_layout);
      result.error = "Error occurred during audio resampling conversion.";
      return result;
    }
    converted_frames_total += converted;
    in_frames_processed += cur_in_frames;
  }

  // Drain remaining samples in resampler
  int64_t out_space_frames = max_out_frames - converted_frames_total;
  if (out_space_frames > 0) {
    uint8_t *out_data[1]
      = {reinterpret_cast<uint8_t *>(out_buf + (converted_frames_total * channels))};
    int converted = swr_convert(swr_ctx, out_data, static_cast<int>(out_space_frames), nullptr, 0);
    if (converted > 0) { converted_frames_total += converted; }
  }

  swr_free(&swr_ctx);
  av_channel_layout_uninit(&in_ch_layout);
  av_channel_layout_uninit(&out_ch_layout);

  result.data_ptr = reinterpret_cast<uintptr_t>(out_buf);
  result.total_samples = static_cast<size_t>(converted_frames_total * channels);
  return result;
}

EMSCRIPTEN_BINDINGS(ffmpeg_audio_loader) {
  emscripten::value_object<DecodeResult>("DecodeResult")
    .field("data_ptr", &DecodeResult::data_ptr)
    .field("total_samples", &DecodeResult::total_samples)
    .field("sample_rate", &DecodeResult::sample_rate)
    .field("channels", &DecodeResult::channels)
    .field("error", &DecodeResult::error);

  emscripten::value_object<ResampleResult>("ResampleResult")
    .field("data_ptr", &ResampleResult::data_ptr)
    .field("total_samples", &ResampleResult::total_samples)
    .field("error", &ResampleResult::error);

  emscripten::function("alloc_buffer", &alloc_buffer);
  emscripten::function("free_buffer", &free_buffer);
  emscripten::function("decode_direct", &decode_direct);
  emscripten::function("resample_direct", &resample_direct);
}
