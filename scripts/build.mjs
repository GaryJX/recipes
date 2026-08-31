import { readdir, readFile, mkdir, writeFile, cp, rm } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Marked } from 'marked';
import { parseRecipe } from './parse-recipe.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const recipesDir = join(root, 'recipes');
const assetsDir = join(root, 'assets');
const outDir = join(root, 'dist');

const SITE = {
  title: 'Recipes',
  tagline: 'A small, growing collection of home-cooked dishes — written the way I actually cook them.',
  description: 'A personal collection of home-cooked recipes.',
};

const escapeHtml = (value = '') =>
  String(value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char]);

const slugify = (value) =>
  value.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-').replace(/^-+|-+$/g, '') || 'section';

/**
 * Hands out page-unique anchors. Reserves the layout's own ids so a heading like
 * "### Main" can never collide with the <main> landmark.
 */
function createSlugger() {
  const used = new Set(['content', 'main', 'search', 'cards', 'empty']);
  return (value) => {
    const base = slugify(value);
    let id = base;
    let suffix = 2;
    while (used.has(id)) id = `${base}-${suffix++}`;
    used.add(id);
    return id;
  };
}

function createMarked(slug) {
  const marked = new Marked({ gfm: true });
  marked.use({
    renderer: {
      heading({ tokens, depth }) {
        const text = this.parser.parseInline(tokens);
        // Depth-2 anchors live on the wrapping <section>, so only sub-headings need ids.
        if (depth <= 2) return `<h${depth}>${text}</h${depth}>\n`;
        return `<h${depth} id="${slug(text.replace(/<[^>]+>/g, ''))}">${text}</h${depth}>\n`;
      },
    },
  });
  return marked;
}

/** Groups the body's top-level (`##`) headings into sections so each can be styled and linked. */
function renderSections(body) {
  const slug = createSlugger();
  const marked = createMarked(slug);

  const tokens = marked.lexer(body);
  const groups = [];
  let current = { title: '', tokens: [] };

  for (const token of tokens) {
    if (token.type === 'heading' && token.depth === 2) {
      if (current.tokens.length > 0 || current.title) groups.push(current);
      current = { title: token.text, tokens: [token] };
    } else {
      current.tokens.push(token);
    }
  }
  if (current.tokens.length > 0 || current.title) groups.push(current);

  return groups.map((group) => {
    const id = slug(group.title || 'intro');
    const kind = /ingredient/i.test(group.title) ? ' is-ingredients' : '';
    const html = marked.parser(group.tokens);
    return { id, title: group.title, html: `<section id="${id}" class="section${kind}">${html}</section>` };
  });
}

function layout({ base, title, description, bodyClass = '', main }) {
  return `<!DOCTYPE html>
<html lang="en" data-theme="light">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(description)}">
<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="${escapeHtml(description)}">
<meta property="og:type" content="website">
<link rel="icon" href="${base}assets/favicon.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Source+Serif+4:ital,opsz,wght@0,8..60,400;0,8..60,600;1,8..60,400&family=Inter:wght@400;500;600&display=swap">
<link rel="stylesheet" href="${base}assets/styles.css">
<script>
  (function () {
    var stored = null;
    try { stored = localStorage.getItem('theme'); } catch (e) {}
    var dark = stored ? stored === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  })();
</script>
</head>
<body class="${bodyClass}">
<a class="skip-link" href="#content">Skip to content</a>
<header class="site-header">
  <div class="wrap header-inner">
    <a class="brand" href="${base}">
      <span class="brand-mark" aria-hidden="true"></span>
      <span>${escapeHtml(SITE.title)}</span>
    </a>
    <button class="theme-toggle" type="button" data-theme-toggle aria-label="Toggle color theme">
      <span class="theme-toggle-icon" aria-hidden="true"></span>
    </button>
  </div>
</header>
<main id="content">
${main}
</main>
<footer class="site-footer">
  <div class="wrap">
    <p>Written in markdown, served as a static site.</p>
  </div>
</footer>
<script src="${base}assets/site.js" defer></script>
</body>
</html>
`;
}

function metaChips(meta) {
  if (meta.length === 0) return '';
  const items = meta
    .map((item) => `<div class="chip"><span class="chip-label">${escapeHtml(item.label)}</span><span class="chip-value">${escapeHtml(item.value)}</span></div>`)
    .join('');
  return `<div class="chips">${items}</div>`;
}

function tagPills(tags) {
  if (tags.length === 0) return '';
  return `<ul class="tags">${tags.map((tag) => `<li class="tag">${escapeHtml(tag)}</li>`).join('')}</ul>`;
}

