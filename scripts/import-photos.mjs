import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { promises as fs } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { stampPhotoFileMetadata } from "./photo-file-metadata.mjs";

const ROOT = process.cwd();
const SOURCE_DIR = path.resolve(ROOT, process.argv[2] || ".context/photo-imports");
const PHOTO_DIR = path.join(ROOT, "content/photos");
const PHOTO_SOURCE_LONG_EDGE = "3200";
const METADATA_FIELDS = [
  "kMDItemAcquisitionMake",
  "kMDItemAcquisitionModel",
  "kMDItemLensModel",
  "kMDItemFocalLength",
  "kMDItemFNumber",
  "kMDItemExposureTimeSeconds",
  "kMDItemISOSpeed",
  "kMDItemContentCreationDate",
  "kMDItemCity",
  "kMDItemCountry",
];
const CAMERA_NORMALIZERS = [
  [/ilce-7m4/, "Sony A7 IV"],
  [/nikon.*d810|d810.*nikon/, "Nikon D810"],
  [/canon.*eos 6d|eos 6d.*canon/, "Canon EOS 6D"],
];

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

async function sha256(filePath) {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

function cleanMetadataValue(value) {
  const trimmed = value.trim();
  if (!trimmed || trimmed === "(null)" || trimmed === "null") return "";
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) return trimmed.slice(1, -1);
  return trimmed;
}

function parseMetadata(stdout) {
  const values = new Map();

  stdout.split("\n").forEach((line) => {
    const match = line.match(/^(kMDItem[A-Za-z0-9]+)\s+=\s+(.*)$/);
    if (!match) return;
    values.set(match[1], cleanMetadataValue(match[2]));
  });

  return values;
}

async function readMetadata(filePath) {
  try {
    const args = METADATA_FIELDS.flatMap((field) => ["-name", field]).concat(filePath);
    const { stdout } = await run("mdls", args);
    return parseMetadata(stdout);
  } catch (error) {
    console.warn(`Metadata unavailable for ${path.basename(filePath)}: ${error.message}`);
    return new Map();
  }
}

function formatNumber(value, digits = 1) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "";
  if (Number.isInteger(number)) return String(number);
  return number.toFixed(digits).replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");
}

function formatFocalLength(value) {
  const formatted = formatNumber(value, 1);
  return formatted ? `${formatted}mm` : "";
}

function formatAperture(value) {
  const formatted = formatNumber(value, 1);
  return formatted ? `f/${formatted}` : "";
}

function formatShutter(value) {
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0) return "";
  if (seconds >= 1) return `${formatNumber(seconds, 1)}s`;

  const denominator = Math.round(1 / seconds);
  if (denominator > 0 && Math.abs(seconds - 1 / denominator) < 0.0005) {
    return `1/${denominator}`;
  }

  return `${formatNumber(seconds, 4)}s`;
}

function formatIso(value) {
  const number = Number(value);
  return Number.isFinite(number) ? String(Math.round(number)) : "";
}

function formatDate(value) {
  if (!value) return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");

  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf())) return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
  return parsed.toISOString().replace(/\.\d{3}Z$/, "Z");
}

function normalizeCamera(make, model) {
  const rawMake = make.trim();
  const rawModel = model.trim();
  if (!rawMake && !rawModel) return "";

  const combined = `${rawMake} ${rawModel}`.trim().replace(/\s+/g, " ");
  const normalized = combined.toLowerCase();
  const cameraMatch = CAMERA_NORMALIZERS.find(([pattern]) => pattern.test(normalized));
  if (cameraMatch) return cameraMatch[1];

  if (rawModel && rawMake && !rawModel.toLowerCase().includes(rawMake.toLowerCase())) {
    return `${rawMake} ${rawModel}`.replace(/\s+/g, " ");
  }

  return rawModel || rawMake;
}

function normalizeLens(value) {
  return value.trim().replace(/\bF([0-9])/g, "f/$1").replace(/\s+/g, " ");
}

