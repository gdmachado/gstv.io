import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import vm from "node:vm";

const ROOT = process.cwd();

async function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: ROOT,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
      ...options,
    });
    let stdout = "";
    let stderr = "";

    child.stdout?.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr?.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }

      reject(new Error(`${command} ${args.join(" ")} exited ${code}\n${stdout}${stderr}`));
    });
  });
}

function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name} was not found`);

  const bodyStart = source.indexOf("{", start);
  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    const char = source[index];
    if (char === "{") depth += 1;
    if (char === "}") depth -= 1;
    if (depth === 0) return source.slice(start, index + 1);
  }

  throw new Error(`${name} did not have a closing brace`);
}

async function checkShareLabelResetsAfterRapidClicks() {
  const source = await fs.readFile(path.join(ROOT, "assets/js/article-enhancements.js"), "utf8");
  const timers = [];
  const label = { textContent: "Copy link" };
  const listeners = new Map();
  const classes = new Set();
  const button = {
    get offsetWidth() {
      return 0;
    },
    getAttribute(name) {
      return name === "data-share-copy" ? "https://gstv.io/posts/example/" : null;
    },
    querySelector(selector) {
      return selector === ".article-share-label" ? label : null;
    },
    addEventListener(type, handler) {
      listeners.set(type, handler);
    },
    classList: {
      add(value) {
        classes.add(value);
      },
      remove(value) {
        classes.delete(value);
      },
      toggle(value, enabled) {
        if (enabled) classes.add(value);
        else classes.delete(value);
      },
    },
  };

  const context = {
    document: {
      readyState: "complete",
      querySelector(selector) {
        return selector === ".docs-toc" ? null : undefined;
      },
      querySelectorAll(selector) {
        return selector === "[data-share-copy]" ? [button] : [];
      },
      addEventListener() {},
    },
    location: { href: "https://gstv.io/" },
    navigator: { clipboard: { writeText: async () => {} } },
    prompt() {},
    window: {
      addEventListener() {},
      setTimeout(callback) {
        timers.push(callback);
        return timers.length;
      },
    },
  };

  vm.runInNewContext(source, context);
  const click = listeners.get("click");
  assert.equal(typeof click, "function", "share button click handler was not registered");

  await click();
  await click();
  timers.forEach((callback) => callback());

  assert.equal(label.textContent, "Copy link");
}

async function checkCodeCopyFallbackKeepsLineBreaks() {
  const source = await fs.readFile(path.join(ROOT, "layouts/partials/footer.html"), "utf8");
  const getCodeTextSource = extractFunction(source, "getCodeText");
  const lineNodes = [
    { textContent: "1first", querySelector: () => ({ textContent: "first" }) },
    { textContent: "2second", querySelector: () => ({ textContent: "second" }) },
  ];
  const clone = {
    textContent: "firstsecond",
    querySelectorAll(selector) {
      if (selector === ".line-number") return [{ remove() {} }, { remove() {} }];
      if (selector === ".line") return lineNodes;
      return [];
    },
  };
  const codeblock = {
    dataset: {},
    cloneNode() {
      return clone;
    },
  };

  const copied = new Function("codeblock", `${getCodeTextSource}; return getCodeText();`)(codeblock);
  assert.equal(copied, "first\nsecond");
}

async function checkBodyFontSizeUsesBaseToken() {
  const source = await fs.readFile(path.join(ROOT, "assets/css/extended/15-typography.css"), "utf8");

  assert.match(
    source,
    /body\s*\{[^}]*font-size:\s*var\(--text-base\)/s,
    "body copy should stay pinned to the 16px base token",
  );
}

async function checkTypographyPageUsesShikiOutput() {
  await run("bun", ["run", "build"]);

  const htmlPath = path.join(ROOT, "public/typography/index.html");
  const html = await fs.readFile(htmlPath, "utf8");

  assert.match(
    html,
    /<code\b[^>]*class=["'][^"']*\bshiki-code\b[^"']*\bis-highlighted\b[^"']*["'][^>]*>/,
    "typography code blocks should use the Shiki post-processed markup",
  );
  assert.match(html, /class=["']line-number["']/, "typography code blocks should render line numbers");
  assert.match(html, /class=["']line-code["']/, "typography code blocks should wrap line contents");
  assert.match(html, /\btok-keyword\b|\btok-entity\b/, "typography code blocks should include Shiki token classes");
  assert.doesNotMatch(html, /\bchroma-code\b/, "production typography page should not use the Hugo-server fallback");
}

async function checkPostNavigationAndTocDepth() {
  const suffix = `${process.pid}-${Date.now()}`;
  const alpha = `review-regression-alpha-${suffix}`;
  const beta = `review-regression-beta-${suffix}`;
  const alphaDir = path.join(ROOT, "content/posts", alpha);
  const betaDir = path.join(ROOT, "content/posts", beta);

  await fs.mkdir(alphaDir, { recursive: true });
  await fs.mkdir(betaDir, { recursive: true });

  try {
    await fs.writeFile(
      path.join(alphaDir, "index.md"),
      `---\ntitle: Review Regression Alpha\ndate: 2026-01-02T00:00:00Z\nShowPostNavLinks: true\nshowToc: true\nUseHugoToc: true\n---\n\n## Intro\n\n### Middle\n\n#### Deep Heading\n\nBody.\n`,
    );
    await fs.writeFile(
      path.join(betaDir, "index.md"),
      `---\ntitle: Review Regression Beta\ndate: 2026-01-01T00:00:00Z\nShowPostNavLinks: true\n---\n\nBody.\n`,
    );

    await run("bun", ["run", "build:hugo", "--", "--logLevel", "error"]);

    const htmlPath = path.join(ROOT, "public/posts", alpha, "index.html");
    const html = await fs.readFile(htmlPath, "utf8");
    assert.match(html, /class="?paginav"?/, "post navigation should render without site.Params.mainSections");

    const tocStart = html.indexOf('class="toc docs-toc"');
    assert.notEqual(tocStart, -1, "table of contents should render");
    const tocEnd = html.indexOf("</nav>", tocStart);
    const tocHtml = html.slice(tocStart, tocEnd);
    assert.match(tocHtml, /#deep-heading/, "Hugo table of contents should include h4 headings");
  } finally {
    await fs.rm(alphaDir, { recursive: true, force: true });
    await fs.rm(betaDir, { recursive: true, force: true });
    await fs.rm(path.join(ROOT, "public"), { recursive: true, force: true });
    await fs.rm(path.join(ROOT, "resources"), { recursive: true, force: true });
  }
}

