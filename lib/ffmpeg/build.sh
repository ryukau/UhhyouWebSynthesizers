#!/usr/bin/env bash
set -e

# Adjust path to your compiled FFmpeg directory
FFMPEG_DIR="./ffmpeg"

if [ ! -d "$FFMPEG_DIR" ]; then
  echo "Error: FFmpeg directory '$FFMPEG_DIR' not found."
  echo "Please download the FFmpeg source code and extract it to '$FFMPEG_DIR'."
  exit 1
fi

if [ ! -f "$FFMPEG_DIR/config.h" ]; then
  echo "--> Config.h not found. Running FFmpeg configure step..."
  cd "$FFMPEG_DIR"
  emconfigure ./configure \
    --cc=emcc --cxx=em++ --ar=emar --ranlib=emranlib \
    --target-os=none --arch=x86_32 --enable-cross-compile \
    --disable-asm --disable-programs --disable-doc --disable-debug --disable-stripping \
    --enable-static --disable-shared \
    --enable-avcodec --enable-avformat --enable-swresample --enable-avutil
  cd ..
else
  echo "--> FFmpeg configuration detected. Skipping configure."
fi

LIBAVFORMAT="$FFMPEG_DIR/libavformat/libavformat.a"
LIBAVCODEC="$FFMPEG_DIR/libavcodec/libavcodec.a"
LIBSWRESAMPLE="$FFMPEG_DIR/libswresample/libswresample.a"
LIBAVUTIL="$FFMPEG_DIR/libavutil/libavutil.a"

if [ ! -f "$LIBAVFORMAT" ] || [ ! -f "$LIBAVCODEC" ] || [ ! -f "$LIBSWRESAMPLE" ] || [ ! -f "$LIBAVUTIL" ]; then
  echo "--> Missing static libraries. Compiling FFmpeg..."
  cd "$FFMPEG_DIR"

  NPROC=$(nproc 2>/dev/null || sysctl -n hw.ncpu 2>/dev/null || echo 1)

  emmake make -j"$NPROC"
  cd ..
else
  echo "--> FFmpeg static libraries are already built. Skipping compile."
fi

echo "--> Compiling WebAssembly audio loader module..."
em++ -O3 -std=c++20 main.cpp \
  -I${FFMPEG_DIR} \
  -L${FFMPEG_DIR}/libavformat -lavformat \
  -L${FFMPEG_DIR}/libavcodec -lavcodec \
  -L${FFMPEG_DIR}/libswresample -lswresample \
  -L${FFMPEG_DIR}/libavutil -lavutil \
  -lembind \
  -s FORCE_FILESYSTEM=1 \
  -s ALLOW_MEMORY_GROWTH=1 \
  -s MODULARIZE=1 \
  -s EXPORT_ES6=1 \
  -s EXPORT_NAME="createFFmpegModule" \
  -s EXPORTED_RUNTIME_METHODS='["FS", "HEAPF64"]' \
  -o ffmpeg.js

echo "--> Build completed."
