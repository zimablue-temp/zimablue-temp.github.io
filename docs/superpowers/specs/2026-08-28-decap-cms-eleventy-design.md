# Decap CMS + Eleventy для zimablue.org — дизайн

- **Дата:** 2026-08-28
- **Статус:** одобрен к написанию плана
- **Репозиторий:** `zimablue-temp/zimablue-temp.github.io` (GitHub Pages, домен `zimablue.org`)

## 1. Цель и контекст

Сайт ZimaBlue — одностраничник (`index.html` + идентичный `404.html` с включённым
SPA-редиректом), деплоится с корня `main` через GitHub Pages, сборки нет. Весь
контент — захардкоженный HTML на русском.

Нужно: дать возможность редактировать **весь текстовый контент страницы**
(включая meta-теги, пункты меню, тексты кнопок, hero, footer) через готовую
небольшую CMS, не редактируя HTML руками, оставаясь на той же бесплатной инфре.

**Решение:** контент выносится в YAML-файлы; Eleventy генерирует `index.html` /
`404.html` из шаблона + данных; Decap CMS правит YAML и коммитит в репозиторий;
GitHub Actions пересобирает и публикует; вход в CMS — через GitHub OAuth, прокси
на Cloudflare Worker.

**Не входит в объём:** редизайн, изменение вёрстки/эффектов, многоязычность,
новые секции, изменение JS-логики (`src/js/*` не трогаем).

## 2. Архитектурные решения (зафиксированы с заказчиком)

| Вопрос | Решение |
|---|---|
| Что редактируется | Весь текстовый контент, включая meta, nav, hero, footer |
| Где живёт CMS и данные | Git-based: Decap CMS, контент — YAML в репозитории |
| Аутентификация | GitHub OAuth через прокси на Cloudflare Worker |
| Рендеринг | Билд-шаг: Eleventy (SSG), не client-side |
| CI/CD | GitHub Actions → `actions/deploy-pages` |
| Структура контента | Секционные файлы: `site.yml` + файл на секцию |

## 3. Структура репозитория после переделки

```
/
├─ _data/                 YAML-контент (Eleventy global data)
│  ├─ site.yml
│  ├─ about.yml
│  ├─ services.yml
│  ├─ benefits.yml
│  ├─ stats.yml
│  ├─ research.yml
│  ├─ feedback.yml
│  ├─ partners.yml
│  └─ contacts.yml
├─ _includes/
│  ├─ layout.njk          каркас <html><head><body> + подключение скриптов
│  └─ partials/
│     ├─ nav.njk
│     ├─ hero.njk
│     ├─ about.njk
│     ├─ services.njk
│     ├─ benefits.njk
│     ├─ stats.njk
│     ├─ research.njk
│     ├─ feedback.njk     секция вкладок + мобильные вкладки + тела + модалки
│     ├─ partners.njk
│     ├─ contacts.njk
│     └─ footer.njk
├─ index.njk              тонкая обёртка: layout + перечисление партиалов
├─ 404.njk                тот же layout, spaRedirect = true
├─ src/                    БЕЗ ИЗМЕНЕНИЙ — css/js/img/docs, passthrough-копия
├─ admin/
│  ├─ index.html          страница Decap
│  ├─ config.yml          конфиг Decap (backend, collections)
│  └─ decap-cms.js        вендоренная копия релиза Decap 3.x
├─ oauth/                  Cloudflare Worker — деплоится отдельно, не часть Pages
│  ├─ wrangler.toml
│  ├─ package.json
│  └─ src/index.js
├─ .github/workflows/deploy.yml
├─ .eleventy.js
├─ package.json
├─ package-lock.json
├─ .eleventyignore        node_modules, _site, oauth
├─ .gitignore             _site/, node_modules/
├─ .nojekyll
├─ CNAME                  без изменений (zimablue.org)
└─ docs/superpowers/specs/2026-08-28-decap-cms-eleventy-design.md
```

### 3.1 Конфигурация Eleventy (`.eleventy.js`)

- `dir.input = "."`, `dir.output = "_site"`, `dir.includes = "_includes"`, `dir.data = "_data"`
- `.eleventyignore`: `node_modules`, `_site`, `oauth`
- Passthrough-копии (object-form от корня проекта):
  `addPassthroughCopy("src")`, `addPassthroughCopy("admin")`,
  `addPassthroughCopy("CNAME")`, `addPassthroughCopy(".nojekyll")`
