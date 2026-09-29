// SEO for the portfolio: writes, from the site's own data (PORTFOLIO_PROJECTS, INDEX_ORDER in
// index.html), the metadata block in <head> (description, canonical, Open Graph / Twitter cards,
// icons, JSON-LD: Person + WebSite + the works as CreativeWork), the <noscript> fallback (the
// same texts, readable without JavaScript and by crawlers), sitemap.xml and robots.txt.
// Run it again whenever titles, In short texts or the site address change:
//   node tools/build-seo.js            (from the portfolio folder)
const fs = require('fs');
const path = require('path');

const SITE = 'https://cyberspezie.github.io/';          // GitHub Pages user site (repo "cyberspezie.github.io")
const ROOT = path.join(__dirname, '..');
const INDEX = path.join(ROOT, 'index.html');

// Only "cyberspezie", always lowercase: the artist's real name appears on the site only in
// "about me", never in titles, previews or metadata (artist's rule). Of the social profiles only
// Instagram (@cyberspezie, the username) is linked to the site; no LinkedIn (it carries the real
// name), no GitHub, no email (artist's rule)
const PERSON = {
  name: 'cyberspezie',
  job: 'Creative Technologist & Multidisciplinary Artist',
  city: 'Milan',
  sameAs: ['https://www.instagram.com/cyberspezie/'],
  knowsAbout: ['creative technology', 'creative coding', 'interactive installations', 'physical computing',
    'electronics', 'Arduino', 'TouchDesigner', 'generative art', 'artificial intelligence', 'UI/UX design',
    'photogrammetry', 'digital art']
};

// Google Search Console, ownership of the URL-prefix property https://cyberspezie.github.io/
// (HTML tag method: a github.io domain has no DNS of its own for a TXT record)
const GOOGLE_VERIFICATION = '0aWvqDtBxg0HKCnZ7jw_tnNbqx0Z16egLxG6sRga-VE';

const TITLE = `${PERSON.name} — portfolio`;
const DESCRIPTION = `portfolio of ${PERSON.name}, creative technologist and multidisciplinary artist in milan: interactive installations, code, electronics, ai and film.`;

let html = fs.readFileSync(INDEX, 'utf8');

// the works, in the order of the index list
const projects = eval(html.match(/const PORTFOLIO_PROJECTS = (\[[\s\S]*?\n    \]);/)[1]);
const order = eval(html.match(/const INDEX_ORDER = (\[[\s\S]*?\]);/)[1]);
const rank = p => { const i = order.indexOf(p.id); return i < 0 ? order.length : i; };
projects.sort((a, b) => rank(a) - rank(b));

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const isoMonth = year => {                               // "june 2025" / "october 2023 – january 2024" → "2025-06" / "2023-10"
  const m = String(year).toLowerCase().match(/([a-z]+)\s+(\d{4})/);
  return m && MONTHS.includes(m[1]) ? `${m[2]}-${String(MONTHS.indexOf(m[1]) + 1).padStart(2, '0')}` : undefined;
};
// icons carry a content hash (?v=…): Safari keeps favicons in its own cache, which clearing
// website data doesn't empty; a new address makes it fetch the new icon
const iconV = f => require('crypto').createHash('md5').update(fs.readFileSync(path.join(ROOT, f))).digest('hex').slice(0, 8);
const icon = f => `${f}?v=${iconV(f)}`;
const ICON_LINKS = `<link rel="icon" href="${icon('favicon.ico')}" sizes="32x32">
  <link rel="icon" href="${icon('favicon-32.png')}" type="image/png" sizes="32x32">
  <link rel="icon" href="${icon('favicon.svg')}" type="image/svg+xml">
  <link rel="apple-touch-icon" href="${icon('apple-touch-icon.png')}">`;
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const person = { '@id': `${SITE}#person` };
const graph = [
  {
    '@type': 'Person', '@id': `${SITE}#person`, name: PERSON.name,
    jobTitle: PERSON.job, url: SITE,
    address: { '@type': 'PostalAddress', addressLocality: PERSON.city, addressCountry: 'IT' },
    affiliation: { '@type': 'CollegeOrUniversity', name: 'Brera Academy of Fine Arts' },
    knowsAbout: PERSON.knowsAbout, sameAs: PERSON.sameAs
  },
  { '@type': 'WebSite', '@id': `${SITE}#website`, url: SITE, name: PERSON.name, inLanguage: 'en', author: person },
  {
    '@type': 'ItemList', name: 'Works', itemListElement: projects.map((p, i) => ({
      '@type': 'ListItem', position: i + 1,
      item: Object.fromEntries(Object.entries({
        '@type': 'CreativeWork', name: p.title, url: `${SITE}#${p.id}`,
        alternateName: p.translation, description: p.concept || undefined, genre: p.medium,
        keywords: p.specs || undefined, dateCreated: isoMonth(p.year), creator: person,
        contributor: (p.credits || []).length ? p.credits.map(([, names]) => names).join(', ') : undefined
      }).filter(([, v]) => v !== undefined))
    }))
  }
];

