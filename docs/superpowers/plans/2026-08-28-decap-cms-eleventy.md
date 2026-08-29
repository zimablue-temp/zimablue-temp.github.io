# Decap CMS + Eleventy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every piece of text on zimablue.org editable through Decap CMS, with the site rendered from YAML by Eleventy and deployed via GitHub Actions.

**Architecture:** Current hand-written `index.html` / `404.html` are ported 1:1 into Nunjucks templates (`_includes/`) driven by section-scoped YAML data files (`_data/`). Eleventy builds `_site/`; `src/` (css/js/img/docs) is passthrough-copied unchanged so every existing asset URL stays valid. A parity script guards each porting step: normalized generated HTML must equal the pre-port original. Decap CMS (`admin/`, vendored, git-backed) edits the YAML; a Cloudflare Worker (`oauth/`) proxies GitHub OAuth for login.

**Tech Stack:** Eleventy 3.x (`@11ty/eleventy`), Nunjucks, Node.js LTS (20+), Decap CMS 3.x (vendored), Cloudflare Workers (`wrangler`), GitHub Actions (`actions/deploy-pages`).

**Spec:** `docs/superpowers/specs/2026-08-28-decap-cms-eleventy-design.md`

## Global Constraints

- **Node.js** ≥ 20 (Eleventy 3.x requirement); CI uses `actions/setup-node` with `node-version: 20`.
- **Eleventy** `@11ty/eleventy@^3.0.0`.
- **`src/` is frozen** — no edits to `src/css/*`, `src/js/*`, `src/img/*`, `src/docs/*`. It is passthrough-copied to `_site/src/` verbatim.
- **Asset URLs unchanged** — templates keep referencing `src/css/…`, `src/js/…`, `src/img/…`, `src/docs/…` exactly as today.
- **Text fields carry raw inline HTML** — YAML values are the exact current inner HTML (`<i>`, `<br>`, `&nbsp;`, `&mdash;`, `&laquo;`). Templates output them with the Nunjucks `| safe` filter. No markdown widgets, no `md` filter.
- **Parity is byte-exact** (after whitespace/entity normalization) for every porting task, against golden fixtures captured from git commit `169874a` (pre-port `main` HEAD).
- **`publish_mode: simple`** — Decap commits straight to `main`.
- **Deploy source** is GitHub Actions, not "deploy from branch" (one-time manual switch, Task 2).
- **Language:** all UI copy in the data files is Russian, matching current content.
- Commit after every task with the message shown in its final step.

---

## File Structure

**Created:**
- `package.json`, `package-lock.json` — Eleventy dependency + scripts
- `.eleventy.js` — Eleventy config (dirs, passthrough, filters)
- `.eleventyignore` — `node_modules`, `_site`, `oauth`
- `.gitignore` — `_site/`, `node_modules/`
- `.nojekyll` — empty marker, passthrough-copied
- `scripts/parity-check.mjs` — normalized HTML diff harness
- `test/fixtures/index.golden.html`, `test/fixtures/404.golden.html` — pre-port snapshots
- `_includes/layout.njk` — `<html><head><body>` shell + script tags + `spaRedirect` conditional
- `_includes/partials/*.njk` — one per section (nav, hero, about, services, benefits, stats, research, feedback, partners, contacts, footer)
- `index.njk`, `404.njk` — thin pages: front matter + `layout.njk` + `{% include %}` list
- `_data/site.yml`, `about.yml`, `services.yml`, `benefits.yml`, `stats.yml`, `research.yml`, `feedback.yml`, `partners.yml`, `contacts.yml`
- `.github/workflows/deploy.yml` — build + deploy pipeline
- `admin/index.html`, `admin/config.yml`, `admin/decap-cms.js` (vendored)
- `oauth/wrangler.toml`, `oauth/package.json`, `oauth/src/index.js`
- `admin/README.md` — editor instructions

**Deleted (Task 1):**
- `index.html`, `404.html` — replaced by generated output (`index.njk` / `404.njk` + `permalink`)

**Untouched:**
- `src/**`, `CNAME`

---

## Task 1: Eleventy scaffold + parity harness + hardcoded templates

Stand up Eleventy so it emits `_site/index.html` and `_site/404.html` that are byte-identical (post-normalization) to the current files, with the entire markup still hardcoded in the layout. No data files yet. This locks the build, the passthrough, and the test harness before any content moves.

**Files:**
- Create: `package.json`, `.gitignore`, `.nojekyll`, `.eleventyignore`, `.eleventy.js`
- Create: `scripts/parity-check.mjs`
- Create: `test/fixtures/index.golden.html`, `test/fixtures/404.golden.html`
- Create: `_includes/layout.njk`, `_includes/partials/page.njk`
- Create: `index.njk`, `404.njk`
- Delete: `index.html`, `404.html` (preserved in git history and as golden fixtures; `index.njk`/`404.njk` now own these output paths)

**Interfaces:**
- Produces: `npm run build` → runs `eleventy`, writes `_site/`.
- Produces: `npm run parity` → runs `node scripts/parity-check.mjs`; exits 0 when `_site/index.html` matches `test/fixtures/index.golden.html` and `_site/404.html` matches `test/fixtures/404.golden.html` (both normalized), non-zero + a token diff report otherwise.
- Produces: `_includes/layout.njk` — page shell: `<!DOCTYPE>`, `<html lang="ru" data-theme="light">`, full `<head>` (hardcoded for now), `<body>`, `{{ content | safe }}`, `</body>`, the trailing `<script>` block, and **no** `</html>` (matches source). Reads a boolean `spaRedirect` (page front matter) that toggles the head redirect `<script>` between active (true) and HTML-commented (false).
- Produces: `_includes/partials/page.njk` — the entire page body (everything between `<body>` and `</body>` in the source). Task 4+ carve one `<section>` at a time out of this file into their own partials.
- Produces: `index.njk` / `404.njk` — front matter (`layout`, `spaRedirect`, `permalink`) + a single `{% include "partials/page.njk" %}`.
- Consumes: nothing.

- [ ] **Step 1: Capture golden fixtures from the pre-port commit**

```bash
git show 169874a:index.html > test/fixtures/index.golden.html
git show 169874a:404.html > test/fixtures/404.golden.html
```

(Create `test/fixtures/` first: `mkdir -p test/fixtures`.)

Then remove the originals so they do not collide with `index.njk` / `404.njk` output paths:

```bash
git rm index.html 404.html
```

- [ ] **Step 2: Write `package.json`**

```json
{
  "name": "zimablue-site",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "eleventy",
    "serve": "eleventy --serve",
    "parity": "node scripts/parity-check.mjs",
    "cms": "decap-server"
  },
  "devDependencies": {
    "@11ty/eleventy": "^3.0.0",
    "decap-server": "^3.1.3"
  }
}
```

Then `npm install` (generates `package-lock.json`).

- [ ] **Step 3: Write `.gitignore`, `.nojekyll`, `.eleventyignore`**

`.gitignore`:
```
_site/
node_modules/
```

`.nojekyll`: empty file.

`.eleventyignore`:
```
node_modules
_site
oauth
README.md
```

- [ ] **Step 4: Write `.eleventy.js`**

```js
export default function (eleventyConfig) {
  eleventyConfig.addPassthroughCopy("src");
  eleventyConfig.addPassthroughCopy("admin");
  eleventyConfig.addPassthroughCopy("CNAME");
  eleventyConfig.addPassthroughCopy(".nojekyll");

  return {
    dir: {
      input: ".",
      output: "_site",
      includes: "_includes",
      data: "_data",
    },
    htmlTemplateEngine: "njk",
    markdownTemplateEngine: false,
  };
}
```

- [ ] **Step 5: Write `scripts/parity-check.mjs`**

```js
import { readFileSync } from "node:fs";

const PAIRS = [
  ["_site/index.html", "test/fixtures/index.golden.html"],
  ["_site/404.html", "test/fixtures/404.golden.html"],
];

// Named entities the source uses.
// &nbsp; and a literal NBSP both fold to the same sentinel and are NOT
// collapsed as whitespace, so a dropped non-breaking space fails parity.
const ENTITIES = {
  "&nbsp;": " ", "&mdash;": "—", "&ndash;": "–",
  "&laquo;": "«", "&raquo;": "»", "&rsquo;": "’",
  "&lsquo;": "‘", "&amp;": "&", "&quot;": '"', "&#39;": "'",
};
// ^ the value paired with "&nbsp;" above is a LITERAL U+00A0 byte, not a
//   regular space. Keep it that way.

function normalize(html) {
  let s = html;
  s = s.replace(/<!--[\s\S]*?-->/g, "");           // strip HTML comments
  for (const [k, v] of Object.entries(ENTITIES)) s = s.split(k).join(v);
  s = s.replace(/[ \t\r\n\f]+/g, " ");             // collapse ASCII whitespace; NBSP survives
  s = s.replace(/> </g, "><");                     // drop inter-tag spaces
  s = s.replace(/ >/g, ">").replace(/< /g, "<");
  s = s.replace(/ *\/>/g, ">");                    // <br /> -> <br>
  return s.trim();
}

// NOTE: JS `\s` matches U+00A0, so the regexes above deliberately use an
// explicit ASCII class to keep non-breaking spaces scored. Adjust the
// normalizer ONLY for truly insignificant differences (indentation,
// `/>` style) — never to hide a real markup or text change.

function lineDiff(a, b) {
  // crude token diff for the report: split on "><" boundaries
  const ax = a.replace(/></g, ">\n<").split("\n");
  const bx = b.replace(/></g, ">\n<").split("\n");
  const out = [];
  const n = Math.max(ax.length, bx.length);
  for (let i = 0; i < n; i++) {
    if (ax[i] !== bx[i]) {
      out.push(`  line ${i + 1}:`);
      out.push(`   - got:    ${ax[i] ?? "<eof>"}`);
      out.push(`   + expect: ${bx[i] ?? "<eof>"}`);
      if (out.length > 60) { out.push("  ... (truncated)"); break; }
    }
  }
  return out.join("\n");
}

let failed = false;
for (const [got, expect] of PAIRS) {
  const g = normalize(readFileSync(got, "utf8"));
  const e = normalize(readFileSync(expect, "utf8"));
  if (g === e) {
    console.log(`PASS  ${got}`);
  } else {
    failed = true;
    console.log(`FAIL  ${got}  != ${expect}`);
    console.log(lineDiff(g, e));
  }
}
process.exit(failed ? 1 : 0);
```