- Следствие: все существующие в разметке пути вида `src/css/bulma.css`,
  `src/js/index.js`, `src/img/…`, `src/docs/…` **остаются валидными без единого
  изменения** — `src/` целиком копируется в `_site/src/`.
- Шаблонизатор: Nunjucks (`.njk`).

### 3.2 Деплой (`.github/workflows/deploy.yml`)

- Триггер: `push` в `main` (+ `workflow_dispatch`).
- Джоба build: `actions/checkout` → `actions/setup-node` (Node LTS, кэш npm) →
  `npm ci` → `npx @11ty/eleventy` → `actions/upload-pages-artifact` с `path: _site`.
- Джоба deploy: `actions/deploy-pages` (permissions `pages: write`, `id-token: write`).
- **Ручной шаг:** Settings → Pages → Source → «GitHub Actions» (см. раздел 8).

## 4. Контент-модель

Каждый файл `_data/*.yml` → одна **file-коллекция** Decap (одна форма в
сайдбаре админки). Повторяющиеся блоки — `list`-виджеты с типовыми полями.
`id` вкладок/модалок (`tab1`, `modal-id-*`) генерируются шаблоном по индексу
списка — редактор их не видит и не задаёт.

### `site.yml` — «Настройки сайта»
```yaml
meta:
  title: "ZimaBlue. Исследовательское агентство"
  description: ""          # новое поле, meta-description сейчас отсутствует
  lang: "ru"
  theme: "light"
logo: "src/img/zimablue.svg"
favicon: "src/img/favicon.png"
nav:
  - { label: "О нас", href: "#about" }
  - { label: "Услуги", href: "#services" }
  - { label: "Исследования", href: "#research" }
  - { label: "Отзывы", href: "#feedback" }
cta: { label: "Заказать исследование", href: "https://t.me/+77066396195" }
hero:
  line1: "Не предполагаем,"
  line2_em: "а исследуем"      # выводится в <i>
  tags:                        # «гравитационные» теги
    - { text: "UX/UI", colorful: true }
    - { text: "тренды", colorful: false }
    # …
footer:
  links:
    - { label: "О нас", href: "#about" }
    # …
  credit_html: 'Собрано <a href="http://tinystudio.cc" class="ts" target="_blank">Tiny Studio</a>, 2024'
```

### `about.yml` — «О нас»
`eyebrow` (string, «О нас»), `body` (text, raw inline HTML — `<i>` для акцента).

### `services.yml` — «Услуги»
`eyebrow` (string), `cards` (list):
`{ title, front_text, back_text, cta_label, cta_href }` —
`title`/`front_text`/`back_text` — text (raw inline HTML), `cta_*` — string.

### `benefits.yml` — «Преимущества»
`eyebrow` (string), `body` (text, raw inline HTML). В разметку выводится дважды —
desktop (`is-size-3 is-hidden-mobile`) и mobile (`is-size-4 is-hidden-tablet`) —
из одного значения, шаблоном.

### `stats.yml` — «Цифры»
`items` (list): `{ value, label, accent }`.
`value` — string с разрешённым `<i>`/`<small>` (значения вроде
`<small>от</small>&nbsp;3&nbsp;000 <small>до</small>&nbsp;10&nbsp;000 <small>человек</small>`
не раскладываются на числовые поля), `label` — string, `accent` — bool
(добавляет класс `accent` на `.title`).

### `research.yml` — «Исследования»
`eyebrow` (string), `cards` (list): `{ title, back_text, cta_label, cta_href }`.
Шаблон бьёт список на ряды по 3 колонки Bulma; неполный последний ряд
добивается пустыми `<div class="column">`.

### `feedback.yml` — «Рекомендательные письма»
`items` (list): `{ tab_label, quote, author, letter_image }`.
- `tab_label` — string (подпись вкладки, напр. «Tele2»)
- `quote` — text, raw inline HTML (текст письма-цитаты, `.title`)
- `author` — text многострочный, `\n` → `<br>` при рендере
- `letter_image` — image, `media_folder` переопределён на `src/docs`
- Шаблон генерирует: desktop-вкладки, mobile-вкладки, `.tab-content#tabN`,
  `#modal-id-N` с картинкой. Всё по одному списку.

### `partners.yml` — «Нам доверяют»
`eyebrow` (string), `logos` (list): `{ name, logo }`.
Пустой список → рендерятся пустые `.item` как сейчас (секция-заглушка сохраняется).

