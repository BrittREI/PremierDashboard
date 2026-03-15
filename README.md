This is a small static Vercel app that serves `index.html` (copied from `ceo_dashboard_by_year_quarter.html`).

Local development (recommended):

1. Install dependencies:

```bash
npm install
```

2. Run Vercel dev server:

```bash
npm run dev
# or, without installing vercel locally:
npx vercel dev
```

Deploy to Vercel (quick):

```bash
npm i -g vercel
vercel login
vercel --prod
```

Or deploy by connecting this repository/folder in the Vercel dashboard (Import Project → select this repo/folder).

Files added:

- index.html — the dashboard (root page)
- package.json — includes `dev` script for `vercel dev`
- vercel.json — minimal config (clean URLs)
- README.md — this file
