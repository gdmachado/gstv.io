---
title: "Typography"
url: "/typography/"
description: "How the type system reads."
showToc: false
hideMeta: true
ShowReadingTime: false
ShowWordCount: false
ShowShareButtons: false
ShowBreadCrumbs: false
disableShare: true
comments: false
---

The site uses three faces, each with one job: **Roc Grotesk** for body, **Migra** for display headings, **Geist Mono** for code.

## The faces

| Role | Face | Weights used |
|---|---|---|
| Body | Roc Grotesk via Adobe Fonts | 300, 400, 500, 600 |
| Display headings | [Migra](https://pangrampangram.com/products/migra) by Pangram Pangram | 700 (Extrabold) |
| Code | [Geist Mono](https://vercel.com/font/mono) by Vercel | 400 (variable) |

## Hierarchy

# Heading 1: the headline of a post

## Heading 2: a major section

### Heading 3: a sub-section

#### Heading 4: a labelled subsection

##### Heading 5: small running header

###### Heading 6: caption header

## Body

This is body copy in **Roc Grotesk** at 16 px / 1 rem with a relaxed line-height. **Bold reads as emphasis.** *Italic reads as a turn of phrase.* `Inline code reads as a token.` And [a link reads as a link](#).

A second paragraph: short paragraphs make the eye breathe. Roc Grotesk has compact, workmanlike shapes that hold the rhythm of body text without competing with the Migra display headings above. The pairing reads as "documentation page meets personal notebook."

## A pull quote

For the moments worth pausing on:

{{< pull author="Antoine de Saint-Exupéry" >}}
Perfection is achieved, not when there is nothing more to add, but when there is nothing left to take away.
{{< /pull >}}

---

## Code

```bash
just clean && just build
hugo server --buildDrafts --navigateToChanged
```

```rust
fn fib(n: u64) -> u64 {
    match n {
        0 | 1 => n,
        _ => fib(n - 1) + fib(n - 2),
    }
}
```

## Type scale

A Major Third (1.25) modular scale, defined as CSS custom properties in `assets/css/extended/00-tokens.css`. Display sizes use `clamp()` so headings scale with viewport width.

| Token            | Computed | Role                  |
|------------------|---------:|-----------------------|
| `--text-xs`      |  12.8 px | captions, kbd labels  |
| `--text-sm`      |  14.4 px | meta, dim labels      |
| `--text-base`    |    16 px | body                  |
| `--text-lg`      |    20 px | lead, h4              |
| `--text-xl`      |    25 px | h3                    |
| `--text-2xl`     |    31 px | h2                    |
| `--text-3xl`     |    39 px | h1                    |
| `--text-display` | fluid 41.6 → 54.4 px | profile / hero |

## Weights

Roc Grotesk runs at four weights, each with a semantic role:

- **300 Light** for rare low-emphasis display or interface moments.
- **400 Regular** for body copy.
- **500 Medium** for nav links and form labels.
- **600 Bold** for in-prose emphasis (`**bold**`).

Migra runs at one weight here, **700 Extrabold**, used only for display headings. The free Migra package also includes 200 Extralight (regular and italic) and the italic Extrabold; those cuts are loaded but currently unused, kept for future editorial flourishes.

Geist Mono runs as a variable font. Code blocks use a medium base weight, with Shiki token scopes lifting keywords, decorators, support types, entities, and constants into a semibold weight.

## A note on color

Headings sit in `--primary`. Body copy sits in `--content`. Captions and meta sit in `--secondary`. Inactive state sits in `--tertiary`. All four come from the [Catppuccin](https://catppuccin.com) palette: Mocha for dark mode, Latte for light mode.