### `contacts.yml` — «Контакты»
```yaml
eyebrow: "Контакты"
email:
  address: "info@zimablue.net"
  subject: "Здравствуйте, хочу заказать исследование"
  cc: "farangizashukasheva@gmail.com"
instagram: { label: "@zimablue.co", url: "https://www.instagram.com/zimablue.co/" }
```
Шаблон собирает `mailto:` из `address`/`subject`/`cc`.

### Медиа
- Глобально в `admin/config.yml`: `media_folder: "src/img/uploads"`,
  `public_folder: "src/img/uploads"`.
- Поле `feedback.items.*.letter_image`: переопределение
  `media_folder: "src/docs"`, `public_folder: "src/docs"` (там уже лежат
  текущие письма).

## 5. Аутентификация и админка

### 5.1 `admin/`
- `admin/index.html` — минимальная страница, грузит локальный `admin/decap-cms.js`
  (вендоренная копия релиза Decap 3.x, ~2 МБ, в git). CDN не используется.
- `admin/config.yml`:
  ```yaml
  backend:
    name: github
    repo: zimablue-temp/zimablue-temp.github.io
    branch: main
    base_url: https://<worker-subdomain>.workers.dev   # OAuth-прокси
  local_backend: true
  media_folder: src/img/uploads
  public_folder: src/img/uploads
  publish_mode: simple            # коммит сразу в main, без PR
  collections:
    # file-коллекции по разделу 4
  ```
- Доступ к CMS = write-доступ к репозиторию. Отдельных учёток нет.

### 5.2 `oauth/` — Cloudflare Worker
- Назначение: бэкенд `github` в Decap не имеет своего сервера; нужен посредник
  для OAuth-handshake (client secret нельзя держать в браузере). Worker
  реализует эндпоинты `/auth` и `/callback` и возвращает токен в окно Decap
  стандартным `postMessage`-протоколом (`authorizing:github` / `authorization:github:success:<json>`).
- Файлы: `oauth/wrangler.toml`, `oauth/src/index.js` (~80 строк), `oauth/package.json`.
- Секреты: `GITHUB_OAUTH_ID`, `GITHUB_OAUTH_SECRET` — через `wrangler secret put`,
  в git не попадают.
- Деплой: `npx wrangler deploy` из `oauth/`. Хостинг на `*.workers.dev`,
  кастомный домен не нужен. Обновляется независимо от сайта.

### 5.3 GitHub OAuth App (ручной шаг)
GitHub → Settings → Developer settings → OAuth Apps → New:
- Homepage URL: `https://zimablue.org`
- Authorization callback URL: `https://<worker-subdomain>.workers.dev/callback`
- Client ID / Secret → в секреты Worker'а (5.2).

### 5.4 Локальная работа без OAuth
`npx decap-server` (слушает `localhost:8081`) + `npx @11ty/eleventy --serve`.
`local_backend: true` в конфиге направляет Decap на локальный сервер, правки
пишутся прямо в `_data/*.yml` на диске. Интернет и Worker не нужны.

## 6. Инлайн-разметка и типографика

В контенте повсюду `<i>…</i>` (акцент), `<br>`, `&nbsp;`, `&mdash;`, `&laquo;`/`&raquo;`.

**Решение (уточнено при написании плана): raw inline HTML во всех текстовых
полях, вывод через `| safe`, без markdown-виджетов и без фильтра `md`.**
Обоснование: значение поля = точная копия текущего inner HTML секции, поэтому
пофазная сверка «до/после» остаётся побайтной на всём протяжении портирования;
не появляется второго представления контента и связанного с конверсией класса
багов. Текущий контент уже содержит `<i>`/`<br>`/`&nbsp;`, поэтому редактору
при правках достаточно копировать существующий паттерн.

| Поле | Виджет Decap | Рендер |
|---|---|---|
| Абзацы прозы: `about.body`, `benefits.body`, `services.cards.*.{title,front_text,back_text}`, `research.cards.*.{title,back_text}`, `feedback.items.*.quote` | `text` (многострочный) | `| safe` |
| `feedback.items.*.author` | `text` (многострочный) | `| safe` (значение хранит `<br>` как есть) |
| Мелкие: `*.eyebrow`, `nav.*.label`, `cta.label`, `hero.line1`, `hero.line2_em`, `stats.items.*.value`, `*.cta_label`, `*.cta_href`, `*.href` | `string` | `| safe` |
| `footer.credit_html` | `string` | `| safe` целиком |

