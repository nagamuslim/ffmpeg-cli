#!/usr/bin/env node
// REAL ffprobe (ffprobe.c is compiled into the FFmpeg 9.0.2 wasm core). Arguments pass straight through; only the input file is
// staged into the wasm filesystem (under a neutral name, restored in the output) and the report is read back via -o.
import { ensureHeap, createCore, livePrinter, stripFile, stage, checkBudget, quiet, banner, fs, path } from "../lib/core.mjs";
ensureHeap(import.meta.url);
const args = process.argv.slice(2);
const LISTING = ["-h", "-help", "--help", "-L", "-license", "-formats", "-muxers", "-demuxers", "-devices", "-codecs", "-decoders", "-encoders", "-protocols", "-filters", "-pix_fmts", "-layouts", "-sample_fmts", "-colors"];
const VERSIONS = ["-show_versions", "-show_program_version", "-show_library_versions", "-show_pixel_formats"];   // valid without an input file

if (args.includes("-version") || args.includes("-bsfs")) {   // yt-dlp runs `ffprobe -bsfs` only to read the version banner
  const { ff } = await createCore();
  process.stdout.write(banner(await ff.versionText()).replace(/^ffmpeg version/, "ffprobe version")); process.exit(0);
}
if (args.some((a) => LISTING.includes(a)) || !args.length) {  // help / capability listings print through the core's log, no input file
  const { ff, lines } = await createCore();
  try { await ff.ffprobe(args.length ? args : ["-h"]); } catch {}
  const L = quiet(lines).map((l) => l.replace(/^ffmpeg version/, "ffprobe version")); let last = -1;
  L.forEach((l, i) => { if (/^\s*lib[a-z]+\s+\d+\.\s*\d+\.\s*\d+/.test(l)) last = i; });
  if (!args.includes("-hide_banner") && last >= 0) process.stderr.write(L.slice(0, last + 1).join("\n") + "\n");   // banner -> stderr
  process.stdout.write(L.slice(last + 1).join("\n") + "\n"); process.exit(args.length ? 0 : 1);                    // listing -> stdout
}

const given = args[args.length - 1] || "";
const file = stripFile(given);
const noInput = args.some((a) => VERSIONS.includes(a)) && !fs.existsSync(file);
if (!noInput && (!file || !fs.existsSync(file))) { process.stderr.write(`${file}: No such file or directory\n`); process.exit(1); }
if (!noInput) checkBudget(fs.statSync(file).size);
const virt = "ffwasm_input" + (path.extname(file) || ".bin");   // only the extension: spaces/brackets/CJK never reach the core
const rename = (m) => m.split(virt).join(given).replace(/^ffmpeg version/, "ffprobe version");
const printer = process.env.FFWASM_QUIET ? null : livePrinter(rename);
const { ff, lines } = await createCore(printer);
if (!noInput) await stage(ff, file, virt);
let ret = 1;
try { ret = await ff.ffprobe([...(noInput ? args : [...args.slice(0, -1), virt]), "-o", "ffwasm_out.txt"]); }
catch (e) { const m = `core error: ${e?.message || e}`; lines.push(m); printer?.(m); }
let text = ""; try { text = Buffer.from(await ff.fs.readFile("ffwasm_out.txt")).toString("utf8"); } catch {}
const fi = Math.max(args.lastIndexOf("-of"), args.lastIndexOf("-print_format"), args.lastIndexOf("-output_format"));
const fmt = fi >= 0 ? args[fi + 1] || "" : "";
const esc = /^json/.test(fmt) ? (s) => JSON.stringify(s).slice(1, -1) : /^xml/.test(fmt) ? (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;") : (s) => s;
if (!noInput) text = text.split(virt).join(esc(given));
process.stdout.write(text);
printer?.finish();
if (ret === 1 && !printer) process.stderr.write(quiet(lines).slice(-15).join("\n") + "\n");
process.exit(ret === 1 ? 1 : 0);   // measured: 0 on success (even with empty output), 1 on failure
