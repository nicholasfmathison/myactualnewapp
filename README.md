# My Actual New App

An interactive starter with a live headline editor, three color themes, a detail switch, and a momentum counter. Changes live in React state and reset when the page reloads. No backend or account is required.

## Stack

- React 19 with reusable `.tsx` components
- TypeScript 5.8 (strict mode)
- Tailwind CSS 3
- Vite and npm

Chart.js, Three.js, Zustand, and GrowthBook are intentionally not installed.

## Run locally

Use Node.js 26.13.0 (the version in `.nvmrc`) and npm. In Git Bash, from this repository:

```bash
npm ci
npm run dev
```

Open http://localhost:5173/myactualnewapp/. Vite updates the browser as you edit `src/`.

```bash
npm run typecheck  # Check types without building
npm run build      # Type-check and build into dist/
npm run preview    # Serve the production build on port 4173
```

## Structure

```text
src/App.tsx                   Page layout and resource cards
src/components/Playground.tsx Interactive preview and controls
src/components/Icon.tsx       Shared SVG icons
src/index.css                 Tailwind layers and global styles
.github/workflows/deploy.yml  Build and deployment from main
```

## GitHub Pages

Published address: https://nicholasfmathison.github.io/myactualnewapp/

The Pages source must be set to **GitHub Actions** in repository Settings → Pages. The repository must be public or use a GitHub plan that supports Pages for private repositories.

Every push to `main` runs `npm ci`, checks TypeScript, builds the app, and deploys `dist/`. Both workflow jobs also require `refs/heads/main`, so a manual dispatch on another branch cannot deploy. The `github-pages` environment is restricted to the `main` branch when Pages is enabled.

Vite uses `/myactualnewapp/` as its base path so production assets load correctly at the project URL. If you rename the repository, update `vite.config.ts`.

## Development workflow

Work on `dev`, commit and push changes there, then merge into `main` when ready to publish:

```bash
git switch dev
git add .
git commit -m "Describe the change"
git push -u origin dev
```

Open a pull request from `dev` into `main` to publish after review. A push to `dev` does not deploy.

The lockfile is committed for reproducible installs. Dependencies, build output, logs, local environment files, and editor caches are ignored. Never put secrets into frontend code or `VITE_` environment variables: those values are visible in the built website.