- [ ] **Step 6: Split the current markup into `layout.njk` (shell) + `partials/page.njk` (body)**

Take the current `index.html`. Everything from `<!DOCTYPE html>` down to and including `<body>`, plus everything from `</body>` to end of file (the `<!-- Javascript -->` script block), goes into `_includes/layout.njk`. Insert `{{ content | safe }}` on its own line between `<body>` and `</body>`. Everything that was **between** `<body>` and `</body>` goes into `_includes/partials/page.njk` unchanged.

In `layout.njk`, make one change: replace the commented redirect block in `<head>` (the `<!-- <script> … </script> -->` at original lines 15–29) with:
   ```njk
   {% if spaRedirect %}
   <script>
       window.location.href = "/";
       if (window.sessionStorage.path) {
           let path = window.sessionStorage.path;
           window.history.pushState(null, null, path);
           window.sessionStorage.removeItem('path');
       } else {
           let path = window.location.pathname;
           window.sessionStorage.path = path;
           window.location.href = '/';
       }
   </script>
   {% else %}
   <!-- <script>
       window.location.href = "/";

       if (window.sessionStorage.path) {
           let path = window.sessionStorage.path;
           window.history.pushState(null, null, path);
           window.sessionStorage.removeItem('path');

       } else {
           let path = window.location.pathname;
           window.sessionStorage.path = path;
           window.location.href = '/';
       }
   </script> -->
   {% endif %}
   ```
   The `{% else %}` branch must be the comment **verbatim** from `index.html` (the parity normalizer strips comments, so its exact text is not scored — but keep it faithful for future readers). Keep the trailing `<script>` tags and the missing `</html>` exactly as the source has them.

- [ ] **Step 7: Write `index.njk` and `404.njk`**

`index.njk`:
```njk
---
layout: layout.njk
spaRedirect: false
permalink: /index.html
---
{% include "partials/page.njk" %}
```

`404.njk`:
```njk
---
layout: layout.njk
spaRedirect: true
permalink: /404.html
---
{% include "partials/page.njk" %}
```

(`permalink` pins output names. Both pages render the same body; only `spaRedirect` differs.)

- [ ] **Step 8: Build and run parity — expect PASS**

```bash
npm run build && npm run parity
```
Expected: `PASS  _site/index.html` and `PASS  _site/404.html`, exit 0.
If FAIL: inspect the printed token diff, adjust `normalize()` **only** for genuinely-insignificant differences (whitespace, entity spelling, `/>`), never to paper over a real markup change.

- [ ] **Step 9: Verify passthrough copied assets**

```bash
test -f _site/src/css/bulma.css && test -f _site/src/js/index.js && test -f _site/CNAME && echo OK
```
Expected: `OK`.

- [ ] **Step 10: Commit**

```bash
git add package.json package-lock.json .gitignore .nojekyll .eleventyignore .eleventy.js scripts/ test/ _includes/ index.njk 404.njk
git commit -m "build: Eleventy scaffold with parity harness, layout + page partial"
```

---

## Task 2: GitHub Actions build + deploy pipeline

Add the workflow that builds with Eleventy and publishes `_site` to GitHub Pages. The deploy job is gated to `main`; pushes to other branches only run the build (CI signal).

**Files:**
- Create: `.github/workflows/deploy.yml`

**Interfaces:**
- Consumes: `npm ci`, `npm run build` from Task 1.
- Produces: on push to `main`, `_site/` is published via `actions/deploy-pages`.

- [ ] **Step 1: Write `.github/workflows/deploy.yml`**

```yaml
name: Build and deploy

on:
  push:
    branches: [main]
  pull_request:
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npm run build
      - run: npm run parity
      - uses: actions/upload-pages-artifact@v3
        with:
          path: _site

  deploy:
    needs: build
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

- [ ] **Step 2: Validate the workflow YAML parses**

```bash
node -e "import('node:fs').then(fs=>import('yaml')).catch(()=>{});" 2>/dev/null; npx --yes js-yaml .github/workflows/deploy.yml > /dev/null && echo "YAML OK"
```
Expected: `YAML OK`. (If `js-yaml` CLI unavailable, use any YAML linter; the check is that it parses.)

- [ ] **Step 3: Confirm build+parity still green locally**

```bash
npm ci && npm run build && npm run parity
```
Expected: exit 0, both `PASS`.

- [ ] **Step 4: Commit**

```bash
git add .github/
git commit -m "ci: build and deploy _site to GitHub Pages via Actions"
```

- [ ] **Step 5: Manual verification note (record in PR description, do not block the task)**

After this branch is pushed: open the repo Actions tab, confirm the `build` job is green on the branch. The `deploy` job will not run until `main`. Before first `main` merge, a human switches **Settings → Pages → Source → GitHub Actions** (spec §8 step 1).

---

## Task 3: `site.yml` + head + nav

First content extraction. `<head>` fields and the top `<nav>` move into `_data/site.yml`; the layout head reads from it; the nav becomes a partial with a loop.

**Files:**
- Create: `_data/site.yml`
- Create: `_includes/partials/nav.njk`
- Modify: `_includes/layout.njk` (head fields, `<html>` attrs)
- Modify: `_includes/partials/page.njk` (replace `<nav>…</nav>` with an include)

**Interfaces:**
- Consumes: Eleventy global data `site` (from `_data/site.yml`), available in every template.
- Produces: `site.meta.{title,description,lang,theme}`, `site.brand.{logo,logo_alt,favicon}`, `site.nav` (list of `{label, href}`), `site.cta` (`{label, href}`). Later tasks add `site.hero` and `site.footer` to the same file.

- [ ] **Step 1: Create `_data/site.yml`**

```yaml
meta:
  title: "ZimaBlue. Исследовательское агентство"
  description: ""            # empty => no <meta name="description"> is emitted (parity)
  lang: "ru"
  theme: "light"
brand:
  logo: "src/img/zimablue.svg"
  logo_alt: "Logo"
  favicon: "src/img/favicon.png"
nav:
  - { label: "О&nbsp;нас", href: "#about" }
  - { label: "Услуги", href: "#services" }
  - { label: "Исследования", href: "#research" }
  - { label: "Отзывы", href: "#feedback" }
cta:
  label: "Заказать исследование"
  href: "https://t.me/+77066396195"
```

- [ ] **Step 2: Edit `_includes/layout.njk` head**

- `<html lang="ru" data-theme="light">` → `<html lang="{{ site.meta.lang }}" data-theme="{{ site.meta.theme }}">`
- `<title>ZimaBlue. Исследовательское агентство</title>` → `<title>{{ site.meta.title | safe }}</title>`
- Immediately after the `<title>` line add:
  ```njk
  {% if site.meta.description %}<meta name="description" content="{{ site.meta.description }}">{% endif %}
  ```
- `<link rel="icon" type="image/x-icon" href="src/img/favicon.png">` → `href="{{ site.brand.favicon }}"`

Do **not** touch the CSS `<link>`s, `webfont.js`, or the `document.documentElement.className` script.

- [ ] **Step 3: Create `_includes/partials/nav.njk`**

```njk
<nav class="navbar">
    <div class="container">
        <div class="navbar-brand">
            <a class="navbar-item" href="#">
                <img src="{{ site.brand.logo }}" alt="{{ site.brand.logo_alt }}" />
            </a>
            <span class="navbar-burger ignoreMe" data-target="navbarMenuHeroB">
                <span class="ignoreMe"></span>
                <span class="ignoreMe"></span>
                <span class="ignoreMe"></span>
                <span class="ignoreMe"></span>
            </span>
        </div>
        <div id="navbarMenuHeroB" class="navbar-menu">
            <div class="navbar-end">
                {% for item in site.nav %}
                <a class="navbar-item has-text-black is-uppercase" href="{{ item.href }}"> {{ item.label | safe }} </a>
                {% endfor %}
                <a class="navbar-item has-text-black is-uppercase" href="{{ site.cta.href }}"
                    target="_blank"> {{ site.cta.label | safe }} </a>
            </div>
        </div>
    </div>
