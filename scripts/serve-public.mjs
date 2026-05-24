import { createServer } from "node:http";
import { promises as fs } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const PUBLIC_DIR = path.resolve(ROOT, "public");
const HOST = process.env.HOST || "127.0.0.1";
const START_PORT = Number(process.env.PORT || 1313);

const TYPES = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".svg", "image/svg+xml"],
  [".webp", "image/webp"],
  [".woff2", "font/woff2"],
]);

function contentType(filePath) {
  return TYPES.get(path.extname(filePath).toLowerCase()) || "application/octet-stream";
}

function safePath(urlPath) {
  try {
    const pathname = new URL(urlPath, "http://localhost").pathname;
    const decoded = decodeURIComponent(pathname);
    return path.resolve(PUBLIC_DIR, decoded.replace(/^[/\\]+/, ""));
  } catch {
    return null;
  }
}

function isPublicPath(filePath) {
  const relative = path.relative(PUBLIC_DIR, filePath);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

async function resolveFile(urlPath) {
  let filePath = safePath(urlPath);
  if (!filePath) return null;

  const stat = await fs.stat(filePath).catch(() => null);

  if (stat?.isDirectory()) {
    filePath = path.join(filePath, "index.html");
  } else if (!stat && !path.extname(filePath)) {
    filePath = path.join(filePath, "index.html");
  }

  return filePath;
}

function listen(server, port) {
  return new Promise((resolve, reject) => {
    server.once("error", (error) => {
      if (error.code === "EADDRINUSE" && port < START_PORT + 20) {
        resolve(listen(server, port + 1));
      } else {
        reject(error);
      }
    });

    server.listen(port, HOST, () => resolve(port));
  });
}

const server = createServer(async (request, response) => {
  try {
    const filePath = await resolveFile(request.url || "/");

    if (!filePath) {
      response.writeHead(400, { "content-type": "text/plain; charset=utf-8" });
      response.end("Bad request");
      return;
    }

    if (!isPublicPath(filePath)) {
      response.writeHead(403);
      response.end("Forbidden");
      return;
    }

    const body = await fs.readFile(filePath);
    response.writeHead(200, {
      "content-type": contentType(filePath),
      "cache-control": "no-store",
    });
    response.end(body);
  } catch {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("Not found");
  }
});

const port = await listen(server, START_PORT);
console.log(`Serving post-processed site at http://localhost:${port}/`);