async function waitForServer(child) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("server did not start")), 5000);
    child.stdout.on("data", (chunk) => {
      const text = chunk.toString();
      const match = text.match(/Serving post-processed site at http:\/\/localhost:(\d+)\//);
      if (match) {
        clearTimeout(timeout);
        resolve(Number(match[1]));
      }
    });
    child.stderr.on("data", (chunk) => {
      const text = chunk.toString();
      if (text.trim()) {
        clearTimeout(timeout);
        reject(new Error(text));
      }
    });
    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });
}

async function checkMalformedUrlsReturnBadRequest() {
  const serverRoot = path.join(ROOT, ".context/review-regression-server");
  const publicDir = path.join(serverRoot, "public");
  const port = 18000 + (process.pid % 1000);

  await fs.rm(serverRoot, { recursive: true, force: true });
  await fs.mkdir(publicDir, { recursive: true });
  await fs.writeFile(path.join(publicDir, "index.html"), "ok");

  const child = spawn("bun", [path.join(ROOT, "scripts/serve-public.mjs")], {
    cwd: serverRoot,
    env: { ...process.env, HOST: "127.0.0.1", PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"],
  });

  try {
    const actualPort = await waitForServer(child);
    const response = await fetch(`http://127.0.0.1:${actualPort}/%E0%A4%A`);
    assert.equal(response.status, 400);
  } finally {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill();
      await new Promise((resolve) => child.once("close", resolve));
    }
    await fs.rm(serverRoot, { recursive: true, force: true });
  }
}

const checks = [
  ["share label resets after rapid clicks", checkShareLabelResetsAfterRapidClicks],
  ["code copy fallback keeps line breaks", checkCodeCopyFallbackKeepsLineBreaks],
  ["body font size uses base token", checkBodyFontSizeUsesBaseToken],
  ["typography page uses Shiki output", checkTypographyPageUsesShikiOutput],
  ["post navigation and Hugo TOC depth render", checkPostNavigationAndTocDepth],
  ["malformed URLs return a bad request", checkMalformedUrlsReturnBadRequest],
];

let failures = 0;

for (const [name, check] of checks) {
  try {
    await check();
    console.log(`ok - ${name}`);
  } catch (error) {
    failures += 1;
    console.error(`not ok - ${name}`);
    console.error(error.stack || error.message);
  }
}

if (failures > 0) {
  process.exitCode = 1;
}