</nav>
```

Keep the single spaces around `{{ item.label | safe }}` — the source pads its anchor text with spaces and the normalizer preserves a space adjacent to non-tag text.

- [ ] **Step 4: Edit `_includes/partials/page.njk`**

Replace the entire `<nav class="navbar"> … </nav>` block (inside `<div class="hero-head">`) with:
```njk
{% include "partials/nav.njk" %}
```

- [ ] **Step 5: Build + parity — expect PASS**

```bash
npm run build && npm run parity
```
Expected: `PASS` for both. If the nav diff shows a class/attr/text mismatch, fix the partial. If it shows only spacing around the anchor label, adjust the template spaces to match the source.

- [ ] **Step 6: Commit**

```bash
git add _data/site.yml _includes/
git commit -m "content: extract head meta and nav into site.yml"
```

---

## Task 4: hero → `site.hero`

**Files:**
- Create: `_includes/partials/hero.njk`
- Modify: `_data/site.yml` (add `hero`)
- Modify: `_includes/partials/page.njk`

**Interfaces:**
- Consumes: `site` global.
- Produces: `site.hero.headline` (raw HTML string, includes `<br />` and `<i>`), `site.hero.tags` (list of `{text, colorful}`).

- [ ] **Step 1: Add to `_data/site.yml`**

```yaml
hero:
  headline: 'Не&nbsp;предполагаем,<br /><i>а&nbsp;исследуем</i>'
  tags:
    - { text: "UX/UI",        colorful: true  }
    - { text: "тренды",       colorful: false }
    - { text: "перспективы",  colorful: false }
    - { text: "аудитории",    colorful: true  }
    - { text: "бренды",       colorful: false }
    - { text: "гипотезы",     colorful: false }
    - { text: "фокус-группы", colorful: true  }
    - { text: "реклама",      colorful: false }
    - { text: "дизайн",       colorful: false }
    - { text: "эффективность", colorful: true }
```

- [ ] **Step 2: Create `_includes/partials/hero.njk`**

The source hero body + jGravity block (original lines ~61–78):
```njk
        <div class="hero-body">
            <div class="container has-text-centered">
                <p class="pt-6">{{ site.hero.headline | safe }}</p>
            </div>
        </div>
        <div class="jGravity">
            {% for tag in site.hero.tags %}
            <span class="tag{% if tag.colorful %} colorful{% endif %}">{{ tag.text | safe }}</span>
            {% endfor %}
        </div>
```

Note the source `<p class="pt-6">` content has no surrounding spaces — do not add any.

- [ ] **Step 3: Edit `page.njk`**

Replace the `<div class="hero-body">…</div>` and the following `<div class="jGravity">…</div>` (everything from `hero-body` up to the `</section>` that closes the hero) with:
```njk
{% include "partials/hero.njk" %}
```
Keep the `</section>` that closes `section.hero` in `page.njk`.

- [ ] **Step 4: Build + parity — expect PASS**

```bash
npm run build && npm run parity
```
Watch the diff for the `colorful` class toggling and for `<br />` vs `<br>` (normalizer folds `/>`, so both pass).

- [ ] **Step 5: Commit**

```bash
git add _data/site.yml _includes/
git commit -m "content: extract hero headline and tags into site.yml"
```

---

## Task 5: about → `_data/about.yml`

**Files:**
- Create: `_data/about.yml`, `_includes/partials/about.njk`
- Modify: `_includes/partials/page.njk`

**Interfaces:**
- Consumes: `about` global.
- Produces: `about.eyebrow` (string), `about.body` (raw HTML string).

- [ ] **Step 1: Create `_data/about.yml`**

```yaml
eyebrow: "О&nbsp;нас"
body: >-
  Наша миссия заключается в&nbsp;поисках истинных причин. Даже когда у&nbsp;нас есть
  гениальные гипотезы (а&nbsp;мы&nbsp;все свои гипотезы считаем гениальными), мы&nbsp;всегда
  их&nbsp;проверяем.
```

- [ ] **Step 2: Create `_includes/partials/about.njk`** (original lines ~79–98)

```njk
    <section class="section has-background-white is-medium" id="about" style="margin-top: 144px;">
        <div class="container">
            <div class="columns">
                <div class="column is-four-fifths">
                    <div class="title-with-icon">
                        <img src="src/img/icons/icon-arrow-left.svg">
                        <p>{{ about.eyebrow | safe }}</p>
                    </div>
                    <div data-effect-4>
                        <p class="title">
                            {{ about.body | safe }}
                        </p>
                    </div>
                </div>
            </div>
        </div>
    </section>
```

- [ ] **Step 3: Edit `page.njk`** — replace the whole `<section … id="about" …> … </section>` with `{% include "partials/about.njk" %}`.

- [ ] **Step 4: Build + parity — expect PASS.** The `>-` YAML folded scalar joins the wrapped lines with single spaces, matching the source paragraph. If parity flags a newline/space difference inside the paragraph, check the fold indicator (`>-` strips the trailing newline; body lines must be indented consistently).

- [ ] **Step 5: Commit**

```bash
git add _data/about.yml _includes/
git commit -m "content: extract about section into about.yml"
```

---

## Task 6: services → `_data/services.yml`

**Files:**
- Create: `_data/services.yml`, `_includes/partials/services.njk`
- Modify: `_includes/partials/page.njk`

**Interfaces:**
- Consumes: `services` global.
- Produces: `services.eyebrow` (string), `services.cards` — list of `{title, front_text, back_text, cta_label, cta_href}` (all raw HTML strings).

- [ ] **Step 1: Create `_data/services.yml`**

```yaml
eyebrow: "Наши услуги"
cards:
  - title: "<i>Качественные</i> исследования"
    front_text: >-
      фокус-группы, offline 1-to-1 опросы, UX/UI исследования, анализ
      аудитории, конкурентный анализ, mystery shopping
    back_text: >-
      Данные исследования предоставят полное понимание опыта, мнений и&nbsp;представлений
      текущих
      и&nbsp;потенциальных клиентов
    cta_label: "Заказать исследование"
    cta_href: "https://t.me/+77066396195"
  - title: "<i>Количественные</i> исследования"
    front_text: "Ad&nbsp;tracking, Brand Health Tracking online"
    back_text: >-
      Анализ данных, полученных с&nbsp;помощью большого количества опрошенных респондентов
      в&nbsp;ходе опроса или анкетирования
    cta_label: "Заказать исследование"
    cta_href: "https://t.me/+77066396195"
  - title: "<i>Маркетинговые</i> исследования"
    front_text: >-
      Позиции и&nbsp;перспективы на&nbsp;рынке, Размер рынка, Анализ конкурентов
      и&nbsp;аудитории, Анализ продуктовых и&nbsp;маркетинговых активностей,
      Sensitivity to&nbsp;pricing
    back_text: >-
      Поиск, сбор и&nbsp;анализ информации, которая обеспечивает потребности маркетинга
      компании
    cta_label: "Заказать исследование"
    cta_href: "https://t.me/+77066396195"
```

Verify each string against the source lines (services block, original lines ~98–199) character-for-character before running parity.

- [ ] **Step 2: Create `_includes/partials/services.njk`**

```njk
    <section class="section has-background-white is-medium" id="services">
        <div class="container">
            <div class="title-with-icon">
                <img src="src/img/icons/icon-arrow-left.svg">
                <p>{{ services.eyebrow | safe }}</p>
            </div>
            <div class="columns">
                {% for card in services.cards %}
                <div class="column">
                    <div class="flip-card cards-service">
                        <div class="flip-card-inner">
                            <div
                                class="flip-card-front is-flex is-flex-direction-column is-justify-content-space-between">
                                <p class="title">
                                    {{ card.title | safe }}
                                </p>
                                <p class="subtitle">
                                    {{ card.front_text | safe }}
                                </p>
                                <p class="is-hidden-tablet"></p>
                            </div>
                            <div
                                class="flip-card-back is-flex is-flex-direction-column is-justify-content-space-between">
                                <p class="subtitle has-text-white">
                                    {{ card.back_text | safe }}
                                </p>
                                <a class="button is-white is-outlined is-rounded" href="{{ card.cta_href }}"
                                    target="_blank">{{ card.cta_label | safe }}</a>
                                <p class="is-hidden-tablet"></p>
                            </div>
                        </div>
                        <button class="flip-icon" onclick="toggleIcon(this)">
                            <span class="icon ignoreMe"></span>
                        </button>
                    </div>
                </div>
                {% endfor %}
            </div>
        </div>
    </section>
```

- [ ] **Step 3: Edit `page.njk`** — replace `<section … id="services"> … </section>` with `{% include "partials/services.njk" %}`.

- [ ] **Step 4: Build + parity — expect PASS.** If a card's text mismatches, fix the YAML value (not the normalizer). Common trap: the first card's `back_text` in the source wraps oddly ("текущих\n и потенциальных") — reproduce the words exactly; whitespace between them is normalized.

- [ ] **Step 5: Commit**

```bash
git add _data/services.yml _includes/
git commit -m "content: extract services cards into services.yml"
```

---

## Task 7: benefits → `_data/benefits.yml`

The source renders the benefits paragraph **twice** — once for desktop (`is-size-3 is-hidden-mobile`), once for mobile (`is-size-4 is-hidden-tablet`) — with identical text. The template renders both from one value.

**Files:**
- Create: `_data/benefits.yml`, `_includes/partials/benefits.njk`
- Modify: `_includes/partials/page.njk`

**Interfaces:**
- Consumes: `benefits` global.
- Produces: `benefits.eyebrow` (string), `benefits.body` (raw HTML string).

- [ ] **Step 1: Create `_data/benefits.yml`**

```yaml
eyebrow: "Наши преимущества"
body: >-
  Мы&nbsp;разработали курс по&nbsp;исследованиям для университетов и&nbsp;онлайн-платформ
  с&nbsp;применением <i>уникального алгоритма</i> обработки данных.
```

- [ ] **Step 2: Create `_includes/partials/benefits.njk`** (original lines ~199–219)

```njk
    <section class="section has-background-white is-medium pb-0" id="benefits">
        <div class="container">
            <div class="columns">
                <div class="column is-three-fifths">
                    <div class="title-with-icon">
                        <img src="src/img/icons/icon-arrow-left.svg">
                        <p>{{ benefits.eyebrow | safe }}</p>
                    </div>
                    <p class="has-text-black is-black is-size-3 is-hidden-mobile">
                        {{ benefits.body | safe }}
                    </p>
                    <p class="has-text-black is-black is-size-4 is-hidden-tablet">
                        {{ benefits.body | safe }}
                    </p>
                </div>
            </div>
        </div>
    </section>