function yamlString(value) {
  return `"${String(value || "").replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function frontmatter(metadata) {
  const make = metadata.get("kMDItemAcquisitionMake") || "";
  const model = metadata.get("kMDItemAcquisitionModel") || "";
  const city = metadata.get("kMDItemCity") || "";
  const country = metadata.get("kMDItemCountry") || "";
  const location = [city, country].filter(Boolean).join(", ");

  const fields = {
    title: "Untitled Photo",
    date: formatDate(metadata.get("kMDItemContentCreationDate") || ""),
    draft: false,
    hidemeta: false,
    ShowReadingTime: false,
    ShowWordCount: false,
    ShowShareButtons: true,
    comments: false,
    camera: normalizeCamera(make, model),
    lens: normalizeLens(metadata.get("kMDItemLensModel") || ""),
    focal_length: formatFocalLength(metadata.get("kMDItemFocalLength") || ""),
    aperture: formatAperture(metadata.get("kMDItemFNumber") || ""),
    shutter: formatShutter(metadata.get("kMDItemExposureTimeSeconds") || ""),
    iso: formatIso(metadata.get("kMDItemISOSpeed") || ""),
    location,
  };

  return `---\n`
    + `title: ${yamlString(fields.title)}\n`
    + `date: ${fields.date}\n`
    + `draft: ${fields.draft}\n`
    + `hidemeta: ${fields.hidemeta}\n`
    + `ShowReadingTime: ${fields.ShowReadingTime}\n`
    + `ShowWordCount: ${fields.ShowWordCount}\n`
    + `ShowShareButtons: ${fields.ShowShareButtons}\n`
    + `comments: ${fields.comments}\n`
    + `camera: ${yamlString(fields.camera)}\n`
    + `lens: ${yamlString(fields.lens)}\n`
    + `focal_length: ${yamlString(fields.focal_length)}\n`
    + `aperture: ${yamlString(fields.aperture)}\n`
    + `shutter: ${yamlString(fields.shutter)}\n`
    + `iso: ${yamlString(fields.iso)}\n`
    + `location: ${yamlString(fields.location)}\n`
    + `# wall_size: "large"\n`
    + `# credits:\n`
    + `#   - role: "model"\n`
    + `#     name: ""\n`
    + `#     handle: ""\n`
    + `#     url: ""\n`
    + `---\n`;
}

async function findJpegs(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && /\.jpe?g$/i.test(entry.name))
    .map((entry) => path.join(dir, entry.name))
    .sort((left, right) => left.localeCompare(right));
}

async function importPhoto(sourcePath) {
  const hash = await sha256(sourcePath);
  const slug = `ph-${hash.slice(0, 10)}`;
  const targetDir = path.join(PHOTO_DIR, slug);
  const targetImage = path.join(targetDir, "photo.jpg");
  const targetIndex = path.join(targetDir, "index.md");

  await fs.mkdir(targetDir, { recursive: true });
  await run("sips", ["-Z", PHOTO_SOURCE_LONG_EDGE, "-s", "format", "jpeg", "-s", "formatOptions", "95", sourcePath, "--out", targetImage]);
  await stampPhotoFileMetadata(targetImage, run);

  let hasIndex = true;
  try {
    await fs.access(targetIndex);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    hasIndex = false;
  }

  if (!hasIndex) {
    const metadata = await readMetadata(sourcePath);
    await fs.writeFile(targetIndex, frontmatter(metadata), "utf8");
  }

  return { source: path.basename(sourcePath), slug };
}

async function main() {
  await fs.mkdir(SOURCE_DIR, { recursive: true });
  const photos = await findJpegs(SOURCE_DIR);
  if (!photos.length) {
    console.log(`No JPEGs found in ${path.relative(ROOT, SOURCE_DIR) || "."}`);
    return;
  }

  const imported = [];
  for (const photo of photos) {
    imported.push(await importPhoto(photo));
  }

  console.log(`Imported ${imported.length} photo${imported.length === 1 ? "" : "s"} from ${path.relative(ROOT, SOURCE_DIR) || "."}`);
  imported.forEach((item) => {
    console.log(`- ${item.source} -> content/photos/${item.slug}/`);
  });
  console.log("Review each index.md for title, city/country location, and credits before publishing.");
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
