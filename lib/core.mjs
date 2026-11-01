// Shared helpers for the ffmpeg / ffprobe launchers (wasm core: @ffmpeg.wasm/core-st).
import { FFmpeg } from "@project516/ffmpeg-wasm";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import v8 from "node:v8";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export const MAX_MB = Number(process.env.FFMPEG_WASM_MAX_MB || 1500);
export const isUrl = (s) => /^[a-z][a-z0-9+.-]*:\/\//i.test(s) && !/^file:/i.test(s);
export const stripFile = (s) => s.replace(/^file:(\/\/)?/i, "");

// One core instance == one command. Adapter keeps the old shape: ff.run(...args) -> exit code, ff.fs.writeFile/readFile.
export async function createCore(onLine) {
  const lines = []; let live = !!onLine;
  const raw = new FFmpeg();
  raw.on("log", ({ message }) => { lines.push(message); if (live && message.trim() && !NOISE.test(message)) onLine(message); });
  await raw.load();   // the repo's own loader: resolves @project516/ffmpeg-wasm-core from node_modules (no CDN, no paths to maintain)
  pruneDuplicate();
  const ff = {
    run: (...a) => raw.exec(a),
    ffprobe: (a) => raw.ffprobe(a),            // real ffprobe.c compiled into the same wasm
    fs: { writeFile: (n, d) => raw.writeFile(n, d), readFile: (n) => raw.readFile(n) },
    versionText: async () => { const was = live; live = false; const k = lines.length; await raw.exec(["-version"]); const t = lines.slice(k); lines.length = k; live = was; return t.join("\n") + "\n"; },
  };
  return { ff, lines };
}
export async function stage(ff, real, virt) { await ff.fs.writeFile(virt, new Uint8Array(fs.readFileSync(real))); }

export function checkBudget(bytes) {
  const need = (bytes * 8) / 1048576; // measured on this core: 100 MB merge ~670 MB, thumbnail embed ~750 MB peak RSS (≈7.4x)
  if (need > MAX_MB) {
    process.stderr.write(`ffmpeg-wasm: inputs ${(bytes/1048576).toFixed(0)} MB -> est. ${need.toFixed(0)} MB RAM, limit ${MAX_MB} MB (override: FFMPEG_WASM_MAX_MB). Use native ffmpeg for files this large.\n`);
    process.exit(1);
  }
}
// The core logs at debug level; hide option-parsing/probing noise when we have to show diagnostics.
const NOISE = /^(Exiting with exit code|Splitting the commandline|Reading option|Finished splitting|Parsing a group|Applying option|Successfully parsed|Opening|Setting default|Probing|Format .* probed|st:\d|Before avformat|After avformat|nal_unit|\[|Warning: not compiled with thread)/;
export const quiet = (lines) => lines.filter((l) => l.trim() && !NOISE.test(l));
export { fs, path };

// `-version` text as the real tool prints it: banner + config + lib versions, without the core's debug chatter.
export function banner(raw) {
  // FFmpeg 9 dropped libpostproc, so cut after the LAST "libXXX  n. n. n / ..." line instead of a fixed one.
  const L = raw.split("\n"); let last = -1;
  L.forEach((l, i) => { if (/^\s*lib[a-z]+\s+\d+\.\s*\d+\.\s*\d+/.test(l)) last = i; });
  return (last >= 0 ? L.slice(0, last + 1) : quiet(L)).join("\n") + "\n";
}

// Raise Node's heap cap (to min(4096 MB, 75% of RAM)) by re-running ourselves once. Precaution for low default caps on phones;
// disable with FFWASM_NO_REEXEC=1. NOT proven necessary: in my sandbox a 100 MB merge ran fine with a 64 MB cap, with or without this.
export function ensureHeap(entryUrl) {
  if (process.env.FFWASM_CHILD || process.env.FFWASM_NO_REEXEC) return;
  const want = Math.min(4096, Math.floor((os.totalmem() / 1048576) * 0.75));
  const have = v8.getHeapStatistics().heap_size_limit / 1048576;
  if (have >= want * 0.9) return;
  const r = spawnSync(process.execPath, [`--max-old-space-size=${want}`, fileURLToPath(entryUrl), ...process.argv.slice(2)],
    { stdio: "inherit", env: { ...process.env, FFWASM_CHILD: "1" } });
  if (r.error) return;                     // could not spawn: just continue in this process
  process.exit(r.status ?? 1);
}

// One-time housekeeping, no npm install script needed (npm 12 blocks those by default): the core package ships its 38 MB
// .wasm twice (dist/esm and dist/umd). Node only uses esm, so delete umd. Skip with FFWASM_KEEP_UMD=1; failures are ignored.
function pruneDuplicate() {
  if (process.env.FFWASM_KEEP_UMD) return;
  try {
    const esm = fileURLToPath(import.meta.resolve("@project516/ffmpeg-wasm-core"));   // .../dist/esm/ffmpeg-core.js
    const umd = path.join(path.dirname(esm), "..", "umd");
    if (path.basename(path.dirname(esm)) === "esm" && fs.existsSync(umd)) fs.rmSync(umd, { recursive: true, force: true });
  } catch {}
}

// Streams core log lines to stderr like real ffmpeg/ffprobe. The core already filters by -v/-loglevel (checked: quiet/error/warning
// print nothing, info 40 lines, verbose 43, debug 157 for one ffprobe call). Progress lines ("frame=... speed=0.87x") use \r on a terminal.
export function livePrinter(rename = (m) => m) {
  const tty = process.stderr.isTTY; let inProgress = false;
  const p = (raw) => {
    const m = rename(raw);
    if (/^\s*(frame=|size=)/.test(m)) { process.stderr.write((tty ? "\r" : "") + m.replace(/\s+$/, "") + (tty ? "" : "\n")); inProgress = tty; return; }
    if (inProgress) { process.stderr.write("\n"); inProgress = false; }
    process.stderr.write(m + "\n");
  };
  p.finish = () => { if (inProgress) { process.stderr.write("\n"); inProgress = false; } };
  return p;
}