```

- [ ] **Step 3: Edit `page.njk`** — replace `<section … id="benefits"> … </section>` with `{% include "partials/benefits.njk" %}`.

- [ ] **Step 4: Build + parity — expect PASS.**

- [ ] **Step 5: Commit**

```bash
git add _data/benefits.yml _includes/
git commit -m "content: extract benefits section into benefits.yml"
```

---

## Task 8: stats ticker → `_data/stats.yml`

**Files:**
- Create: `_data/stats.yml`, `_includes/partials/stats.njk`
- Modify: `_includes/partials/page.njk`

**Interfaces:**
- Consumes: `stats` global.
- Produces: `stats.items` — list of `{value, label, accent}`. `value` is raw HTML (may contain `<small>`), `label` is raw HTML, `accent` is a boolean that adds ` accent` to the value's `<p class="title">`.

- [ ] **Step 1: Create `_data/stats.yml`** (original lines ~160–183)

```yaml
items:
  - value: "5<small>+</small>"
    label: "лет на&nbsp;рынке"
    accent: false
  - value: "120<small>+</small>"
    label: "проведенных фокус-групп"
    accent: false
  - value: "350<small>+</small>"
    label: "онлайн исследований"
    accent: true
  - value: "<small>от</small>&nbsp;3&nbsp;000 <small>до</small>&nbsp;10&nbsp;000 <small>человек</small>"
    label: "активная база наших респондентов"
    accent: false
```

- [ ] **Step 2: Create `_includes/partials/stats.njk`**

```njk
    <section class="has-background-white is-medium" style="padding-bottom: 144px;">
        <div class="services-ticker-block">
            <div class="stb_line_single">
                {% for item in stats.items %}
                <a class="stb-item is-clickable">
                    <p class="title{% if item.accent %} accent{% endif %}">{{ item.value | safe }}</p>
                    <p class="subtitle">{{ item.label | safe }}</p>
                </a>
                {% endfor %}
            </div>
        </div>
    </section>
```

Source item 4 wraps `10&nbsp;000\n <small>человек</small>` across lines — the single space in the YAML value between `10&nbsp;000` and `<small>человек</small>` matches after normalization.

- [ ] **Step 3: Edit `page.njk`** — replace the stats `<section … style="padding-bottom: 144px;"> … </section>` (the one right after `#benefits`) with `{% include "partials/stats.njk" %}`.

- [ ] **Step 4: Build + parity — expect PASS.** Verify the `accent` class appears only on item 3.

- [ ] **Step 5: Commit**

```bash
git add _data/stats.yml _includes/
git commit -m "content: extract stats ticker into stats.yml"
```

---

## Task 9: research → `_data/research.yml`

Seven cards laid out in Bulma rows of three `<div class="column">`; the source pads the final row with two empty `<div class="column"></div>`. The template chunks the list and pads.

**Files:**
- Create: `_data/research.yml`, `_includes/partials/research.njk`
- Modify: `_includes/partials/page.njk`

**Interfaces:**
- Consumes: `research` global.
- Produces: `research.eyebrow` (string), `research.cards` — list of `{title, back_text, cta_label, cta_href}` (raw HTML strings). Research cards have **no** `front_text` and **no** `is-hidden-tablet` spacer on the front face (unlike services).

- [ ] **Step 1: Create `_data/research.yml`**

Transcribe all seven cards verbatim from `test/fixtures/index.golden.html` (research block, original lines ~243–400). Structure and the first card as the pattern:

```yaml
eyebrow: "Наши исследования"
cards:
  - title: >-
      Казахстанские тренды 360: <i>потребительские тенденции</i> среди казахстанцев
      от&nbsp;артистов
      до&nbsp;автомобилей
    back_text: >-
      Барселона или Реал Мадрид? Турция или Египет? О&nbsp;какой марке машины мечтают
      казахстанцы?
      Ответы на&nbsp;эти и&nbsp;другие вопросы в&nbsp;нашем исследовании
      о&nbsp;предпочтениях
      казахстанцев
    cta_label: "Скачать исследование"
    cta_href: "https://drive.google.com/file/d/1IMOwVtlZxT2k97EwSGhIp5JKKlstMzDi/view"
  # card 2: "Какие бренды пользуются <i>популярностью у&nbsp;молодежи</i> РК?"
  #   cta_href https://drive.google.com/file/d/1E1ZcD_n2uKBhiqBezTU05gEbQlNpXNJk/view
  # card 3: "<i>Отношение казахстанцев</i> к&nbsp;социальным проектам, гендерному равноправию и&nbsp;инклюзии"
  #   cta_href https://drive.google.com/file/d/11XrglK6ucMtfzuvp-t6n_XHD77mc-7P2/view?usp=sharing
  # card 4: "Влияние на&nbsp;покупательские решения и&nbsp;<i>узнаваемость бренда</i>"
  #   cta_href https://drive.google.com/file/d/1GcpmWFDdWpP3ZgB2VpQF5fAfd_7Ao37r/view
  # card 5: "Закредитованность населения"
  #   cta_href https://drive.google.com/file/d/1UyUjvfAOSuIH1AtopdgcXvIP3KNy0GSe/view?usp=sharing
  # card 6: "Анализ предпочтений в&nbsp;казахскоязычном детском контенте: <i>Взгляд родителей</i>"
  #   cta_href https://docs.google.com/presentation/d/1pt2nUPJ0i8NZTvzxZPEuK7T3X6NJF667/edit#slide=id.p1
  # card 7: "Реклама vs&nbsp;Скидки: Что <i>Реально Влияет</i> на&nbsp;Продажи в&nbsp;2025 году"
  #   cta_href https://drive.google.com/file/d/1Y80jc3wl4pYayqV0Cgafee_Sp5ISSW8h/view
```

Fill cards 2–7 with their exact `back_text` from the fixture. The `# card N` comments give the exact `title` and `cta_href`; every `cta_label` is `"Скачать исследование"`.

- [ ] **Step 2: Create `_includes/partials/research.njk`**

```njk
    <section class="section has-background-white is-medium" id="research">
        <div class="container">
            <div class="columns">
                <div class="column is-three-fifths">
                    <div class="title-with-icon">
                        <img src="src/img/icons/icon-arrow-left.svg">
                        <p>{{ research.eyebrow | safe }}</p>
                    </div>
                </div>
            </div>
            {% for row in research.cards | batch(3) %}
            <div class="columns">
                {% for card in row %}
                <div class="column">
                    <div class="flip-card cards-service">
                        <div class="flip-card-inner">
                            <div
                                class="flip-card-front is-flex is-flex-direction-column is-justify-content-space-between">
                                <p class="title">
                                    {{ card.title | safe }}
                                </p>
                            </div>
                            <div
                                class="flip-card-back is-flex is-flex-direction-column is-justify-content-space-between">
                                <p class="subtitle has-text-white">
                                    {{ card.back_text | safe }}
                                </p>
                                <a class="button is-white is-outlined is-rounded"
                                    href="{{ card.cta_href }}"
                                    target="_blank">{{ card.cta_label | safe }}</a>
                                <p class="is-hidden-tablet"></p>
                            </div>
                        </div>
                        <button class="flip-icon" onclick="toggleIcon(this)">
                            <span class="icon ignoreMe"></span>
                        </button>
                    </div>
                </div>
                {% endfor %}
                {% for _ in range(3 - row.length) %}
                <div class="column">

                </div>
                {% endfor %}
            </div>
            {% endfor %}
        </div>
    </section>
```

`batch` is a built-in Nunjucks filter. The empty-column padding reproduces the source's trailing `<div class="column"></div>` blanks (they contain only whitespace in the source; normalizer collapses it).

- [ ] **Step 3: Edit `page.njk`** — replace `<section … id="research"> … </section>` with `{% include "partials/research.njk" %}`.

- [ ] **Step 4: Build + parity — expect PASS.** Inspect the diff carefully around row boundaries and the two padding columns. If Nunjucks `batch` is unavailable in the installed version, use `research.cards | slice(3)` semantics or a manual index loop — the rendered HTML must be unchanged.

- [ ] **Step 5: Commit**

```bash
git add _data/research.yml _includes/
git commit -m "content: extract research cards into research.yml"
```

---

## Task 10: feedback (tabs + letters + modals) → `_data/feedback.yml`

Highest-risk task: one list drives four source regions — desktop tab bar, mobile tab bar, tab-content bodies, and the modal image sheets.

**Files:**
- Create: `_data/feedback.yml`, `_includes/partials/feedback.njk`
- Modify: `_includes/partials/page.njk`

**Interfaces:**
- Consumes: `feedback` global.
- Produces: `feedback.eyebrow` (string), `feedback.items` — ordered list of `{slug, tab_label, quote, author, letter_image}`. `slug` feeds `id="modal-id-{{ slug }}"` and `data-target`; tab ids are positional (`tab1`, `tab2`, …). First item gets the `active` class in all three places.

- [ ] **Step 1: Create `_data/feedback.yml`**

`slug`, `tab_label`, and `letter_image` for all nine items (these are not derivable from the prose — copy exactly):

