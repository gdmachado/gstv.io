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

async function readPhotoPageSize() {
  const config = await fs.readFile(path.join(ROOT, "hugo.yaml"), "utf8");
  const match = config.match(/photos:\s*\n(?:[^\n]*\n)*?\s+pageSize:\s*(\d+)/);
  return match ? Number(match[1]) : 6;
}

async function checkPhotoArchivePaginationAndLoaderHooks() {
  const pageSize = await readPhotoPageSize();
  const sourceImage = path.join(ROOT, "content/photos/ph-185f4adbb6/photo.jpg");
  const tempSlugs = Array.from({ length: pageSize + 1 }, (_, index) => {
    return `review-pagination-photo-${process.pid}-${index}`;
  });

  try {
    for (const [index, slug] of tempSlugs.entries()) {
      const dir = path.join(ROOT, "content/photos", slug);
      await fs.mkdir(dir, { recursive: true });
      await fs.copyFile(sourceImage, path.join(dir, "photo.jpg"));
      await fs.writeFile(
        path.join(dir, "index.md"),
        `---\ntitle: Review Pagination Photo ${index}\ndate: 2026-01-${String(index + 1).padStart(2, "0")}T00:00:00Z\ncamera: "Test Camera"\nlens: "Test 50mm f/1.8"\naperture: "f/2.8"\nshutter: "1/125"\niso: "200"\n---\n`,
      );
    }

    await fs.rm(path.join(ROOT, "public"), { recursive: true, force: true });
    await fs.rm(path.join(ROOT, "resources"), { recursive: true, force: true });
    await run("bun", ["run", "build:hugo", "--", "--logLevel", "error"]);

    const firstPage = await fs.readFile(path.join(ROOT, "public/photos/index.html"), "utf8");
    const secondPage = await fs.readFile(path.join(ROOT, "public/photos/page/2/index.html"), "utf8");
    const script = await fs.readFile(path.join(ROOT, "assets/js/photo-enhancements.js"), "utf8");
    const css = await fs.readFile(path.join(ROOT, "assets/css/extended/90-pages.css"), "utf8");

    const firstPageCards = firstPage.match(/data-photo-item/g) || [];
    const secondPageCards = secondPage.match(/data-photo-item/g) || [];

    assert.equal(firstPageCards.length, pageSize, "first photos page should render one bounded batch");
    assert.ok(secondPageCards.length > 0, "second photos page should render another batch");
    assert.ok(secondPageCards.length <= pageSize, "second photos page should stay bounded");
    assert.match(firstPage, /data-photo-grid/, "photos archive should expose a grid hook");
    assert.match(firstPage, /class="?photo-salon-wall/, "photos archive should use the salon wall layout");
    assert.match(firstPage, /data-photo-item/, "photos archive should expose photo item hooks");
    assert.match(secondPage, /data-frame="?07"?/, "second photos page should continue frame numbering");
    assert.match(firstPage, /data-photo-next/, "photos archive should expose a next-page hook");
    assert.match(firstPage, /data-photo-skeletons/, "photos archive should include loading skeletons");
    assert.match(firstPage, /ƒ\//, "photos archive should use the aperture glyph in gallery metadata");
    assert.match(firstPage, /Test 50mm ƒ\/1\.8/, "photos archive should use the aperture glyph in lens names");
    assert.match(script, /function initPhotoPager\(/, "photo enhancements should initialize the photo pager");
    assert.match(script, /IntersectionObserver/, "photo pager should use IntersectionObserver for auto loading");
    assert.match(script, /photos:items-added/, "photo pager should ask the salon wall to repack appended items");
    assert.match(css, /\.photos-grid-skeletons\[hidden\]/, "hidden photo skeletons should stay hidden");
  } finally {
    for (const slug of tempSlugs) {
      await fs.rm(path.join(ROOT, "content/photos", slug), { recursive: true, force: true });
    }
    await fs.rm(path.join(ROOT, "public"), { recursive: true, force: true });
    await fs.rm(path.join(ROOT, "resources"), { recursive: true, force: true });
  }
}

async function checkPhotoArchiveUsesSalonWallAndCredits() {
  await fs.rm(path.join(ROOT, "public"), { recursive: true, force: true });
  await fs.rm(path.join(ROOT, "resources"), { recursive: true, force: true });
  await run("bun", ["run", "build:hugo", "--", "--logLevel", "error"]);

  const archive = await fs.readFile(path.join(ROOT, "public/photos/index.html"), "utf8");
  const creditedSingle = await fs.readFile(path.join(ROOT, "public/photos/ph-77340f8f8d/index.html"), "utf8");
  const photoSingleTemplate = await fs.readFile(path.join(ROOT, "layouts/photos/single.html"), "utf8");
  const photoSalonTemplate = await fs.readFile(path.join(ROOT, "layouts/_partials/photo_salon_item.html"), "utf8");
  const photoSourcePartial = await fs.readFile(path.join(ROOT, "layouts/_partials/photo_source.html"), "utf8");
  const script = await fs.readFile(path.join(ROOT, "assets/js/photo-enhancements.js"), "utf8");
  const css = await fs.readFile(path.join(ROOT, "assets/css/extended/90-pages.css"), "utf8");

  assert.match(archive, /photo-enhancements/, "photo pages should load the photo enhancements bundle");
  assert.match(archive, /class="?photo-salon-wall/, "photos archive should render the salon wall");
  assert.match(archive, /photo-exif-polaroid/, "salon wall should render always-visible photo metadata");
  assert.match(archive, /photo-credits-polaroid/, "salon wall should render compact credits when present");
  assert.match(archive, /data-wall-size=["']?large/, "salon wall should expose optional large wall sizing");
  assert.match(archive, /\/photos\/ph-[a-f0-9]{10}\//, "photo URLs should use opaque hash slugs");
  assert.match(creditedSingle, /class=["']?photo-meta-path["']?>photo\.credits<\/span>\s*<span class=["']?photo-meta-punctuation["']?>\[/, "single photo pages should render full credit objects");
  assert.match(creditedSingle, /class=["']photo-credit-key photo-meta-key["']>role<\/span><span class=["']?photo-meta-punctuation["']?>:/, "single photo credit objects should tokenize roles");
  assert.match(creditedSingle, /class=["']?photo-meta-path["']?>photo\.meta<\/span>/, "single photo metadata should tokenize the object path");
  assert.match(creditedSingle, /class=["']?photo-meta-key["']?>camera<\/span>/, "single photo metadata should tokenize keys");
  assert.match(creditedSingle, /class=["']?photo-meta-string["']?>Nikon D810<\/span>/, "single photo metadata should tokenize strings");
  assert.match(creditedSingle, /class=["']?photo-meta-number["']?>100<\/span>/, "single photo metadata should tokenize numbers");
  assert.match(creditedSingle, /class=["']?photo-meta-link["']?[^>]*>@guimaraesadriane<\/a>/, "single photo credits should tokenize linked string values");
  assert.match(creditedSingle, /data-photo-single/, "single photo pages should expose the photo viewer hook");
  assert.match(creditedSingle, /data-photo-viewer/, "single photo pages should render the image viewer shell");
  assert.match(creditedSingle, /data-photo-viewer-open/, "single photo images should open the viewer");
  assert.match(photoSingleTemplate, /partial "photo_source\.html"/, "single photo pages should use the shared canonical source selector");
  assert.doesNotMatch(photoSingleTemplate, /range \(\.Resources\.ByType "image"\)/, "single photo pages should not render generated sidecars as extra figures");
  assert.match(photoSingleTemplate, /math\.Min 3200 \.Width/, "single photo viewer should align with the 3200px source standard");
  assert.match(photoSingleTemplate, /webp q95/, "single photo pages should use high-quality WebP renditions");
  assert.match(photoSalonTemplate, /partial "photo_source\.html"/, "photo archive cards should use the shared canonical source selector");
  assert.doesNotMatch(photoSalonTemplate, /GetMatch "\*"/, "photo archive cards should not select generated sidecars");
  assert.match(photoSalonTemplate, /1200x webp q90/, "photo archive cards should keep large thumbnails high quality");
  assert.match(photoSourcePartial, /GetMatch "photo\.jpg"/, "shared photo source selector should prefer canonical photo sources");
  assert.doesNotMatch(photoSourcePartial, /\.avif|\.webp/, "shared photo source selector should ignore generated sidecars");
  assert.match(script, /function initSalonWall\(/, "photo enhancements should initialize the salon wall packer");
  assert.match(script, /function initPhotoViewer\(/, "photo enhancements should initialize the photo viewer");
  assert.match(script, /data-photo-viewer-zoom/, "photo detail viewer should wire zoom controls");
  assert.match(script, /function fitImageToStage\(/, "photo detail viewer should fit images to the visible stage");
  assert.match(script, /function getPanBounds\(/, "photo detail viewer should measure actual image overflow for panning");
  assert.match(script, /is-pannable/, "photo detail viewer should only present drag affordance when panning is available");
  assert.match(script, /suppressClick/, "photo detail viewer should distinguish drag from click-to-close");
  assert.match(script, /event\.target === image/, "photo detail viewer should let image clicks close the overlay");
  assert.match(script, /lastPackedWidth/, "salon wall packer should ignore height-only resize observer callbacks");
  assert.match(script, /function bestSlot\(/, "salon wall packer should use skyline placement");
  assert.match(script, /function spanProfile\(/, "salon wall packer should allow flexible item spans");
  assert.match(script, /wallSize === "large"/, "salon wall packer should support neutral large sizing");
  assert.match(script, /function candidateSpans\(/, "salon wall packer should test multiple spans per item");
  assert.match(script, /function candidateSlots\(/, "salon wall packer should evaluate every possible skyline slot");
  assert.match(script, /function skylineStats\(/, "salon wall packer should score whole-wall compactness");
  assert.match(script, /function chooseCandidate\(/, "salon wall packer should use lookahead placement");
  assert.match(script, /leavesUnfillableRightGap/, "salon wall packer should reject tiny right-edge leftovers");
  assert.match(script, /deadArea/, "salon wall packer should penalize broad blank areas");
  assert.match(script, /raggedness/, "salon wall packer should penalize vertical rails");
  assert.match(script, /valleyReward/, "salon wall packer should prefer visible gaps without raw y-position bias");
  assert.match(script, /function repackTail\(/, "salon wall packer should tidy the bottom cluster");
  assert.match(script, /function tailCandidates\(/, "salon wall tail should pick a deterministic bottom visual band");
  assert.match(script, /bottomMostTop/, "salon wall tail should avoid right-rail bottom fragments");
  assert.match(script, /left\.column - right\.column/, "salon wall tail should read left to right");
  assert.match(script, /rowFloor/, "salon wall tail should sit below any anchored column");
  assert.match(script, /tailBottom/, "salon wall tail should use the true bottom cluster");
  assert.match(script, /rowY/, "salon wall tail should align as a deliberate final row");
  assert.match(script, /heightForSpan/, "salon wall packer should measure candidate height for the chosen span");
  assert.match(script, /is-positioned/, "salon wall packer should switch to stable absolute placement");
  assert.match(script, /image\.hasAttribute\("width"\) && image\.hasAttribute\("height"\)/, "image loads with known dimensions should not force scroll-time repacks");
  assert.match(css, /\.photo-credits-polaroid/, "photo CSS should style compact credits");
  assert.match(css, /\.photo-detail-shell/, "photo CSS should style the single photo detail layout");
  assert.match(css, /\.photo-viewer/, "photo CSS should style the image viewer overlay");
  assert.match(css, /\.photo-viewer\s*\{[^}]*z-index:\s*1000002/s, "photo viewer should sit above the sticky site header");
  assert.match(css, /\.photo-meta-object-single \.photo-meta-link,\s*\.photo-credits-object-single \.photo-meta-link\s*\{[^}]*text-decoration-line:\s*underline/s, "photo metadata links should keep a visible underline");
  assert.match(css, /\.photo-meta-object-single \.photo-meta-string,\s*\.photo-credits-object-single \.photo-meta-string/s, "single photo metadata should scope syntax string colors to detail blocks");
  assert.doesNotMatch(css, /(^|\n)\.photo-meta-(?:path|key|string|number|punctuation|link)(?::hover)?\s*\{/m, "photo syntax token colors should not apply globally to archive metadata");
  assert.match(css, /grid-template-rows:\s*minmax\(0,\s*1fr\)\s*auto/, "photo viewer should reserve space for controls while fitting the image");
  assert.match(css, /\.photo-salon-frame\.is-wall-large/, "photo CSS should provide a large sizing fallback");
  assert.match(css, /\.photo-salon-wall\.is-positioned/, "photo CSS should support positioned salon packing");
  assert.match(css, /box-sizing:\s*border-box/, "photo frame widths should include padding and borders");
  assert.match(css, /--photo-wall-max:\s*1480px/, "photo archive should define an explicit wall width");
}

async function checkPhotoImportWorkflowDocumented() {
  const justfile = await fs.readFile(path.join(ROOT, "Justfile"), "utf8");
  const script = await fs.readFile(path.join(ROOT, "scripts/import-photos.mjs"), "utf8");
  const fileMetadata = await fs.readFile(path.join(ROOT, "scripts/photo-file-metadata.mjs"), "utf8");
  const docs = await fs.readFile(path.join(ROOT, "AUTHORING.md"), "utf8");

  assert.match(justfile, /photos-import/, "Justfile should expose the photo import workflow");
  assert.match(justfile, /photos-stamp-metadata/, "Justfile should expose the photo metadata stamping workflow");
  assert.match(script, /sips/, "photo importer should optimize exported JPEGs");
  assert.match(script, /PHOTO_SOURCE_LONG_EDGE = "3200"/, "photo importer should preserve a 3200px long-edge source");
  assert.match(script, /stampPhotoFileMetadata/, "photo importer should stamp file-level copyright metadata");
  assert.match(fileMetadata, /jpegtran[\s\S]*"-copy"[\s\S]*"icc"/, "photo metadata stamping should remove stale metadata while preserving ICC profiles");
  assert.match(fileMetadata, /PHOTO_COPYRIGHT = "Copyright Gus Machado \(gstv\.io\)"/, "photo metadata should include the site copyright");
  assert.match(script, /ph-\$\{hash\.slice\(0, 10\)\}/, "photo importer should create opaque hash slugs");
  assert.match(script, /kMDItemCity/, "photo importer should read city-level metadata");
  assert.match(script, /kMDItemCountry/, "photo importer should read country-level metadata");
  assert.doesNotMatch(script, /kMDItemLatitude|kMDItemLongitude/, "photo importer should not publish exact GPS coordinates");
  assert.match(script, /wall_size: "large"/, "photo importer should document optional large wall sizing");
  assert.match(docs, /just photos-import/, "authoring docs should describe the photo import command");
  assert.match(docs, /wall_size: "large"/, "authoring docs should describe optional large wall sizing");
  assert.match(docs, /city\/country/, "authoring docs should document location granularity");
}

async function checkModernImagePipeline() {
  const packageJson = await fs.readFile(path.join(ROOT, "package.json"), "utf8");
  const hugoConfig = await fs.readFile(path.join(ROOT, "hugo.yaml"), "utf8");
  const justfile = await fs.readFile(path.join(ROOT, "Justfile"), "utf8");
  const imageScript = await fs.readFile(path.join(ROOT, "scripts/generate-modern-images.mjs"), "utf8");
  const server = await fs.readFile(path.join(ROOT, "scripts/serve-public.mjs"), "utf8");
  const picture = await fs.readFile(path.join(ROOT, "layouts/partials/modern-picture.html"), "utf8");
  const renderImage = await fs.readFile(path.join(ROOT, "layouts/_default/_markup/render-image.html"), "utf8");
  const cover = await fs.readFile(path.join(ROOT, "layouts/partials/cover.html"), "utf8");
  const figure = await fs.readFile(path.join(ROOT, "layouts/shortcodes/figure.html"), "utf8");
  const ogImage = await fs.readFile(path.join(ROOT, "layouts/partials/og-image.html"), "utf8");
  const openGraph = await fs.readFile(path.join(ROOT, "layouts/partials/templates/opengraph.html"), "utf8");
  const twitterCards = await fs.readFile(path.join(ROOT, "layouts/partials/templates/twitter_cards.html"), "utf8");
  const extendHead = await fs.readFile(path.join(ROOT, "layouts/partials/extend_head.html"), "utf8");
  const contentCss = await fs.readFile(path.join(ROOT, "assets/css/extended/40-content.css"), "utf8");

  assert.match(packageJson, /"images":\s*"bun scripts\/generate-modern-images\.mjs"/, "package scripts should expose the image sidecar generator");
  assert.match(hugoConfig, /method:\s*6/, "Hugo WebP encoding should use high-effort compression");
  assert.match(hugoConfig, /useSharpYuv:\s*true/, "Hugo WebP encoding should prioritize sharp color conversion");
  assert.match(justfile, /^images:/m, "Justfile should expose the image sidecar generator");
  assert.match(imageScript, /avifenc/, "image pipeline should generate AVIF sidecars");
  assert.match(imageScript, /cwebp/, "image pipeline should generate WebP sidecars");
  assert.match(imageScript, /SKIPPED_DIRS[\s\S]*"photos"/, "image pipeline should not create sidecars for photo gallery originals");
  assert.match(server, /\["\.avif", "image\/avif"\]/, "local server should serve AVIF with the correct MIME type");
  assert.match(picture, /type="image\/avif"/, "modern picture partial should prefer AVIF");
  assert.match(picture, /type="image\/webp"/, "modern picture partial should include WebP fallback");
  assert.match(picture, /resources\.ByType "image"/, "modern picture partial should find global resource sidecars");
  assert.match(picture, /imageStyle[\s\S]*safeCSS/, "modern picture partial should allow shortcode CSS widths");
  assert.match(renderImage, /partial "modern-picture\.html"/, "markdown images should use modern picture markup");
  assert.match(cover, /partial "modern-picture\.html"/, "post covers should use modern picture markup");
  assert.match(figure, /imageStyle/, "figure shortcode should preserve percentage widths with modern picture markup");
  assert.match(contentCss, /figure\.align-center[\s\S]*margin-inline:\s*auto/, "post figure CSS should keep centered images centered");
  assert.match(ogImage, /cover\.image/, "OG image generation should incorporate page covers");
  assert.match(extendHead, /\.Scratch\.Set "ogImage"/, "head extension should pass generated OG images to theme metadata templates");
  assert.match(openGraph, /Scratch\.Get "ogImage"/, "OpenGraph template should emit generated OG images");
  assert.match(twitterCards, /Scratch\.Get "ogImage"/, "Twitter cards template should emit generated OG images");
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
  ["photo archive paginates and exposes loader hooks", checkPhotoArchivePaginationAndLoaderHooks],
  ["photo archive uses salon wall and credits", checkPhotoArchiveUsesSalonWallAndCredits],
  ["photo import workflow is documented", checkPhotoImportWorkflowDocumented],
  ["modern image pipeline is wired", checkModernImagePipeline],
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
