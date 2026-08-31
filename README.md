# Recipes

A personal recipe collection written in markdown and published as a static site at
**https://garyjx.github.io/recipes/**.

Each file in `recipes/` is a plain markdown file. A small build script turns those files
into the website, so adding a recipe never involves touching HTML.

## Adding a recipe

Create a new markdown file in `recipes/`. The filename becomes the URL, so use lowercase
words separated by hyphens (`recipes/mapo-tofu.md` → `/recipes/mapo-tofu/`).

Follow the shape the existing recipes use:

```markdown
# Mapo Tofu
## 麻婆豆腐

A short paragraph describing the dish. This becomes the summary on the home page.

**Servings:** 4
**Total time:** 30 minutes

## Ingredients

- 14 oz (400 g) soft tofu
- 2 tbsp doubanjiang

## Instructions

### 1. Prep the tofu

Cut the tofu into cubes.
```

The build reads that structure directly:

| Part of the file | Where it shows up |
| --- | --- |
| `# Heading` | Recipe title, page title, card title |
| `## Heading` right after the title | Subtitle (used for the Chinese name) |
| First paragraph | Summary on the home page and the meta description |
| `**Label:** value` lines | The labelled chips under the title |
| `## Ingredients` | Rendered as a tap-to-check-off list |
| Every other `## Heading` | A section, linked from the "On this page" nav |

Nothing is required except the `# Title`. If a recipe has no description paragraph, the
home page falls back to listing its first few ingredients.

Tags (`Noodles`, `Soup`, `Spicy`, and so on) are inferred from the title and ingredients
and power the filter buttons. To set them yourself, add YAML front matter:

```markdown
---
tags: [Noodles, Spicy, Weeknight]
---
```

Front matter also accepts `title`, `subtitle`, and `description` if you ever want to
override what the parser picks up.

## Running it locally

Requires Node 20 or newer.

```bash
npm install
npm run serve     # builds, then serves http://localhost:4173
```

Use `npm run build` on its own to write the site to `dist/` without starting a server.
`dist/` is generated output and is not committed.

## Publishing

Pushing to `main` triggers `.github/workflows/deploy.yml`, which builds the site and
publishes it to GitHub Pages.

This needs to be enabled once: in the repository's **Settings → Pages**, set **Source**
to **GitHub Actions**.

## How it's put together

```
recipes/            Markdown source — the only files you edit day to day
assets/             Stylesheet, client-side JS, favicon (copied verbatim into the build)
scripts/build.mjs   Renders the markdown into dist/
scripts/parse-recipe.mjs  Pulls title, summary, meta, tags, and ingredients out of a file
scripts/serve.mjs   Local preview server
```

`marked` is the only dependency. `.npmrc` pins installs to the public npm registry so the
build works the same on a work laptop and on a CI runner.
