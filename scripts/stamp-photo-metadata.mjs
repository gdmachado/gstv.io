import { promises as fs } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { stampPhotoFileMetadata } from "./photo-file-metadata.mjs";

const ROOT = process.cwd();
const PHOTO_DIR = path.join(ROOT, "content/photos");

async function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: ROOT,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }

      reject(new Error(`${command} exited ${code}: ${stderr || stdout}`));
    });
  });
}

async function findPhotoSources() {
  const bundles = await fs.readdir(PHOTO_DIR, { withFileTypes: true });
  const photos = [];

  for (const bundle of bundles) {
    if (!bundle.isDirectory()) continue;

    const photoPath = path.join(PHOTO_DIR, bundle.name, "photo.jpg");
    try {
      await fs.access(photoPath);
      photos.push(photoPath);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }

  return photos.sort((left, right) => left.localeCompare(right));
}

const photos = process.argv.slice(2).map((item) => path.resolve(ROOT, item));
const targets = photos.length ? photos : await findPhotoSources();

for (const target of targets) {
  await stampPhotoFileMetadata(target, run);
}

console.log(`Stamped file metadata on ${targets.length} photo${targets.length === 1 ? "" : "s"}.`);
