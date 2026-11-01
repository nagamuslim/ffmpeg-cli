// Shared helpers for the ffmpeg / ffprobe launchers (wasm core: @ffmpeg.wasm/core-st).
import { FFmpeg } from "@ffmpeg.wasm/main";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import v8 from "node:v8";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export const MAX_MB = Number(process.env.FFMPEG_WASM_MAX_MB || 1500);
export const isUrl = (s) => /^[a-z][a-z0-9+.-]*:\/\//i.test(s) && !/^file:/i.test(s);
export const stripFile = (s) => s.replace(/^file:(\/\/)?/i, "");

// One core instance == one command (a failed run can corrupt the wasm heap, so we never reuse it).
export async function createCore() {
  const lines = [];
  const ff = await FFmpeg.create({ core: "@ffmpeg.wasm/core-st", log: true });
  ff.setLogger((_t, m) => { if (typeof m === "string") lines.push(m); });
  return { ff, lines };
}
export function stage(ff, real, virt) { ff.fs.writeFile(virt, fs.readFileSync(real)); }

export function checkBudget(bytes) {
  const need = (bytes * 5.5) / 1048576; // measured: 100 MB merge peaked at ~518 MB RSS (≈5.1x)
  if (need > MAX_MB) {
    process.stderr.write(`ffmpeg-wasm: inputs ${(bytes/1048576).toFixed(0)} MB -> est. ${need.toFixed(0)} MB RAM, limit ${MAX_MB} MB (override: FFMPEG_WASM_MAX_MB). Use native ffmpeg for files this large.\n`);
    process.exit(1);
  }
}
// The core logs at debug level; hide option-parsing/probing noise when we have to show diagnostics.
const NOISE = /^(Splitting the commandline|Reading option|Finished splitting|Parsing a group|Applying option|Successfully parsed|Opening|Setting default|Probing|Format .* probed|st:\d|Before avformat|After avformat|nal_unit|\[|Warning: not compiled with thread)/;
export const quiet = (lines) => lines.filter((l) => l.trim() && !NOISE.test(l));
export { fs, path };

// `-version` text as the real tool prints it: banner + config + lib versions, without the core's debug chatter.
export function banner(raw) {
  const out = []; for (const l of raw.split("\n")) { out.push(l); if (/^libpostproc/.test(l)) break; }
  return out.join("\n") + "\n";
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
