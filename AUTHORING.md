# Authoring Posts

This is the quick reference for writing posts with the custom article chrome in this site: right-hand table of contents, callouts, Shiki code blocks, modern images, generated OG cards, copy buttons, share button, and the post footer.

## Local Workflow

Install JavaScript dependencies with Bun:

```sh
bun install
```

Create a new post bundle:

```sh
just new my-post-slug
```

Build the production site:

```sh
bun run build
```

Build drafts and future posts:

```sh
bun run build:drafts
```

Run the local post-processed preview server:

```sh
bun run dev
```

Regenerate AVIF and WebP sidecars after adding or replacing source images:

```sh
just images
```

Hugo still builds the site. Bun is used for JavaScript dependencies, Shiki post-processing, the local static preview server, and the image sidecar script.

If a post starts in Obsidian, keep the finished post bundle in the vault under `gstv.io - Personal Blog/Posts/<slug>/`. The Hugo bundle in `content/posts/<slug>/` is the published copy, but the Obsidian copy should keep the same title, slug, description, cover metadata, and source idea link.

## Front Matter

Useful defaults for a normal post:

```yaml
---
title: "Post title"
date: 2026-05-15T12:00:00+01:00
lastmod: 2026-05-15T12:00:00+01:00
draft: true
description: "One sentence summary used in the post header and metadata."
tags:
  - Data Engineering
cover:
  image: "images/cover.png"
  alt: "Specific alt text for the cover image."
  caption: "Short caption used under the cover and on the OG card."
  relative: true
  hidden: false
# ogEyebrow: "Optional custom OG label"
# ogCaption: "Optional OG-only caption override"
showToc: true
TocOpen: true
disableShare: false
ShowPostNavLinks: true
ShowReadingTime: true
ShowWordCount: true
UseHugoToc: true
comments: false
---
```

Notes:

- `showToc: true` enables the right-side table of contents when the page has headings.
- `showToc: false` is better for short notes.
- Use reader-facing tag names like `Data Engineering`, not slug strings like `data-engineering`. Hugo creates lowercase slug URLs for tag pages automatically.
- `lastmod` controls the "Last updated" text in the bottom footer. If it is absent, Hugo falls back to `date`.
- `disableShare: false` shows the top-right copy-link share button in the metadata row.
- `ShowPostNavLinks: true` shows previous and next cards at the bottom of the post.
- The "Suggest Changes" link comes from `params.editPost` in `hugo.yaml`; per-post front matter is only needed if you want to override or disable it.

## Covers, Captions, And OG Cards

Use a page bundle with the cover at `images/cover.png`. A `1600x900` source is enough for the site cover and the generated `1200x630` OG card. Keep covers at `16:9` unless the art needs a different crop.

The `cover` block is the main source of truth:

```yaml
cover:
  image: "images/cover.png"
  alt: "Doom-style pixel-art cover showing a walking database table in a hellscape."
  caption: "Small tables can still carry large outages."
  relative: true
  hidden: false
```

Notes:

- `cover.caption` renders under the cover on the post page.
- The generated OG card uses `cover.caption` as its caption line.
- If a Markdown image or `figure` shortcode points at the same cover image and does not set a caption, it reuses `cover.caption`.
- `description` becomes the metadata description and the left-side OG summary.
- `ogEyebrow` overrides the small all-caps OG label. Without it, the label comes from the first two tags.
- `ogCaption` overrides the OG caption only. Use it when the cover caption is too long for a share image.

Generated OG images are written to `/og/<slug>.png` at `1200x630`. Rebuild the site and open that file in `public/og/` when you want to inspect the share preview.

## Images

For local images, commit the original source plus generated AVIF and WebP files:

```text
content/posts/my-post/images/cover.png
content/posts/my-post/images/cover.avif
content/posts/my-post/images/cover.webp
```

Run this after adding or replacing images:

```sh
just images
```

Covers, regular Markdown images, and the `figure` shortcode render as `<picture>` with AVIF first, WebP second, and the original image as the fallback. Remote images render as normal `<img>` tags.

## Table Of Contents

Use `showToc: true` for longer, reference-like posts. The TOC is generated from headings and becomes a right rail on desktop. The active marker is animated by `assets/js/article-enhancements.js`.

Example structure:

```md
Opening paragraph.

## First Section

### A Subsection

## Second Section
```

The front matter `title` is the page H1. Do not add a second `#` heading at the top of the post body unless the post intentionally needs a second title-like moment. Start with prose or with `##` section headings.

Avoid using the side TOC on posts that only have one or two short sections. It is strongest when the reader benefits from a map.

## Callouts

Use the `callout` shortcode:

```md
{{</* callout kind="tip" title="Use sparingly" */>}}
Callouts can contain markdown, inline code, links, and fenced code blocks.
{{</* /callout */>}}
```

Supported `kind` values:

- `note`
- `info`
- `tip`
- `warning`
- `danger`

Callouts can contain code blocks:

````md
{{</* callout kind="tip" title="Nested code" */>}}
Idiomatic version files like `.node-version` can be enabled explicitly:

```sh
tooling settings add idiomatic_version_file_enable_tools node
```

Or in `~/.config/tooling/config.toml`:

```toml
[settings]
idiomatic_version_file_enable_tools = ["node"]
```
{{</* /callout */>}}
````

Inline code inside callouts intentionally keeps the site accent colors instead of inheriting the callout state color.

## Code Blocks

Regular fenced code blocks get the custom Shiki chrome, line numbers, language label, and copy button:

````md
```sh
bun run build:drafts
```
````

Add an optional filename with `filename`, `title`, or `file`:

````md
```toml {filename="tooling.toml"}
[tools]
hugo = "0.161.1"
bun = "1.3.14"
```
````

The language label fades on hover and the copy button fades in. Copying uses the raw source text, so line numbers are not copied.

Use filenames only when the filename matters. For standalone examples, a normal fenced block is cleaner.

Shiki runs after Hugo:

1. Hugo renders the markdown into `public/`.
2. `scripts/shiki-highlight.mjs` finds `.shiki-code` blocks.
3. Shiki tokenizes the code and emits per-line markup with token scope classes.
4. CSS handles the theme colors, font weights, line numbers, and colorblind-safe mode.

## Syntax And Accessibility

The settings menu has a `syntax (a11y)` option:

- `default` uses the normal Shiki light/dark themes.
- `colorblind-safe` maps broad token classes to a colorblind-safe palette.

The mapping is scope-based, not language-specific, so it applies broadly across languages. Code text uses medium weight by default, while keyword-like scopes such as keywords, decorators, support types, entities, and constants are semibold.

## Share, Edit, And Footer

For normal posts, these are mostly automatic:

- The top metadata row shows date, reading time, word count, author, and a copy-link share button.
- The share button changes to "Copied" after a successful click.
- The bottom doc footer shows "Suggest Changes" and "Last updated".
- Previous and next cards come from the regular post ordering.

Use `disableShare: true` for pages that should not show the top share button.

Use this to hide the edit link on a specific page:

```yaml
editPost:
  disabled: true
```