```yaml
eyebrow: "Рекомендательные письма"
items:
  - slug: tele2
    tab_label: "Tele2"
    letter_image: "src/docs/tele2.jpg"
    quote: >-
      Организация показала высокий уровень професионализма и&nbsp;компетентности
      в&nbsp;аспектах продвижения проектов в&nbsp;онлайн среде
    author: "Зозулевич В.Ю. <br /> Директор по&nbsp;организационному развитию<br /> и&nbsp;работе с&nbsp;персоналом"
  - slug: almau
    tab_label: "AlmaU"
    letter_image: "src/docs/almau.jpeg"
    quote: >-
      Мы&nbsp;рекомендуем Исследовательское Агентство ZimaBlue как
      высококвалифицированного
      и&nbsp;надежного партнера в&nbsp;области образования и&nbsp;исследований
    author: "Школа медиа и кино <br /> Almaty Management University"
  - slug: alphauz
    tab_label: "Alpha"
    letter_image: "src/docs/alphauz.jpeg"
  - slug: jusan
    tab_label: "Jusan"
    letter_image: "src/docs/jusan.jpeg"
  - slug: fet
    tab_label: "Фонд Татишева"
    letter_image: "src/docs/tatishev.jpeg"
  - slug: ac
    tab_label: "American Councils"
    letter_image: "src/docs/americancouncil.jpeg"
  - slug: bc
    tab_label: "British Councils"
    letter_image: "src/docs/britishcouncil.jpg"
  - slug: citix
    tab_label: "CITIX"
    letter_image: "src/docs/citix.jpeg"
  - slug: ofcorp
    tab_label: "OF CORP"
    letter_image: "src/docs/ofcorp.jpeg"
```

Then fill `quote` and `author` for items 3–9 verbatim from `test/fixtures/index.golden.html` (tab-content blocks, original lines ~437–606). Reference for locating each: item 3 `alphauz` "Их&nbsp;уникальный опыт…"; item 4 `jusan` "Готовность агентства адаптироваться…" (author ends `AO «Jusan Bank»` — literal guillemets); item 5 `fet` "Заслуга ZimaBlue в&nbsp;том…"; item 6 `ac` "Хочется отметить высокую компетентность…"; item 7 `bc` "...руководитель проекта Фарангиза Шукашева…"; item 8 `citix` "Особо отмечаем глубоĸое погружение…" (source uses the Cyrillic `ĸ` U+04C0-ish kra in this and item 9 — copy exactly); item 9 `ofcorp` "…профессиональный подход, внимательность ĸ деталям…".

- [ ] **Step 2: Create `_includes/partials/feedback.njk`**

```njk
    <section class="section has-background-white is-medium pb-0" id="feedback">
        <div class="container">
            <div class="title-with-icon">
                <img src="src/img/icons/icon-arrow-left.svg">
                <p>{{ feedback.eyebrow | safe }}</p>
            </div>
            <div class="tabs is-hidden-mobile">
                {% for item in feedback.items %}
                <button class="tab-button{% if loop.first %} active{% endif %}" data-tab="tab{{ loop.index }}">{{ item.tab_label | safe }}</button>
                {% endfor %}
            </div>
        </div>
    </section>
    <section class="has-background-white is-hidden-tablet">
        <div class="tabs" style="padding: 0 24px;">
            {% for item in feedback.items %}
            <button class="tab-button{% if loop.first %} active{% endif %}" data-tab="tab{{ loop.index }}">{{ item.tab_label | safe }}</button>
            {% endfor %}
        </div>
    </section>
    <section class="section has-background-white is-medium pt-6">
        <div class="container">
            <div class="columns">
                <div class="column is-three-quarters">
                    {% for item in feedback.items %}
                    <div class="tab-content{% if loop.first %} active{% endif %}" id="tab{{ loop.index }}">
                        <div class="cards-service">
                            <div class="is-flex is-flex-direction-column is-justify-content-space-between">
                                <p class="title">
                                    {{ item.quote | safe }}
                                </p>
                                <p class="subtitle">
                                    {{ item.author | safe }}
                                </p>
                                <button class="open-modal-btn feedback" data-target="modal-id-{{ item.slug }}">
                                    <span class="icon ignoreMe">+</span>
                                </button>
                            </div>
                        </div>
                    </div>
                    {% endfor %}
                </div>
            </div>
        </div>
    </section>
```

And the modal sheets partial content — append to `feedback.njk` after the sections above (the source places all modals together near end of `<body>`, so it must be emitted where the `<!-- Modal Sheets -->` block currently sits in `page.njk`, **not** inline here). Put the modal loop in a separate partial `_includes/partials/feedback-modals.njk`:

```njk
    <!-- Modal Sheets -->
    {% for item in feedback.items %}
    <div id="modal-id-{{ item.slug }}" class="modal">
        <div class="modal-background"></div>
        <div class="modal-card">
            <header class="modal-card-head">
                <button class="delete" aria-label="close"></button>
            </header>
            <section class="modal-card-body">
                <img src="{{ item.letter_image }}" />
            </section>
            <footer class="modal-card-foot">
            </footer>
        </div>
    </div>
    {% endfor %}
```

- [ ] **Step 3: Edit `page.njk`**
  - Replace the three feedback `<section>`s (`id="feedback"`, the `is-hidden-tablet` tabs section, and the `pt-6` tab-content section) with `{% include "partials/feedback.njk" %}`.
  - Replace the `<!-- Modal Sheets -->` comment and all nine `<div id="modal-id-…" class="modal">…</div>` blocks with `{% include "partials/feedback-modals.njk" %}`.

- [ ] **Step 4: Build + parity — expect PASS.** The likely failure points: (a) `active` class on the wrong element or missing; (b) `tab{{ loop.index }}` off by one — Nunjucks `loop.index` is 1-based, matching `tab1`; (c) a mistyped testimonial. Fix data/template, never the normalizer.

- [ ] **Step 5: Commit**

```bash
git add _data/feedback.yml _includes/
git commit -m "content: extract feedback tabs, letters and modals into feedback.yml"
```

---

## Task 11: partners marquee → `_data/partners.yml`

The source partners marquee currently contains **only empty** `<div class="item"></div>` placeholders — 12 per marquee track, 4 tracks (`.items.marquee` ×2 including one `aria-hidden="true"`, then `.items.marquee.reverce` ×2). The template reproduces this exactly when `logos` is empty, and emits one populated `.item` per logo otherwise.

**Files:**
- Create: `_data/partners.yml`, `_includes/partials/partners.njk`
- Modify: `_includes/partials/page.njk`

**Interfaces:**
- Consumes: `partners` global.
- Produces: `partners.eyebrow` (string), `partners.logos` — list of `{name, logo}` (empty list by default).

- [ ] **Step 1: Create `_data/partners.yml`**

```yaml
eyebrow: "Нам доверяют"
logos: []
```

- [ ] **Step 2: Create `_includes/partials/partners.njk`** (original lines ~611–686)

```njk
    <section class="section has-background-white is-medium" id="partners">
        <div class="container">
            <div class="columns">
                <div class="column is-four-fifths">
                    <div class="title-with-icon">
                        <img src="src/img/icons/icon-arrow-left.svg">
                        <p>{{ partners.eyebrow | safe }}</p>
                    </div>
                </div>
            </div>
        </div>
    </section>
    <section class="has-background-white is-medium" style="padding-bottom: 144px;">
        <div class="wrap">
            {% macro track(reverce, hidden) %}
            <div class="items marquee{% if reverce %} reverce{% endif %}"{% if hidden %} aria-hidden="true"{% endif %}>
                {% if partners.logos | length %}
                {% for logo in partners.logos %}
                <div class="item"><img src="{{ logo.logo }}" alt="{{ logo.name }}" /></div>
                {% endfor %}
                {% else %}
                {% for _ in range(12) %}
                <div class="item"></div>
                {% endfor %}
                {% endif %}
            </div>
            {% endmacro %}
            <div class="items-wrap">
                {{ track(false, false) }}
                {{ track(false, true) }}
            </div>
            <div class="items-wrap">
                {{ track(true, false) }}
                {{ track(true, true) }}
            </div>
        </div>
    </section>
```

Confirm against the source: the first `.items-wrap` uses `class="items marquee"` (no `reverce`); the second uses `class="items marquee reverce"`; the second track in each wrap carries `aria-hidden="true"`. The source order of attributes on the hidden reverce track is `aria-hidden="true" class="items marquee reverce"` — check the fixture and match attribute order exactly (adjust the macro so `aria-hidden` precedes `class` if that is what the source has).

- [ ] **Step 3: Edit `page.njk`** — replace both partners `<section>`s (`id="partners"` and the following marquee section) with `{% include "partials/partners.njk" %}`.

- [ ] **Step 4: Build + parity — expect PASS.** If attribute order on the marquee tracks differs, reorder in the macro. Do not change the normalizer.

- [ ] **Step 5: Commit**

```bash
git add _data/partners.yml _includes/
git commit -m "content: extract partners marquee into partners.yml"
```

---

## Task 12: contacts → `_data/contacts.yml`

**Files:**
- Create: `_data/contacts.yml`, `_includes/partials/contacts.njk`
- Modify: `_includes/partials/page.njk`

**Interfaces:**
- Consumes: `contacts` global.
- Produces: `contacts.eyebrow` (string), `contacts.email` (`{address, subject, cc, label}`), `contacts.instagram` (`{label, url}`).

- [ ] **Step 1: Create `_data/contacts.yml`** (original lines ~687–704)

```yaml
eyebrow: "Контакты"
email:
  address: "info@zimablue.net"
  subject: "Здравствуйте, хочу заказать исследование"
  cc: "farangizashukasheva@gmail.com"
  label: "info@zimablue.net"
instagram:
  label: "@zimablue.co"
  url: "https://www.instagram.com/zimablue.co/"
```

- [ ] **Step 2: Create `_includes/partials/contacts.njk`**

