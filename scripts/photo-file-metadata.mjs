import { promises as fs } from "node:fs";

export const PHOTO_COPYRIGHT = "Copyright Gus Machado (gstv.io)";

export async function stampPhotoFileMetadata(filePath, runCommand) {
  const strippedPath = `${filePath}.metadata-tmp-${process.pid}.jpg`;

  try {
    await runCommand("jpegtran", ["-copy", "icc", "-outfile", strippedPath, filePath]);
    await fs.rename(strippedPath, filePath);
    await runCommand("sips", ["-s", "copyright", PHOTO_COPYRIGHT, filePath]);
  } catch (error) {
    await fs.rm(strippedPath, { force: true });
    throw error;
  }
}
