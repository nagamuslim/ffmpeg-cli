#!/usr/bin/env node
import { ensureHeap, createCore, livePrinter, isUrl, stripFile, stage, checkBudget, quiet, banner, fs, path } from "../lib/core.mjs";
ensureHeap(import.meta.url);
const args = process.argv.slice(2);

if (args.includes("-version")) { const { ff } = await createCore(); process.stdout.write(banner(await ff.versionText())); process.exit(0); }
if (!args.length || args.some((a) => ["-h", "-help", "--help"].includes(a))) {   // usage text comes from the real core
  const { ff, lines } = await createCore(); try { await ff.run(args.length ? "-h" : "-h"); } catch {}
  process.stdout.write(quiet(lines).join("\n") + "\n"); process.exit(args.length ? 0 : 1);
}

const inputs = []; let out = null; const rewritten = []; let lastConsumed = false;
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === "-i" && args[i - 2] === "-f" && args[i - 1] === "lavfi") { rewritten.push(a, args[++i]); if (i === args.length - 1) lastConsumed = true; continue; }  // synthetic source, not a file
  if ((a === "-i" || a === "-attach") && i + 1 < args.length) {
    const real = stripFile(args[++i]); if (i === args.length - 1) lastConsumed = true;
    if (isUrl(real) || real === "-" || real.startsWith("pipe:")) {
      process.stderr.write(`ffmpeg-wasm: input '${real}' unsupported (wasm core: no network/pipe access).\n`); process.exit(1);
    }
    const v = `${a === "-i" ? "in" : "att"}_${inputs.length}${path.extname(real) || ".bin"}`;
    inputs.push({ real, v }); rewritten.push(a, v);
  } else rewritten.push(a);
}
const last = args[args.length - 1];
if (args.length && !lastConsumed && !last.startsWith("-") && !isUrl(last) && last !== "pipe:1") {
  const real = stripFile(last), v = "out" + (path.extname(real) || ".mkv");
  out = { real, v }; rewritten[rewritten.length - 1] = v;
}
for (const a of inputs) if (!fs.existsSync(a.real)) { process.stderr.write(`${a.real}: No such file or directory\n`); process.exit(1); }
checkBudget(inputs.reduce((s, a) => s + fs.statSync(a.real).size, 0));

const printer = process.env.FFWASM_QUIET ? null : livePrinter();
const { ff, lines } = await createCore(printer);
if (args.includes("-bsfs")) {            // yt-dlp reads banner + filter list from stdout
  try { await ff.run("-bsfs"); } catch {}
  const i = lines.findIndex((l) => /^Bitstream filters:/.test(l));
  process.stdout.write((await ff.versionText()).split("\n").slice(0, 1).join("\n") + "\n" + lines.slice(i).filter((l)=>l.trim()).join("\n") + "\n");
  process.exit(0);
}
for (const a of inputs) await stage(ff, a.real, a.v);
let code = 1;
try { code = await ff.run(...rewritten); } catch (e) { const m = `core error: ${e?.message || e}`; lines.push(m); printer?.(m); code = 1; }
if (code === 0 && out) {
  try { fs.writeFileSync(out.real, await ff.fs.readFile(out.v)); }
  catch { const m = `no output produced for ${out.real}`; lines.push(m); printer?.(m); code = 1; }
}
printer?.finish();
if (code !== 0 && !printer) process.stderr.write(quiet(lines).slice(-15).join("\n") + "\n");
process.exit(code);
