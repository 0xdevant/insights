# Insights

Next.js app deployed to **Cloudflare Workers** with [`@opennextjs/cloudflare`](https://opennext.js.org/cloudflare).

## Local development

```bash
cp .env.example .env.local
# fill VENICE_API_KEY at minimum

npm install
npm run dev
```

## Production (Cloudflare)

See **[DEPLOY.md](./DEPLOY.md)** for KV, R2, GitHub Actions secrets, Worker secrets, and custom domains.

Push to `main` runs `.github/workflows/deploy.yml` when `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` are configured.

## Scripts

| Command | Purpose |
|---------|---------|
| `npm run merge-env` | Preview env keys from `.env.example` missing in `.env` |
| `npm run merge-env:apply` | Append those lines to `.env` (writes `.env.bak` first) |
| `npm run dev` | Next.js dev server |
| `npm run build` | Next.js production build |
| `npm run deploy` | OpenNext build + `wrangler deploy` |
| `npm run preview` | Local preview in Workers runtime |