function renderIndex(recipes) {
  const allTags = [...new Set(recipes.flatMap((recipe) => recipe.tags))].sort();

  const filters = [
    '<button class="filter is-active" type="button" data-filter="all">All</button>',
    ...allTags.map((tag) => `<button class="filter" type="button" data-filter="${escapeHtml(tag)}">${escapeHtml(tag)}</button>`),
  ].join('');

  const cards = recipes
    .map((recipe) => {
      const searchText = [recipe.title, recipe.subtitle, recipe.description, recipe.tags.join(' '), recipe.ingredients.join(' ')]
        .join(' ')
        .toLowerCase();
      return `<li class="card-item" data-tags="${escapeHtml(recipe.tags.join('|'))}" data-search="${escapeHtml(searchText)}">
  <a class="card" href="recipes/${recipe.slug}/">
    <h2 class="card-title">${escapeHtml(recipe.title)}</h2>
    ${recipe.subtitle ? `<p class="card-subtitle">${escapeHtml(recipe.subtitle)}</p>` : ''}
    <p class="card-text">${escapeHtml(recipe.preview)}</p>
    <div class="card-foot">
      ${tagPills(recipe.tags)}
      <span class="card-cue" aria-hidden="true">Read</span>
    </div>
  </a>
</li>`;
    })
    .join('\n');

  const main = `<div class="wrap">
  <section class="hero">
    <p class="eyebrow">${recipes.length} recipe${recipes.length === 1 ? '' : 's'}</p>
    <h1>${escapeHtml(SITE.title)}</h1>
    <p class="lede">${escapeHtml(SITE.tagline)}</p>
  </section>

  <section class="controls" aria-label="Find a recipe">
    <div class="search">
      <input id="search" type="search" placeholder="Search recipes or ingredients" autocomplete="off" aria-label="Search recipes or ingredients">
    </div>
    <div class="filters" role="group" aria-label="Filter by tag">${filters}</div>
  </section>

  <ul class="cards" id="cards">
${cards}
  </ul>
  <p class="empty" id="empty" hidden>No recipes match that search.</p>
</div>`;

  return layout({ base: '', title: SITE.title, description: SITE.description, bodyClass: 'page-index', main });
}

function renderRecipe(recipe) {
  const { sections } = recipe;
  const toc = sections.filter((section) => section.title);
  const tocHtml = toc.length > 1
    ? `<nav class="toc" aria-label="On this page">
  <p class="toc-title">On this page</p>
  <ol>${toc.map((section) => `<li><a href="#${section.id}">${escapeHtml(section.title)}</a></li>`).join('')}</ol>
</nav>`
    : '';

  const main = `<div class="wrap">
  <a class="back" href="../../">Back to all recipes</a>
  <article class="recipe">
    <header class="recipe-head">
      <h1>${escapeHtml(recipe.title)}</h1>
      ${recipe.subtitle ? `<p class="recipe-subtitle">${escapeHtml(recipe.subtitle)}</p>` : ''}
      ${recipe.description ? `<p class="lede">${escapeHtml(recipe.description)}</p>` : ''}
      ${metaChips(recipe.meta)}
      ${tagPills(recipe.tags)}
    </header>
    <div class="recipe-body">
      ${tocHtml}
      <div class="prose">${sections.map((section) => section.html).join('\n')}</div>
    </div>
  </article>
</div>`;

  return layout({
    base: '../../',
    title: `${recipe.title} · ${SITE.title}`,
    description: recipe.description || recipe.preview,
    bodyClass: 'page-recipe',
    main,
  });
}

function render404() {
  const main = `<div class="wrap">
  <section class="hero">
    <p class="eyebrow">404</p>
    <h1>This page isn't on the menu</h1>
    <p class="lede">The recipe you're looking for doesn't exist or has moved.</p>
    <p><a class="back" href="./">Back to all recipes</a></p>
  </section>
</div>`;
  return layout({ base: '', title: `Not found · ${SITE.title}`, description: 'Page not found.', main });
}

async function build() {
  const files = (await readdir(recipesDir)).filter((name) => name.endsWith('.md')).sort();

  if (files.length === 0) throw new Error(`No markdown recipes found in ${recipesDir}`);

  const recipes = [];
  for (const file of files) {
    const source = await readFile(join(recipesDir, file), 'utf8');
    const recipe = parseRecipe(source, file.replace(/\.md$/, ''));
    recipes.push({ ...recipe, sections: renderSections(recipe.body) });
  }

  recipes.sort((a, b) => a.title.localeCompare(b.title));

  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });
  await cp(assetsDir, join(outDir, 'assets'), { recursive: true });
  await writeFile(join(outDir, '.nojekyll'), '');
  await writeFile(join(outDir, 'index.html'), renderIndex(recipes));
  await writeFile(join(outDir, '404.html'), render404());

  for (const recipe of recipes) {
    const dir = join(outDir, 'recipes', recipe.slug);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'index.html'), renderRecipe(recipe));
  }

  console.log(`Built ${recipes.length} recipes into dist/`);
  for (const recipe of recipes) console.log(`  · ${recipe.title} → recipes/${recipe.slug}/`);
}

await build();
