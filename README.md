# ffmpeg-cli

A lightweight Node.js CLI wrapper that provides `ffmpeg` and `ffprobe` for workflows like `yt-dlp`.

This package is useful when you want a portable FFmpeg-compatible command interface without depending on a system-installed ffmpeg binary.

## Recommended install

Install globally:

```bash
npm install -g ffmpeg-cli
```

After installation, the executables are available on your PATH:

```bash
ffmpeg -version
ffprobe -version
```

This means `yt-dlp` can usually find them automatically without needing any extra option:

```bash
yt-dlp "https://example.com/video"
```

## Local install

If you prefer a local install:

```bash
npm install ffmpeg-cli
```

Then add the local bin directory to your PATH:

```bash
export PATH="./node_modules/.bin:$PATH"
```

or call `yt-dlp` with the local location:

```bash
yt-dlp "https://example.com/video" --ffmpeg-location ./node_modules/.bin
```

## Example usage

Download a video:

```bash
yt-dlp "https://example.com/video"
```

Download and merge streams:

```bash
yt-dlp -f bestvideo+bestaudio --merge-output-format mp4 "https://example.com/video"
```

Extract audio:

```bash
ffmpeg -i input.mp4 -vn -acodec libmp3lame output.mp3
```

Inspect media metadata:

```bash
ffprobe input.mp4
```

## FFmpeg 4 light version

If you want the lighter FFmpeg 4-oriented build, use the `ffmpeg4` branch:

```bash
git checkout ffmpeg4
```

This branch is intended for users who want a simpler FFmpeg 4-based runtime profile.

## How it works

`ffmpeg-cli` exposes `ffmpeg` and `ffprobe` as standard command-line tools through a Node.js package. With a global install, they behave like normal ffmpeg utilities and work naturally with tools such as `yt-dlp`.

## Requirements

- Node.js 18+
- npm

## Repository

- GitHub: https://github.com/nagamuslim/ffmpeg-cli


