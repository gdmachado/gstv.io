# Authoring Posts

This is the quick reference for writing posts with the custom article chrome in this site: right-hand table of contents, callouts, Shiki code blocks, copy buttons, share button, and the post footer.

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

Hugo still builds the site. Bun is only used for JavaScript dependencies and for the Shiki post-processing step that rewrites Hugo's generated code blocks in `public/`.

## Photo Workflow

Export finished photos from Lightroom Classic as JPEGs, then place them in `.context/photo-imports/` or pass the export folder directly:

```sh
just photos-import .context/photo-imports
```

The import command:

- creates `content/photos/ph-<hash>/` so the published URL does not expose the original filename
- writes the optimized site image to `photo.jpg` with a 2400px long edge and JPEG quality 95
- creates `index.md` when one does not already exist
- extracts camera, lens, focal length, aperture, shutter speed, ISO, and city/country location when Lightroom or macOS exposes those fields
- avoids publishing exact GPS coordinates

Review each generated `index.md` before publishing:

- replace `title: "Untitled Photo"` with a human title
- keep `location` at city/country level, for example `"London, United Kingdom"`
- set `wall_size: "large"` on an occasional photo that should take more space in the salon wall
- uncomment and fill `credits` for portraits, beauty, makeup, styling, or model work
- leave `credits` absent for environmental shots

Credit entries look like this:

```yaml
credits:
  - role: "model"
    name: "Name"
    handle: "@handle"
    url: "https://instagram.com/handle"
  - role: "makeup"
    name: "Name"
    handle: "@handle"
    url: "https://instagram.com/handle"
```

For RAW files, do the Lightroom Classic preparation step first: import the ARW/NEF files, apply conservative baseline adjustments, export JPEG previews for review, then run `just photos-import` on the approved JPEG export folder.

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
- example
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
- `lastmod` controls the "Last updated" text in the bottom footer. If it is absent, Hugo falls back to `date`.
- `disableShare: false` shows the top-right copy-link share button in the metadata row.
- `ShowPostNavLinks: true` shows previous and next cards at the bottom of the post.
- The "Suggest Changes" link comes from `params.editPost` in `hugo.yaml`; per-post front matter is only needed if you want to override or disable it.

## Table Of Contents

Use `showToc: true` for longer, reference-like posts. The TOC is generated from headings and becomes a right rail on desktop. The active marker is animated by `assets/js/article-enhancements.js`.

Example structure:

```md
## First Section

### A Subsection

## Second Section
```

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
