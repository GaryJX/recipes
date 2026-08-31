const UNITS = new Set([
  'cup', 'cups', 'tbsp', 'tablespoon', 'tablespoons', 'tsp', 'teaspoon', 'teaspoons',
  'oz', 'ounce', 'ounces', 'lb', 'lbs', 'pound', 'pounds', 'g', 'kg', 'ml', 'l', 'liter', 'liters',
  'clove', 'cloves', 'ear', 'ears', 'bunch', 'bunches', 'slice', 'slices', 'piece', 'pieces',
  'block', 'blocks', 'can', 'cans', 'sprig', 'sprigs', 'stalk', 'stalks', 'head', 'heads',
  'pinch', 'dash', 'small', 'medium', 'large', 'thin', 'thick',
]);

const FILLER = new Set(['of', 'about', 'roughly', 'approximately', 'a', 'an', 'to']);

const QUANTITY = /^[\d\u00BC-\u00BE\u2150-\u215E]+([\/\u2013\u2014\u2212.\-][\d\u00BC-\u00BE\u2150-\u215E]+)*$/;

const TAG_RULES = [
  { tag: 'Noodles', test: /noodle/i },
  { tag: 'Soup', test: /\b(soup|broth)\b/i },
  { tag: 'Tofu', test: /\btofu\b/i },
  { tag: 'Eggs', test: /\begg(s)?\b/i },
  { tag: 'Spicy', test: /\b(chili|chilli|sichuan peppercorn|gochujang)\b/i },
  { tag: 'Vegetables', test: /\b(bok choy|daikon|kabocha|carrot|cabbage|spinach|mushroom)\b/i },
  { tag: 'Chinese', test: /\b(chinese|shanxi|sichuan|chinkiang|cantonese|shanghai)\b/i },
];

/** Parses a minimal subset of YAML front matter: `key: value` and inline `[a, b]` lists. */
function parseFrontMatter(source) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(source);
  if (!match) return { data: {}, content: source };

  const data = {};
  for (const line of match[1].split(/\r?\n/)) {
    const pair = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line.trim());
    if (!pair) continue;
    const [, key, rawValue] = pair;
    const value = rawValue.replace(/^["']|["']$/g, '').trim();
    data[key] = value.startsWith('[')
      ? value.slice(1, -1).split(',').map((item) => item.trim().replace(/^["']|["']$/g, '')).filter(Boolean)
      : value;
  }
  return { data, content: source.slice(match[0].length) };
}

function stripInlineMarkdown(text) {
  return text
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/(\*\*|__|\*|_|`)/g, '')
    .trim();
}

/**
 * Reduces an ingredient line to the food itself, e.g.
 * "14 oz (400 g) extra-firm tofu" -> "extra-firm tofu".
 */
function ingredientName(line) {
  let text = stripInlineMarkdown(line)
    .replace(/\([^)]*\)/g, ' ')
    .replace(/^optional\s*[:\u2013\u2014-]\s*/i, '');
  text = text.split(/\s[\u2013\u2014-]\s|,|;|:/)[0];

  const words = text.split(/\s+/).filter(Boolean);
  while (words.length > 1) {
    const word = words[0].toLowerCase().replace(/[.\u00B7]/g, '');
    if (QUANTITY.test(word) || UNITS.has(word) || FILLER.has(word)) words.shift();
    else break;
  }
  return words.join(' ').replace(/\s+/g, ' ').trim();
}

function deriveTags(haystack) {
  return TAG_RULES.filter((rule) => rule.test.test(haystack)).map((rule) => rule.tag);
}

/**
 * Splits a recipe into the header fields the site renders as chrome (title, subtitle,
 * description, meta chips) and the markdown body that becomes the article.
 */
export function parseRecipe(source, slug) {
  const { data, content } = parseFrontMatter(source);
  const lines = content.split(/\r?\n/);

  let cursor = 0;
  const nextContentLine = () => {
    while (cursor < lines.length && lines[cursor].trim() === '') cursor += 1;
    return cursor < lines.length ? lines[cursor] : null;
  };

  let title = '';
  const first = nextContentLine();
  if (first && /^#\s+/.test(first.trim())) {
    title = stripInlineMarkdown(first.trim().replace(/^#\s+/, ''));
    cursor += 1;
  }

  let subtitle = '';
  const second = nextContentLine();
  if (second && /^##\s+/.test(second.trim())) {
    subtitle = stripInlineMarkdown(second.trim().replace(/^##\s+/, ''));
    cursor += 1;
  }

  const meta = [];
  const descriptionParts = [];
  while (cursor < lines.length && !/^#{1,6}\s+/.test(lines[cursor].trim())) {
    const line = lines[cursor].trim();
    cursor += 1;
    if (!line) continue;

    const fields = [...line.matchAll(/\*\*([^*]+?):\*\*\s*([^*]+?)(?=\s*\*\*|$)/g)];
    if (fields.length > 0) {
      for (const [, label, value] of fields) {
        meta.push({ label: label.trim(), value: value.trim().replace(/\s{2,}$/, '') });
      }
    } else {
      descriptionParts.push(stripInlineMarkdown(line));
    }
  }

  const body = lines.slice(cursor).join('\n').trim();

  const ingredients = [];
  const ingredientSection = /^##\s+Ingredients\s*$([\s\S]*?)(?=^##\s+|\Z)/m.exec(body);
  if (ingredientSection) {
    for (const line of ingredientSection[1].split(/\r?\n/)) {
      const item = /^\s*[-*+]\s+(.*)$/.exec(line);
      if (!item) continue;
      const name = ingredientName(item[1]);
      if (name && !ingredients.includes(name)) ingredients.push(name);
    }
  }

  let description = descriptionParts.join(' ').trim();
  if (!description) {
    // Only look ahead of the ingredient/instruction sections so a stray step
    // like "In your serving bowl, mix together:" never becomes the summary.
    const intro = body.split(/^##\s+(?:ingredients|instructions|preparation)\b/im)[0];
    const paragraph = /^(?!#|[-*+>|]|\s*$)(.+)$/m.exec(intro);
    description = paragraph ? stripInlineMarkdown(paragraph[1]) : '';
  }

  const tags = Array.isArray(data.tags) && data.tags.length > 0
    ? data.tags
    : deriveTags([title, subtitle, description, ingredients.join(' ')].join(' '));

  return {
    slug,
    title: data.title || title || slug,
    subtitle: data.subtitle || subtitle,
    description: data.description || description,
    preview: description || (ingredients.length > 0 ? `${ingredients.slice(0, 5).join(', ')}…` : ''),
    meta,
    tags,
    ingredients,
    body,
  };
}
