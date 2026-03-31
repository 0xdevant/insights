# Production deploy (Cloudflare Workers + OpenNext)

CrawlMe runs on **Cloudflare Workers** via [`@opennextjs/cloudflare`](https://opennext.js.org/cloudflare). This file lists what you must do once; CI deploys on every push to `main` when GitHub secrets are set.

## 1. One-time: Cloudflare resources

Run locally (after `npx wrangler login`) or use the dashboard.

### KV (required for quotas / subscription keys in production)

```bash
npx wrangler kv namespace create CRAWLME_KV
```

Copy the **id** into `wrangler.jsonc` → `kv_namespaces[0].id`, **or** add it as GitHub secret `CLOUDFLARE_KV_NAMESPACE_ID` (workflow replaces the placeholder `0000…`).

### R2 (OpenNext incremental cache)

```bash
npx wrangler r2 bucket create crawlme-opennext-cache
```

Name must match `wrangler.jsonc` → `r2_buckets[0].bucket_name`.

### API token (for GitHub Actions)

In Cloudflare Dashboard → **My Profile** → **API Tokens** → create a token with:

- **Workers Scripts: Edit**
- **Account Settings: Read** (if needed for account id)
- **Workers KV Storage: Edit**
- **Workers R2 Storage: Edit** (if using R2)

Or use a template that includes **Cloudflare Workers** deploy permissions.

## 2. GitHub repository secrets

In [github.com/0xdevant/crawlme](https://github.com/0xdevant/crawlme) → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**:

| Secret                           | Purpose                                                       |
| -------------------------------- | ------------------------------------------------------------- |
| `CLOUDFLARE_API_TOKEN`           | Wrangler deploy — create under [API Tokens](https://dash.cloudflare.com/profile/api-tokens) (Workers + KV + R2 as needed) |
| `CLOUDFLARE_ACCOUNT_ID`          | From `npx wrangler whoami` or Workers dashboard               |
| `CLOUDFLARE_KV_NAMESPACE_ID`     | Optional if KV id is already committed in `wrangler.jsonc`    |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | **Required** for Clerk: must match production instance (`pk_live_…`); baked into the build — without it, `/` can return **500** |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | **Public** Turnstile site key (`0x…`) — baked into the client at build time. **Required** if you use Turnstile: without it, the widget never renders. **Do not** put `TURNSTILE_SECRET_KEY` here (that stays on the Worker only). |

After secrets are set, every push to `main` runs `.github/workflows/deploy.yml`.

## 3. Worker secrets & vars (runtime)

`VENICE_API_KEY`, **`CLERK_SECRET_KEY`** (required for auth middleware — use `sk_live_…` for production), `STRIPE_*`, `TURNSTILE_SECRET_KEY`, `FREE_GLOBAL_DAILY_SCANS`, `CRAWLME_QUOTA_BYPASS_IPS`, etc. are read at **runtime** on the Worker.

**Clerk:** Set both **GitHub** `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` (build) and **Worker** `CLERK_SECRET_KEY` (runtime). Missing either often causes **Internal Server Error** on every page (middleware runs on all routes).

**Turnstile:** Use **two** different keys: **`NEXT_PUBLIC_TURNSTILE_SITE_KEY`** in **GitHub Actions** (same value as Turnstile “Site Key” in the dashboard — public) and **`TURNSTILE_SECRET_KEY`** only on the **Worker** (secret key). If the Worker has the secret but GitHub never received the **public** site key, users can see「請先完成人機驗證」with **no visible widget** — add the GitHub secret and redeploy.

Set them in **Workers & Pages** → **crawlme** → **Settings** → **Variables and Secrets**, or:

```bash
npx wrangler secret put VENICE_API_KEY
# repeat for each secret
```

Use the same names as `.env.example`. Do **not** commit real values.

## 4. Domain & URLs

1. **Workers** → **crawlme** → **Custom domains** → add `seo.clawify.dev` (or your hostname).
2. Set **`NEXT_PUBLIC_APP_URL`** (and production env) to that URL for checkout redirects.
3. **Stripe** Dashboard → webhook endpoint: `https://<your-domain>/api/webhooks/stripe`.

## 5. Deploy

- **Automatic:** push to `main` (workflow `.github/workflows/deploy.yml`).
- **Manual:** `npm run deploy` locally (requires `wrangler` auth and env).

## 6. Smoke checks

- `GET /` loads.
- Free scan (with Turnstile if enabled) returns JSON.
- KV binding works (quota not falling back to per-instance memory in multi-region).

If deploy fails on **KV id**, fix the id in `wrangler.jsonc` or set `CLOUDFLARE_KV_NAMESPACE_ID`.

### Venice works locally but not in production (empty content / odd errors)

- **Align secrets:** Worker **Variables and Secrets** should use the same **`VENICE_API_KEY`** and **`VENICE_MODEL`** as your working `.env` / `.env.local`. An **empty or placeholder `VENICE_MODEL`** in the dashboard used to send `model: ""` to the API (now guarded — still fix the value).
- **Larger pages in prod:** Real URLs can produce a bigger `PAGE_FACTS` JSON than your local test URL → harder completion; try fewer extra pages or a model with a larger context.
- **`finish_reason=length` / empty reply:** The model ran out of **output** budget. Large `PAGE_FACTS` (especially huge `responseHeaders` from CDNs) steal context. The app **slims headers + heading samples** in Venice prompts only; you can also raise **`VENICE_CONTEXT_WINDOW_TOKENS`** (e.g. `65536`) if your Venice model supports it. Search logs for **`[venice_empty]`** for token counts and `rawPreview`.

### Internal Server Error (500) on `GET /`

1. **Clerk:** Confirm `CLERK_SECRET_KEY` is set on the Worker and `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` is in GitHub Actions secrets (redeploy after adding). Keys must be from the **same** Clerk production instance.
2. **Cloudflare Workers** → **crawlme** → **Logs** → look for the thrown message (often Clerk or missing env).
