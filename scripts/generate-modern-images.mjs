import { promises as fs } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

const ROOT = process.cwd();
const CONTENT_DIR = path.join(ROOT, "content");
const SKIPPED_DIRS = new Set([path.join(CONTENT_DIR, "photos")]);
const SOURCE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg"]);
const FORCE = process.argv.includes("--force");

const AVIF_QUALITY = process.env.IMAGE_AVIF_QUALITY || "80";
const AVIF_SPEED = process.env.IMAGE_AVIF_SPEED || "0";
const WEBP_QUALITY = process.env.IMAGE_WEBP_QUALITY || "80";

async function commandExists(command) {
  return new Promise((resolve) => {
    const child = spawn("sh", ["-c", `command -v ${command}`], { stdio: "ignore" });
    child.on("close", (code) => resolve(code === 0));
  });
}

async function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit" });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${command} ${args.join(" ")} exited ${code}`));
    });
  });
}

async function* walk(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIPPED_DIRS.has(fullPath)) continue;
      yield* walk(fullPath);
      continue;
    }

    if (entry.isFile() && SOURCE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
      yield fullPath;
    }
  }
}

async function shouldWrite(source, output) {
  if (FORCE) return true;

  const [sourceStat, outputStat] = await Promise.all([
    fs.stat(source),
    fs.stat(output).catch(() => null),
  ]);

  return !outputStat || outputStat.mtimeMs < sourceStat.mtimeMs;
}

async function encodeImage(source) {
  const parsed = path.parse(source);
  const avif = path.join(parsed.dir, `${parsed.name}.avif`);
  const webp = path.join(parsed.dir, `${parsed.name}.webp`);

  if (await shouldWrite(source, avif)) {
    await run("avifenc", [
      "--quiet",
      "--yuv",
      "444",
      "--qcolor",
      AVIF_QUALITY,
      "--qalpha",
      AVIF_QUALITY,
      "--speed",
      AVIF_SPEED,
      "--jobs",
      "all",
      source,
      avif,
    ]);
  }

  if (await shouldWrite(source, webp)) {
    await run("cwebp", [
      "-quiet",
      "-q",
      WEBP_QUALITY,
      "-m",
      "6",
      source,
      "-o",
      webp,
    ]);
  }
}

for (const command of ["avifenc", "cwebp"]) {
  if (!(await commandExists(command))) {
    throw new Error(`${command} is required. Install libavif and webp first.`);
  }
}

let count = 0;
for await (const file of walk(CONTENT_DIR)) {
  await encodeImage(file);
  count += 1;
}

console.log(`Generated AVIF and WebP sidecars for ${count} source image${count === 1 ? "" : "s"}.`);