```njk
    <section class="section has-background-white is-medium is-relative" id="contacts">
        <div class="container">
            <div class="columns">
                <div class="column is-four-fifths">
                    <div class="title-with-icon">
                        <img src="src/img/icons/icon-arrow-left.svg">
                        <p>{{ contacts.eyebrow | safe }}</p>
                    </div>
                    <p class="has-text-black is-black is-size-3">email: <a
                            href="mailto:{{ contacts.email.address }}?subject={{ contacts.email.subject }}&cc={{ contacts.email.cc }}"
                            target="_blank" class="text-links">{{ contacts.email.label | safe }}</a></p>
                    <p class="has-text-black is-black is-size-3">instagram: <a
                            href="{{ contacts.instagram.url }}" target="_blank"
                            class="text-links">{{ contacts.instagram.label | safe }}</a></p>
                </div>
            </div>
        </div>
    </section>
```

Nunjucks autoescapes `&` in the `mailto:` to `&amp;`; the parity normalizer folds `&amp;` back to `&`, so it matches the source's raw `&cc=`. The Cyrillic subject and its literal space are emitted unchanged.

- [ ] **Step 3: Edit `page.njk`** — replace `<section … id="contacts"> … </section>` with `{% include "partials/contacts.njk" %}`.

- [ ] **Step 4: Build + parity — expect PASS.**

- [ ] **Step 5: Commit**

```bash
git add _data/contacts.yml _includes/
git commit -m "content: extract contacts section into contacts.yml"
```

---

## Task 13: footer → `site.footer` + final full-page parity

Last extraction. After this, `page.njk` should be nothing but a list of `{% include %}`s and the `<section class="hero …">` open/close wrapper.

**Files:**
- Modify: `_data/site.yml` (add `footer`)
- Create: `_includes/partials/footer.njk`
- Modify: `_includes/partials/page.njk`

**Interfaces:**
- Consumes: `site` global.
- Produces: `site.footer.links` (list of `{label, href}` — the five in-page anchor tags), `site.footer.instagram` (`{label, href}`), `site.footer.credit_html` (raw HTML string). The Telegram CTA link (with its inline SVG) is emitted by the template between the anchor links and the Instagram link, using `site.cta.href` / `site.cta.label`.

- [ ] **Step 1: Add to `_data/site.yml`** (original lines ~705–732)

```yaml
footer:
  links:
    - { label: "О&nbsp;нас",        href: "#about" }
    - { label: "Услуги",            href: "#services" }
    - { label: "Преимущества",      href: "#benefits" }
    - { label: "Исследования",      href: "#research" }
    - { label: "Отзывы",            href: "#feedback" }
  instagram: { label: "Instagram", href: "https://www.instagram.com/zimablue.co/" }
  credit_html: 'Собрано <a href="http://tinystudio.cc" class="ts" target="_blank">Tiny Studio</a>, 2024'
```

- [ ] **Step 2: Create `_includes/partials/footer.njk`**

Copy the `<section … id="footer"> … </section>` from the fixture verbatim, then parametrise:
- the five leading `<a class="tag" href="#…"> … </a>` become `{% for l in site.footer.links %}<a class="tag" href="{{ l.href }}"> {{ l.label | safe }} </a>{% endfor %}`
- the Telegram `<a class="tag" href="https://t.me/+77066396195" target="_blank"> Заказать исследование <svg …>…</svg> </a>` — keep the **entire `<svg>…</svg>` literally** in the template; replace the href with `{{ site.cta.href }}` and the text `Заказать исследование` with `{{ site.cta.label | safe }}`
- the Instagram `<a class="tag" … > Instagram </a>` becomes `<a class="tag" href="{{ site.footer.instagram.href }}" target="_blank"> {{ site.footer.instagram.label | safe }} </a>`
- the credit `<p class="has-text-right py-3">Собрано <a …>Tiny Studio</a>, 2024</p>` becomes `<p class="has-text-right py-3">{{ site.footer.credit_html | safe }}</p>`

Keep the single spaces inside every `<a class="tag"> … </a>` exactly as the source has them.

- [ ] **Step 3: Edit `page.njk`** — replace `<section … id="footer"> … </section>` with `{% include "partials/footer.njk" %}`.

- [ ] **Step 4: Full build + parity — expect PASS on both pages**

```bash
npm run build && npm run parity
```
Expected: `PASS  _site/index.html`, `PASS  _site/404.html`.

- [ ] **Step 5: Manual structural check of `page.njk`**

Open `_includes/partials/page.njk`. It must now contain only: the `<section class="hero is-white is-fullheight" id="#">` opening tag, `<div class="hero-head">`, `{% include "partials/nav.njk" %}`, closing `</div>`, `{% include "partials/hero.njk" %}`, `</section>`, then `{% include %}` lines for about, services, benefits, stats, research, feedback, partners, contacts, footer, then `{% include "partials/feedback-modals.njk" %}`. No literal section markup left. If any remains, it was missed in an earlier task — extract it now under the same parity gate.

- [ ] **Step 6: Commit**

```bash
git add _data/site.yml _includes/
git commit -m "content: extract footer into site.yml; page.njk is now include-only"
```

---

## Task 14: optional `typo` filter (default off)

A no-op by default. Ships the filter and a config flag so the client can later opt into automatic non-breaking-space insertion; wiring it now keeps parity green (flag off ⇒ identity function).

**Files:**
- Create: `lib/typo.mjs`
- Modify: `.eleventy.js`

**Interfaces:**
- Produces: Nunjucks filter `typo` — `typo(str)` returns `str` unchanged when `TYPO_ENABLED` is false; when true, inserts `&nbsp;` after short prepositions/conjunctions and replaces ` -- ` with ` — `.
- Consumes: nothing. **No template uses `| typo` in this plan** — it is available for future manual application.

- [ ] **Step 1: Create `lib/typo.mjs`**

