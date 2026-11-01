#!/usr/bin/env node
// ffprobe emulation: runs the REAL wasm ffmpeg on the file and parses its report. No invented data.
// Covers what yt-dlp calls: -version, -show_streams (flat), -show_format -show_streams -print_format json.
import { ensureHeap, createCore, stripFile, stage, checkBudget, banner, fs, path } from "../lib/core.mjs";
ensureHeap(import.meta.url);
const args = process.argv.slice(2);
if (args.includes("-version") || args.includes("-bsfs")) {   // yt-dlp runs `ffprobe -bsfs` only to read the version banner
  const { ff } = await createCore();
  process.stdout.write(banner(ff.version.core.raw).replace(/^ffmpeg version/, "ffprobe version")); process.exit(0);
}
const file = stripFile(args[args.length - 1] || "");
if (!file || !fs.existsSync(file)) { process.stderr.write(`${file}: No such file or directory\n`); process.exit(1); }
checkBudget(fs.statSync(file).size);
const { ff, lines } = await createCore();
stage(ff, file, "probe" + (path.extname(file) || ".bin"));
try { await ff.run("-i", "probe" + (path.extname(file) || ".bin")); } catch {}   // exits 1 by design (no output), as real ffmpeg

const fmt = { filename: file, nb_streams: 0, format_name: "", format_long_name: "", start_time: "0.000000", duration: undefined, size: String(fs.statSync(file).size), bit_rate: undefined, tags: {} };
const streams = []; let ctx = "none", cur = null, inInput = false;
for (const raw of lines) {
  let m;
  if ((m = raw.match(/^Input #0, ([^,]+(?:,[^,]+)*), from /))) { fmt.format_name = m[1]; inInput = true; continue; }
  if (!inInput) continue;
  if ((m = raw.match(/^\s*Duration: (\d+):(\d+):(\d+\.\d+)/))) { fmt.duration = (+m[1]*3600 + +m[2]*60 + +m[3]).toFixed(6); const b = raw.match(/bitrate: (\d+) kb\/s/); if (b) fmt.bit_rate = String(+b[1]*1000); ctx = "fmt"; continue; }
  if ((m = raw.match(/^\s*Stream #0:(\d+)(?:\[0x[0-9a-f]+\])?(?:\(([^)]*)\))?(?:, \d+, \d+\/\d+)?: (Video|Audio|Subtitle|Attachment|Data): ([\w\-]+)/))) {
    cur = { index: +m[1], codec_name: m[4].toLowerCase(), codec_type: m[3].toLowerCase(), tags: {}, disposition: { attached_pic: /\(attached pic\)/.test(raw) ? 1 : 0 } };
    if (m[2]) cur.tags.language = m[2];
    const wh = raw.match(/, (\d{2,5})x(\d{2,5})/); if (wh && cur.codec_type === "video") { cur.width = +wh[1]; cur.height = +wh[2]; }
    const sr = raw.match(/(\d+) Hz/); if (sr) cur.sample_rate = sr[1];
    const ch = raw.match(/Hz, (mono|stereo|\d(?:\.\d)?(?:\([^)]*\))?)/); if (ch) cur.channels = ({ mono: 1, stereo: 2 })[ch[1]] ?? ch[1];
    streams.push(cur); ctx = "stream"; continue;
  }
  if (/^\s*Metadata:/.test(raw)) { ctx = cur && ctx === "stream" ? "streamtags" : ctx === "fmt" || ctx === "none" ? "fmttags" : ctx; continue; }
  if ((m = raw.match(/^(\s+)([\w\-.]+)\s*: (.*)$/)) && (ctx === "fmttags" || ctx === "streamtags")) { (ctx === "fmttags" ? fmt.tags : cur.tags)[m[2]] = m[3]; }
}
fmt.nb_streams = streams.length;
if (args.includes("-print_format") && args[args.indexOf("-print_format") + 1] === "json" || args.includes("-of")) {
  const out = {}; if (args.includes("-show_streams")) out.streams = streams; if (args.includes("-show_format")) out.format = fmt;
  process.stdout.write(JSON.stringify(out, null, 2) + "\n");
} else if (args.includes("-show_streams")) {
  for (const s of streams) { process.stdout.write("[STREAM]\nindex=" + s.index + "\ncodec_name=" + s.codec_name + "\ncodec_type=" + s.codec_type + "\n" + (s.width ? `width=${s.width}\nheight=${s.height}\n` : "") + "[/STREAM]\n"); }
}
process.exit(streams.length ? 0 : 1);
