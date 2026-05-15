default:
    @just --list

# Run a local dev server with drafts and future posts
dev:
    bun run dev

# Production build (matches GitHub Actions)
build: clean
    bun run build

# Generate AVIF and WebP sidecars for content images
images:
    bun run images

# Remove generated artifacts
clean:
    rm -rf public resources

# Create a new post bundle: just new my-post-slug
new SLUG:
    hugo new --kind post posts/{{SLUG}}/index.md

# Bump PaperMod theme to latest master and tidy go.sum
update-theme:
    hugo mod get github.com/adityatelange/hugo-PaperMod@master
    hugo mod tidy

# Build with verbose logging so deprecations surface
check: clean
    bun run test:review
    bun run build:hugo -- --logLevel info
    bun run highlight