```js
const SHORT = ["в","и","на","с","к","о","от","по","не","а","но","за","из","до","у","во","со","об","то"];

export const TYPO_ENABLED = process.env.TYPO === "1";

export function typo(input) {
  if (!TYPO_ENABLED || typeof input !== "string") return input;
  let s = input.replace(/ -- /g, " — ");
  const alt = SHORT.join("|");
  s = s.replace(new RegExp(`(^|[\\s(])(${alt}) `, "gi"), (_, p, w) => `${p}${w} `);
  return s;
}
```

- [ ] **Step 2: Register in `.eleventy.js`**

```js
import { typo } from "./lib/typo.mjs";
// inside the config function:
eleventyConfig.addFilter("typo", typo);
```

- [ ] **Step 3: Build + parity with flag off — expect PASS**

```bash
npm run build && npm run parity
```
Expected: unchanged, `PASS` both.

- [ ] **Step 4: Smoke-test the filter in isolation**

```bash
TYPO=1 node -e "import('./lib/typo.mjs').then(m=>{console.log(m.typo('мы в доме и в саду -- вот')); })"
```
Expected: `мы в​доме и​в​саду — вот` (with ` ` after each short word; `--` becomes `—`).

- [ ] **Step 5: Commit**

```bash
git add lib/ .eleventy.js
git commit -m "feat: add opt-in typo filter (disabled by default)"
```

---

## Task 15: Decap CMS admin (`admin/`)

Ships the editing UI. Verified locally against `decap-server` (no OAuth needed); the GitHub backend is wired in Task 16.

**Files:**
- Create: `admin/index.html`, `admin/config.yml`, `admin/decap-cms.js` (vendored, committed to the repo)
- Modify: `package.json` (already has `decap-server` from Task 1)

**Interfaces:**
- Consumes: every `_data/*.yml` file and its field shape as defined in Tasks 3–13.
- Produces: `/_site/admin/` — a working Decap instance. With `local_backend: true` it talks to `decap-server` on `localhost:8081`; in production it uses the GitHub backend via the Task 16 worker.

- [ ] **Step 1: Vendor the Decap bundle**

```bash
DECAP_VERSION=$(npm view decap-cms version)
echo "pinning decap-cms@$DECAP_VERSION"
curl -fL "https://unpkg.com/decap-cms@${DECAP_VERSION}/dist/decap-cms.js" -o admin/decap-cms.js
test -s admin/decap-cms.js && head -c 200 admin/decap-cms.js
```
Record the pinned version in a comment at the top of `admin/index.html`. Re-vendoring later = repeat this step with a new version.

- [ ] **Step 2: Create `admin/index.html`**

```html
<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>ZimaBlue — управление контентом</title>
  <!-- vendored decap-cms@<DECAP_VERSION> — re-vendor: see Task 15 Step 1 -->
</head>
<body>
  <script src="decap-cms.js"></script>
</body>
</html>
```

Decap auto-loads `config.yml` from the same directory.

- [ ] **Step 3: Create `admin/config.yml`**

```yaml
backend:
  name: github
  repo: zimablue-temp/zimablue-temp.github.io
  branch: main
  base_url: https://REPLACE-WITH-WORKER.workers.dev   # set in Task 16 Step 6

local_backend: true
publish_mode: simple
media_folder: src/img/uploads
public_folder: src/img/uploads
locale: ru

collections:
  - name: site
    label: "Настройки сайта"
    files:
      - name: site
        label: "Настройки сайта"
        file: _data/site.yml
        fields:
          - name: meta
            label: "Мета"
            widget: object
            fields:
              - { name: title, label: "Title", widget: string }
              - { name: description, label: "Meta description", widget: string, required: false }
              - { name: lang, label: "lang", widget: string, default: "ru" }
              - { name: theme, label: "Тема", widget: select, options: ["light", "dark"], default: "light" }
          - name: brand
            label: "Бренд"
            widget: object
            fields:
              - { name: logo, label: "Логотип", widget: image }
              - { name: logo_alt, label: "alt логотипа", widget: string }
              - { name: favicon, label: "Favicon", widget: image }
          - name: nav
            label: "Меню (шапка)"
            widget: list
            fields:
              - { name: label, label: "Текст", widget: string }
              - { name: href, label: "Ссылка", widget: string }
          - name: cta
            label: "Кнопка «Заказать исследование»"
            widget: object
            fields:
              - { name: label, widget: string }
              - { name: href, widget: string }
          - name: hero
            label: "Первый экран"
            widget: object
            fields:
              - { name: headline, label: "Заголовок (допускается HTML: <br />, <i>)", widget: text }
              - name: tags
                label: "Летающие теги"
                widget: list
                fields:
                  - { name: text, label: "Текст", widget: string }
                  - { name: colorful, label: "Цветной", widget: boolean, default: false }
          - name: footer
            label: "Футер"
            widget: object
            fields:
              - name: links
                label: "Ссылки"
                widget: list
                fields:
                  - { name: label, widget: string }
                  - { name: href, widget: string }
              - name: instagram
                widget: object
                fields:
                  - { name: label, widget: string }
                  - { name: href, widget: string }
              - { name: credit_html, label: "Подпись (HTML)", widget: string }

  - name: about
    label: "О нас"
    files:
      - name: about
        label: "О нас"
        file: _data/about.yml
        fields:
          - { name: eyebrow, label: "Надзаголовок", widget: string }
          - { name: body, label: "Текст (допускается HTML)", widget: text }

  - name: services
    label: "Услуги"
    files:
      - name: services
        label: "Услуги"
        file: _data/services.yml
        fields:
          - { name: eyebrow, widget: string }
          - name: cards
            label: "Карточки услуг"
            widget: list
            fields:
              - { name: title, label: "Заголовок (HTML)", widget: string }
              - { name: front_text, label: "Текст лицевой стороны (HTML)", widget: text }
              - { name: back_text, label: "Текст оборота (HTML)", widget: text }
              - { name: cta_label, widget: string }
              - { name: cta_href, widget: string }

  - name: benefits
    label: "Преимущества"
    files:
      - name: benefits
        label: "Преимущества"
        file: _data/benefits.yml
        fields:
          - { name: eyebrow, widget: string }
          - { name: body, label: "Текст (HTML)", widget: text }

  - name: stats
    label: "Цифры"
    files:
      - name: stats
        label: "Цифры"
        file: _data/stats.yml
        fields:
          - name: items
            label: "Показатели"
            widget: list
            fields:
              - { name: value, label: "Значение (HTML, можно <small>)", widget: string }
              - { name: label, label: "Подпись", widget: string }
              - { name: accent, label: "Акцентный цвет", widget: boolean, default: false }

  - name: research
    label: "Исследования"
    files:
      - name: research
        label: "Исследования"
        file: _data/research.yml
        fields:
          - { name: eyebrow, widget: string }
          - name: cards
            label: "Карточки исследований"
            widget: list
            fields:
              - { name: title, label: "Заголовок (HTML)", widget: string }
              - { name: back_text, label: "Текст оборота (HTML)", widget: text }
              - { name: cta_label, widget: string }
              - { name: cta_href, widget: string }

  - name: feedback
    label: "Рекомендательные письма"
    files:
      - name: feedback
        label: "Рекомендательные письма"
        file: _data/feedback.yml
        fields:
          - { name: eyebrow, widget: string }
          - name: items
            label: "Письма"
            widget: list
            fields:
              - { name: slug, label: "slug (уникальный, латиницей)", widget: string, pattern: ["^[a-z0-9-]+$", "только строчные латинские буквы, цифры и дефис"] }
              - { name: tab_label, label: "Подпись вкладки", widget: string }
              - { name: quote, label: "Цитата (HTML)", widget: text }
              - { name: author, label: "Автор (HTML; <br /> — перенос строки)", widget: text }
              - { name: letter_image, label: "Скан письма", widget: image, media_folder: "/src/docs", public_folder: "src/docs" }

  - name: partners
    label: "Нам доверяют"
    files:
      - name: partners
        label: "Нам доверяют"
        file: _data/partners.yml
        fields:
          - { name: eyebrow, widget: string }
          - name: logos
            label: "Логотипы (пусто = бегущая строка из плейсхолдеров)"
            widget: list
            required: false
            fields:
              - { name: name, label: "Название", widget: string }
              - { name: logo, label: "Логотип", widget: image }

  - name: contacts
    label: "Контакты"
    files:
      - name: contacts
        label: "Контакты"
        file: _data/contacts.yml
        fields:
          - { name: eyebrow, widget: string }
          - name: email
            widget: object
            fields:
              - { name: address, label: "Адрес", widget: string }
              - { name: subject, label: "Тема письма", widget: string }
              - { name: cc, label: "Копия (cc)", widget: string }
              - { name: label, label: "Отображаемый текст", widget: string }
          - name: instagram
            widget: object
            fields:
              - { name: label, widget: string }
              - { name: url, widget: string }
```

- [ ] **Step 4: Build and serve; open the CMS locally**

```bash
npm run build
npx @11ty/eleventy --serve &     # serves _site on http://localhost:8080
npm run cms                       # decap-server on :8081
```
Open `http://localhost:8080/admin/`. With `local_backend: true`, Decap shows "Working with Local Backend".

- [ ] **Step 5: Verify every collection round-trips**

For each of the nine collections: open it, change one field, click **Publish → Publish now**, then confirm the corresponding `_data/*.yml` on disk changed and is still valid YAML:
```bash
node -e "for (const f of require('node:fs').readdirSync('_data')) { require('yaml').parse(require('node:fs').readFileSync('_data/'+f,'utf8')); console.log('ok', f); }"
```
Then `git checkout _data/` to discard the test edits.

- [ ] **Step 6: Verify image upload targets**

In `feedback` → any item → upload a small test image to `letter_image`: it must land in `src/docs/`. In `partners` → add a logo: it must land in `src/img/uploads/`. Discard afterwards (`git checkout _data/ && git clean -f src/img/uploads src/docs`).

- [ ] **Step 7: Rebuild + parity (unchanged content) — expect PASS**

```bash
git checkout _data/
npm run build && npm run parity
```

- [ ] **Step 8: Commit**

```bash
git add admin/ package.json
git commit -m "feat: Decap CMS admin with vendored bundle and full collection config"
```

---

## Task 16: GitHub OAuth proxy on Cloudflare Workers (`oauth/`)

A standalone Worker implementing the Decap GitHub OAuth handshake. Deployed independently of the site.

**Files:**
- Create: `oauth/package.json`, `oauth/wrangler.toml`, `oauth/src/index.js`, `oauth/README.md`

**Interfaces:**
- Consumes: env secrets `GITHUB_OAUTH_ID`, `GITHUB_OAUTH_SECRET` (set via `wrangler secret put`).
- Produces: HTTPS endpoints `GET /auth` (redirects to GitHub authorize) and `GET /callback` (exchanges `code` for a token and `postMessage`s it back to the Decap window). `admin/config.yml` → `backend.base_url` points at this Worker's origin.

- [ ] **Step 1: Create `oauth/package.json`**

```json
{
  "name": "zimablue-cms-oauth",
  "private": true,
  "scripts": {
    "dev": "wrangler dev",
    "deploy": "wrangler deploy"
  },
  "devDependencies": {
    "wrangler": "^3.0.0"
  }
}
```

- [ ] **Step 2: Create `oauth/wrangler.toml`**

```toml
name = "zimablue-cms-oauth"
main = "src/index.js"
compatibility_date = "2024-11-01"
workers_dev = true
```

- [ ] **Step 3: Create `oauth/src/index.js`**

```js
// Minimal GitHub OAuth provider for Decap CMS.
// Implements the two endpoints Decap's `github` backend expects when
// `backend.base_url` points here: /auth and /callback.

const GITHUB_AUTHORIZE = "https://github.com/login/oauth/authorize";
const GITHUB_TOKEN = "https://github.com/login/oauth/access_token";

function renderCallback(status, payload) {
  const content = JSON.stringify({ ...payload });
  return `<!doctype html><html><body><script>
  (function () {
    function post(message) {
      window.opener && window.opener.postMessage(message, "*");
    }
    post("authorizing:github");
    window.addEventListener("message", function () {
      post("authorization:github:${status}:${content.replace(/</g, "\\u003c")}");
    }, { once: true });
  })();
  </script></body></html>`;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/" || url.pathname === "") {
      return new Response("zimablue cms oauth: ok", { status: 200 });
    }

    if (url.pathname === "/auth") {
      const redirectUri = `${url.origin}/callback`;
      const to = new URL(GITHUB_AUTHORIZE);
      to.searchParams.set("client_id", env.GITHUB_OAUTH_ID);
      to.searchParams.set("redirect_uri", redirectUri);
      to.searchParams.set("scope", "repo");
      to.searchParams.set("state", crypto.randomUUID());
      return Response.redirect(to.toString(), 302);
    }

    if (url.pathname === "/callback") {
      const code = url.searchParams.get("code");
      if (!code) return new Response("missing code", { status: 400 });

      const res = await fetch(GITHUB_TOKEN, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          client_id: env.GITHUB_OAUTH_ID,
          client_secret: env.GITHUB_OAUTH_SECRET,
          code,
        }),
      });
      const data = await res.json();

      if (data.error || !data.access_token) {
        return new Response(
          renderCallback("error", { message: data.error_description || "no token" }),
          { headers: { "Content-Type": "text/html" } }
        );
      }
      return new Response(
        renderCallback("success", { token: data.access_token, provider: "github" }),
        { headers: { "Content-Type": "text/html" } }
      );
    }

    return new Response("not found", { status: 404 });
  },
};
```

- [ ] **Step 4: Create `oauth/README.md`**

Document, in prose: create a GitHub OAuth App (Homepage `https://zimablue.org`, callback `https://<worker-name>.<subdomain>.workers.dev/callback`); then
```bash
cd oauth && npm install
npx wrangler login
npx wrangler secret put GITHUB_OAUTH_ID
npx wrangler secret put GITHUB_OAUTH_SECRET
npx wrangler deploy
```
Copy the deployed `*.workers.dev` URL into `admin/config.yml` → `backend.base_url`.

- [ ] **Step 5: Local sanity check**

```bash
cd oauth && npm install
printf 'GITHUB_OAUTH_ID="x"\nGITHUB_OAUTH_SECRET="y"\n' > .dev.vars
npx wrangler dev --port 8788 &
curl -sI "http://localhost:8788/auth" | grep -i "location: https://github.com/login/oauth/authorize"
```
Expected: a `location:` header to GitHub's authorize URL with `client_id=x`. Kill the dev server. Add `oauth/.dev.vars` to `.gitignore`.

- [ ] **Step 6: Wire `admin/config.yml`**

Replace `https://REPLACE-WITH-WORKER.workers.dev` in `admin/config.yml` with the real deployed Worker origin. Rebuild + parity (site HTML unaffected) — expect PASS.

- [ ] **Step 7: Commit**

```bash
echo "oauth/.dev.vars" >> .gitignore
echo "oauth/node_modules/" >> .gitignore
git add oauth/ admin/config.yml .gitignore
git commit -m "feat: Cloudflare Worker OAuth proxy for Decap GitHub backend"
```

- [ ] **Step 8: Manual end-to-end (record result in PR, needs the real OAuth App + deploy from spec §8)**

After the Worker is deployed and `base_url` is set: visit `https://zimablue.org/admin/`, click **Login with GitHub**, authorize, confirm Decap loads all nine collections and can save a trivial edit that appears as a commit on `main`.

---

## Task 17: editor guide + full runtime verification + PR

**Files:**
- Create: `admin/README.md`
- Modify: `docs/superpowers/specs/2026-08-28-decap-cms-eleventy-design.md` (only if verification surfaces a spec gap)

**Interfaces:**
- Consumes: everything.
- Produces: nothing runtime — documentation and a verified branch ready to merge.

- [ ] **Step 1: Write `admin/README.md`** — for content editors, in Russian:
  - how to open the CMS (`https://zimablue.org/admin/`, login with GitHub, needs write access to the repo);
  - each sidebar section maps to which part of the page (a short table);
  - text fields may contain simple HTML — `<i>…</i>` for italic emphasis, `<br />` for a line break, `&nbsp;` for a non-breaking space — copy the pattern from existing text;
  - a save = a commit to `main`; the site rebuilds and updates in ~1–2 minutes;
  - `slug` in "Рекомендательные письма" must stay unique and latin — changing it renames the popup anchor;
  - to work offline: `npm ci && npm run build && npx @11ty/eleventy --serve` + `npm run cms`, then `http://localhost:8080/admin/`.

- [ ] **Step 2: Full build + parity**

```bash
npm ci && npm run build && npm run parity
```
Expected: `PASS  _site/index.html`, `PASS  _site/404.html`.

- [ ] **Step 3: Runtime verification in the preview browser**

Serve `_site` (`npx @11ty/eleventy --serve`) and, using the browser-pane tools, on `http://localhost:8080/`:
  - `read_console_messages` → no errors; `read_network_requests` → all `src/**` assets 200, web fonts load.
  - Hero: the `.jGravity .tag` spans get randomised `left` and fall (jGravity + the inline script run).
  - Scroll through: `data-effect-1..4` blur/split-type reveals fire on `about`, section titles (GSAP + ScrollTrigger).
  - `#feedback`: click tab buttons (desktop bar) → matching `.tab-content` gets `active`; repeat in a mobile viewport (`resize_window` 375×812) for the `is-hidden-tablet` bar.
  - Services & research: click a `.flip-icon` → the card's `.flip-card-inner` toggles `rotateY(180deg)`.
  - `.open-modal-btn` on each feedback item → `#modal-id-<slug>` opens with the right `src/docs/...` image; `.delete` / `.modal-background` closes it.
  - Partners: the `.items.marquee` tracks scroll.
  - Take a full-page screenshot; compare side-by-side with the deployed production page.

- [ ] **Step 4: Fix any regression at its source**

Any difference traces to a template or data file (never the normalizer, never `src/`). Fix, re-run Steps 2–3.

- [ ] **Step 5: Commit + open PR**

```bash
git add admin/README.md
git commit -m "docs: editor guide for the CMS"
git push -u origin feat/decap-cms
gh pr create --title "Decap CMS + Eleventy content management" --body "$(cat <<'BODY'
Implements docs/superpowers/specs/2026-08-28-decap-cms-eleventy-design.md and
docs/superpowers/plans/2026-08-28-decap-cms-eleventy.md.

- Eleventy renders index.html / 404.html from _data/*.yml; src/ passthrough-copied unchanged.
- Parity harness (scripts/parity-check.mjs) green against pre-port fixtures.
- Decap CMS at /admin/ (vendored bundle), GitHub backend via Cloudflare Worker (oauth/).
- GitHub Actions build+deploy.

Manual steps still required before/after merge — see spec §8:
1. Settings → Pages → Source → GitHub Actions
2. Create GitHub OAuth App, callback to the Worker /callback
3. Deploy oauth/ Worker with secrets; set admin/config.yml base_url
4. End-to-end CMS login test on main

🤖 Generated with [Claude Code](https://claude.com/claude-code)
BODY
)"
```

- [ ] **Step 6: Post-merge checklist (human, from spec §8)** — leave as unchecked boxes in the PR description; they are not code steps:
  - [ ] Pages source switched to GitHub Actions
  - [ ] first `main` Actions run green, site visually unchanged
  - [ ] OAuth App created, Worker deployed with secrets, `base_url` set
  - [ ] logged into `/admin/`, made a test edit, saw the commit + redeploy

---

## Self-Review

**Spec coverage**

| Spec section | Task(s) |
|---|---|
| §3 repo structure, `.eleventy.js`, passthrough | 1 |
| §3.2 GitHub Actions deploy | 2 |
| §4 `site.yml` | 3, 4, 13 |
| §4 `about/services/benefits/stats/research/feedback/partners/contacts` | 5–12 |
| §4 media folders (`src/img/uploads`, per-field `src/docs`) | 15 (config), 15 Step 6 (verified) |
| §4 auto-generated tab/modal ids | 10 |
| §5.1 `admin/` vendored bundle + `config.yml` | 15 |
| §5.2 `oauth/` Worker | 16 |
| §5.3 GitHub OAuth App | 16 Step 4 (documented), spec §8 (manual) |
| §5.4 `local_backend` offline editing | 15 Step 4, 17 Step 1 |
| §6 raw inline HTML, `| safe`, no markdown | all porting tasks; constraint stated in header |
| §6 optional `typo` filter, default off | 14 |
| §7 parity harness | 1 |
| §7 runtime browser checks | 17 Step 3 |
| §7 admin round-trip check | 15 Steps 5–6 |
| §7 worker check | 16 Steps 5, 8 |
| §8 manual steps | 2 Step 5, 16 Steps 4/8, 17 Step 6 |
| §9 risks | mitigations embedded in Tasks 1, 10, 15, 16, 17 |
| §10 phasing | Task order matches |

No spec requirement is left without a task.

**Placeholder scan**

- `REPLACE-WITH-WORKER.workers.dev` (Task 15/16) and `<DECAP_VERSION>` / `$(npm view decap-cms version)` (Task 15) and `<worker-name>.<subdomain>` (Task 16) are values that only exist after the human creates the Cloudflare/GitHub resources in spec §8 — each has an explicit step that resolves it. Not latent placeholders.
- Task 9 lists cards 2–7 as `# card N` comments giving exact `title` + `cta_href`, with an instruction to fill `back_text` from the fixture; Task 10 does the same for testimonials 3–9. This is deliberate: the fixture is the source of truth and parity is the gate, so re-typing rare-Unicode Russian prose into this plan would add transcription risk, not remove it. Every non-derivable value (slugs, labels, image paths, hrefs) IS spelled out.
- No "TBD", "handle edge cases", "add error handling", or "similar to Task N" anywhere.

**Type / name consistency**

- Global data names: `site`, `about`, `services`, `benefits`, `stats`, `research`, `feedback`, `partners`, `contacts` — used identically in every partial and in `admin/config.yml` `file:` targets.
- `site.cta.{label,href}` — defined Task 3, reused Tasks 3 (nav), 13 (footer).
- `feedback.items[].slug` — defined Task 10, consumed by `feedback.njk` (`data-target`) and `feedback-modals.njk` (`id`), validated by the `admin/config.yml` `pattern`. Tab ids are `tab{{ loop.index }}` (1-based) in all three tab regions — consistent.
- `accent` (stats), `colorful` (hero tags) — booleans, same name in data + template + CMS config.
- Partial filenames: `nav, hero, about, services, benefits, stats, research, feedback, feedback-modals, partners, contacts, footer` — the `page.njk` include list in Task 13 Step 5 matches this set exactly.
- `parity-check.mjs` `normalize()` — one definition (Task 1), referenced by every porting task's test step; no divergent copies.

No inconsistencies found.