**Типографика (опционально, по умолчанию выключена):** Eleventy-фильтр `typo`,
приклеивающий `&nbsp;` после однобуквенных/коротких предлогов и союзов (`в`, `и`,
`на`, `с`, `к`, `о`, `от`, `по`, `не`, `а`, `но`…) и заменяющий `--` → `—`.
Включается флагом в `.eleventy.js`; по умолчанию выключен, чтобы не ломать
побайтную сверку. Применяется точечно и только если заказчик захочет
автоматизацию — тогда `&nbsp;` в данных чистятся, а расстановка уходит в фильтр.

## 7. План верификации

1. **Парити «до/после».** Скрипт нормализует незначащие пробелы и сравнивает
   `_site/index.html` с исходным `index.html` из git (тег/коммит до переделки).
   Цель — ноль смысловых расхождений. Аналогично `_site/404.html` против
   исходного `404.html` (шаблон с `spaRedirect = true`).
2. **Браузер** (`eleventy --serve` + preview-инструменты): веб-шрифты грузятся;
   hero-теги разлетаются (jGravity); blur-эффекты GSAP/ScrollTrigger на скролле
   работают; переключение вкладок писем; флип-карты (`services`, `research`);
   модалки открывают корректную картинку письма; маркиза `partners`; `console` и
   network без ошибок.
3. **Админка локально:** `decap-server` + открыть `/admin/`; пройти по каждой
   коллекции — форма рендерится; тестовая правка пишется в нужный `_data/*.yml`;
   загрузка картинки кладётся в `src/img/uploads` (letter — в `src/docs`).
4. **Worker:** `wrangler dev` → `/auth` редиректит на GitHub; после авторизации
   Decap получает токен и грузит коллекции (e2e против тестового репо/ветки).
5. **CI:** первый прогон Actions зелёный; задеплоенный сайт визуально совпадает
   с текущим продакшеном.

## 8. Ручные шаги (человек, не автоматизируется)

1. Settings → Pages → Source → «GitHub Actions».
2. Создать GitHub OAuth App, callback `https://<worker>.workers.dev/callback`,
   забрать Client ID / Secret.
3. Cloudflare: бесплатный аккаунт → `wrangler login` →
   `wrangler secret put GITHUB_OAUTH_ID` + `GITHUB_OAUTH_SECRET` →
   `wrangler deploy` из `oauth/`.
4. Вписать финальный адрес Worker'а в `admin/config.yml` → `backend.base_url`.
5. Убедиться, что все редакторы имеют write-доступ к репозиторию.

## 9. Риски и меры

| Риск | Мера |
|---|---|
| Сгенерённый HTML разошёлся с исходным (эффекты/раскладка поехали) | Скрипт-парити (7.1) + ручной визуальный проход до мержа |
| Редактор впишет в text-поле разметку, ломающую split-type/GSAP | Поля прозы выводят текст внутри существующих элементов; интерактив (`data-effect-*`, флип-кнопки) — в шаблоне, не в данных. Ревью diff YAML перед мержем |
| Worker/OAuth не поднялся | `local_backend` даёт полноценное локальное редактирование; сайт от Worker'а не зависит |
| `typo`-фильтр расставил `&nbsp;` криво | По умолчанию выключен; включается флагом; ручной `&nbsp;` в данных остаётся возможен |
| CDN Decap упал / supply-chain | Вендоренная копия `admin/decap-cms.js` в репо, CDN не используется |
| Переключение Pages на Actions ломает текущий деплой на время настройки | Делать после того, как workflow готов и проверен на форке/ветке |

## 10. Порядок реализации (фазы, каждая проверяема)

1. **Каркас Eleventy:** `.eleventy.js`, `_includes/layout.njk`,
   `index.njk` / `404.njk` со статикой захардкоженной в шаблон → парити-диф
   зелёный, сайт идентичен.
2. **Вынос контента:** секция за секцией — HTML → `_includes/partials/*.njk` +
   `_data/*.yml`, после каждой секции прогон парити.
3. **Фильтр** `typo` (опциональный, по умолчанию выключен), подключение в `.eleventy.js`.
4. **GitHub Actions** (`deploy.yml`), переключение Pages, первый деплой.
5. **`admin/`**: `index.html`, `config.yml`, вендоренный `decap-cms.js`;
   проверка всех коллекций через `local_backend`.
6. **`oauth/` Worker**: код, `wrangler.toml`, OAuth App, секреты, деплой,
   e2e-вход в CMS через GitHub.
7. Финальный визуальный проход + `README`/`admin/README` с инструкцией для
   редакторов (как войти, как править, где что лежит).
