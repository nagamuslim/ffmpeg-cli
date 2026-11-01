# ffmpeg-cli

A lightweight Node.js CLI wrapper that provides `ffmpeg` and `ffprobe` for workflows like `yt-dlp`, backed by WebAssembly.

No native system compilation or system-installed FFmpeg binary is required.

## Installation

You can install either the modern **FFmpeg 9** engine or the lightweight **FFmpeg 4** engine via npm distribution tags.

### 1. FFmpeg 9 (Recommended / `latest`)

Backed by FFmpeg 9.0.2 compiled to Wasm with a real native `ffprobe`.

```bash
npm install -g @nagamuslim/ffmpeg-cli
```

You can also specify the `ffmpeg9` or `latest` tag explicitly:

```bash
npm install -g @nagamuslim/ffmpeg-cli@ffmpeg9
# or
npm install -g @nagamuslim/ffmpeg-cli@latest
```

### 2. FFmpeg 4 (Lightweight / `ffmpeg4`)

Backed by FFmpeg 4.3 with a lighter memory profile.

```bash
npm install -g @nagamuslim/ffmpeg-cli@ffmpeg4
```

---

## Verifying Installation

After installing globally, `ffmpeg` and `ffprobe` will be available directly on your PATH:

```bash
ffmpeg -version
ffprobe -version
```

This allows tools like `yt-dlp` to detect and use them automatically:

```bash
yt-dlp "https://example.com/video"
```

---

## Local Installation

If you prefer installing locally within a project:

```bash
npm install @nagamuslim/ffmpeg-cli
```

Then reference the binaries from `./node_modules/.bin`:

```bash
export PATH="./node_modules/.bin:$PATH"
yt-dlp "https://example.com/video" --ffmpeg-location ./node_modules/.bin
```

---

## Example Usage

- **Download and merge streams with yt-dlp:**
  ```bash
  yt-dlp -f bestvideo+bestaudio --merge-output-format mp4 "https://example.com/video"
  ```

- **Extract audio to MP3:**
  ```bash
  ffmpeg -i input.mp4 -vn -acodec libmp3lame output.mp3
  ```

- **Inspect media stream metadata:**
  ```bash
  ffprobe input.mp4
  ```

---

## Requirements

- Node.js 18+
- npm

## Repository

- GitHub: https://github.com/nagamuslim/ffmpeg-cli