const head = `<!-- SEO:START (written by tools/build-seo.js: edit there, not here) -->
  <meta name="google-site-verification" content="${GOOGLE_VERIFICATION}">
  <meta name="description" content="${esc(DESCRIPTION)}">
  <meta name="author" content="${esc(PERSON.name)}">
  <meta name="theme-color" content="#000000">
  <link rel="canonical" href="${SITE}">
  ${ICON_LINKS}
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="${PERSON.name}">
  <meta property="og:locale" content="en_US">
  <meta property="og:url" content="${SITE}">
  <meta property="og:title" content="${esc(TITLE)}">
  <meta property="og:description" content="${esc(DESCRIPTION)}">
  <meta property="og:image" content="${SITE}og-image.jpg">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:image:alt" content="${esc(PERSON.name)} — the portfolio's generative landscape with the works as stars">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${esc(TITLE)}">
  <meta name="twitter:description" content="${esc(DESCRIPTION)}">
  <meta name="twitter:image" content="${SITE}og-image.jpg">
  <script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@graph': graph })}</script>
  <!-- SEO:END -->`;

const noscript = `<!-- NOSCRIPT:START (written by tools/build-seo.js) -->
  <noscript>
    <div style="position:fixed;inset:0;z-index:100;overflow:auto;background:#000;color:#fff;padding:1.5rem;font-family:'Syne Mono',monospace;font-size:0.8125rem;line-height:1.6">
      <h2 style="font-size:1rem">${esc(PERSON.name)} — portfolio</h2>
      <p>${esc(PERSON.job)}, ${esc(PERSON.city)}. This portfolio is interactive: please enable JavaScript.</p>
      <ul style="list-style:none;padding:0;margin:1.5rem 0">
${projects.map(p => `        <li style="margin-bottom:1rem"><strong>${esc(p.title)}</strong>${p.translation ? ` (${esc(p.translation)})` : ''} — ${esc(p.medium)}, ${esc(p.year)}${p.concept ? `<br>${esc(p.concept)}` : ''}</li>`).join('\n')}
      </ul>
    </div>
  </noscript>
  <!-- NOSCRIPT:END -->`;

const replaceBlock = (src, start, end, block, fallbackAnchor, where) => {
  const re = new RegExp(`<!-- ${start}[\\s\\S]*?<!-- ${end} -->`);
  if (re.test(src)) return src.replace(re, block);
  return where === 'after' ? src.replace(fallbackAnchor, m => `${m}\n  ${block}`) : src.replace(fallbackAnchor, m => `${block}\n  ${m}`);
};

html = html.replace(/<title>[^<]*<\/title>/, `<title>${esc(TITLE)}</title>`);
html = replaceBlock(html, 'SEO:START', 'SEO:END', head, /<title>[^<]*<\/title>/, 'after');
html = replaceBlock(html, 'NOSCRIPT:START', 'NOSCRIPT:END', noscript, /<body[^>]*>/, 'after');
fs.writeFileSync(INDEX, html);

// the 404 page shows the same icons
const P404 = path.join(ROOT, '404.html');
fs.writeFileSync(P404, fs.readFileSync(P404, 'utf8')
  .replace(/[ \t]*<link rel="(?:icon|apple-touch-icon)"[^>]*>\n/g, '')
  .replace(/<\/title>\n/, m => `${m}  ${ICON_LINKS}\n`));

const today = new Date().toISOString().slice(0, 10);
fs.writeFileSync(path.join(ROOT, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${SITE}</loc>
    <lastmod>${today}</lastmod>
  </url>
</urlset>
`);

// images are scrambled mosaics, videos and sketches are only parts of the page: none of them
// is useful (or wanted) in search results; the page itself and its preview image stay open
fs.writeFileSync(path.join(ROOT, 'robots.txt'), `User-agent: *
Allow: /
Disallow: /images/
Disallow: /videos/
Disallow: /sketches/
Disallow: /tools/

Sitemap: ${SITE}sitemap.xml
`);

console.log(`SEO written for ${projects.length} works → ${SITE}`);
