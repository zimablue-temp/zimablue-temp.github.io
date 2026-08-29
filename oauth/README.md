# zimablue-cms-oauth

A standalone Cloudflare Worker that performs the GitHub OAuth handshake for
Decap CMS. When `admin/config.yml` sets `backend.base_url` to this Worker's
origin, Decap's `github` backend calls two endpoints here:

- `GET /auth` — redirects the browser to GitHub's authorize page.
- `GET /callback` — exchanges the returned `code` for an access token and
  `postMessage`s `authorization:github:success:<json>` (or `:error:`) back to
  the Decap window that opened it.

`GET /` returns a plain `ok` string for health checks. Anything else is `404`.

This sub-project is **not** part of the Eleventy build — `oauth` is listed in
`.eleventyignore`, so it is never processed or copied into `_site/`. It is
deployed independently with `wrangler`.

## One-time setup

### 1. Create a GitHub OAuth App

Go to GitHub → Settings → Developer settings → OAuth Apps → **New OAuth App**:

- **Application name:** anything recognizable, e.g. `zimablue CMS`.
- **Homepage URL:** `https://zimablue.org`
- **Authorization callback URL:**
  `https://<worker-name>.<subdomain>.workers.dev/callback`
  (you get the exact `*.workers.dev` host after the first `wrangler deploy`;
  you can create the app with a placeholder and edit this field afterward).

Note the generated **Client ID** and generate a **Client secret**.

### 2. Install, authenticate, set secrets, deploy

```bash
cd oauth && npm install
npx wrangler login
npx wrangler secret put GITHUB_OAUTH_ID      # paste the OAuth App Client ID
npx wrangler secret put GITHUB_OAUTH_SECRET  # paste the OAuth App Client secret
npx wrangler deploy
```

`wrangler deploy` prints the live `https://<worker-name>.<subdomain>.workers.dev`
URL. If you had to guess the callback URL in step 1, update the OAuth App's
**Authorization callback URL** to `<that URL>/callback` now.

### 3. Point Decap at the Worker

Copy the deployed `*.workers.dev` URL into `admin/config.yml`:

```yaml
backend:
  name: github
  repo: <owner>/<repo>
  branch: main
  base_url: https://<worker-name>.<subdomain>.workers.dev
```

Rebuild the site and redeploy. Visiting `https://zimablue.org/admin/` and
clicking **Login with GitHub** should now complete the OAuth flow.

## Local development

```bash
cd oauth && npm install
printf 'GITHUB_OAUTH_ID="x"\nGITHUB_OAUTH_SECRET="y"\n' > .dev.vars
npx wrangler dev --port 8788
curl -sI "http://localhost:8788/auth"
```

`curl -sI .../auth` should return `HTTP/1.1 302` with a `location:` header
pointing at `https://github.com/login/oauth/authorize?...client_id=x...`.

`.dev.vars` holds local-only fake credentials and is git-ignored — never commit
it, and never put real secrets in it. Real credentials live only in
`wrangler secret put`.
