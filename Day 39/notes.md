# Day 39 - Production build and deployment

## Topics Covered

- `vite build`, and what is actually in `dist/`
- `vite preview`, and what it does and does not prove
- The SPA refresh problem, and three different fixes for it
- `base`, and the blank page it causes when it is wrong
- `BrowserRouter basename`
- The GitHub Pages 404 trick
- Content hashing, and the one file that must not be cached
- Chunk splitting, and a map of names that did not do what I thought
- Source maps in production
- A deploy workflow that checks before it ships

## Practical Work

Day 38's app, made deployable.

```text
vite.config.ts                 base, sourcemap, manualChunks
public/404.html                the GitHub Pages redirect hack
public/_redirects              Netlify, one line
netlify.toml                   the same, plus cache headers
vercel.json                    the Vercel rewrite
.github/workflows/deploy.yml   typecheck, test, build, deploy
index.html                     the other half of the 404 trick
src/App.tsx                    basename
```

## What A Build Produces

```text
dist/index.html                  1.91 kB │ gzip:  0.94 kB
dist/assets/index-Uy-v5xRK.css   7.50 kB │ gzip:  1.97 kB
dist/assets/index-DqWxoAGo.js   25.28 kB │ gzip:  8.25 kB
dist/assets/vendor-Jqp1Qt4r.js 261.41 kB │ gzip: 83.14 kB
```

Four files plus two source maps. 92kB gzipped altogether, of which 83kB is
React and the router — my entire app is 8kB over the wire, which was not the
proportion I expected.

The hashes in the filenames are **content** hashes. A file's name only changes
when its contents do, which is what makes the caching rules below possible.

## The SPA Refresh Problem

The thing Day 36 flagged and today had to solve.

`BrowserRouter` uses real paths, so `/list` is a URL the **server** is asked
for — and there is no file called `list`. Clicking around inside the app works
perfectly, because the router handles those navigations in JavaScript. Refresh
on `/list`, or open a shared link to it, and the host answers 404.

That asymmetry is what makes it confusing: it works until somebody reloads.

Three fixes, and they are genuinely different:

**A rewrite rule** (Netlify, Vercel, Cloudflare, nginx). Serve `index.html` at
any unmatched path, with status **200**, not 301:

```text
/*    /index.html   200
```

200 rather than a redirect, because a redirect to `/` loses the path — the
router has to still see `/list`.

**The 404 trick** (GitHub Pages, which has no rewrites at all). Pages serves
`404.html` for any path that is not a file, so that page becomes the hook:

```js
// public/404.html
window.location.replace(base + "?redirect=/" + path + ...);
```

```js
// index.html, inline and synchronous
const redirect = params.get("redirect");
if (redirect) window.history.replaceState(null, "", redirect + ...);
```

The 404 page rewrites `/repo/list` to `/repo/?redirect=/list`, and `index.html`
puts the path back **before the bundle loads**. The restore script is inline
and synchronous on purpose: it has to run before React Router reads the URL,
and an external script would be a second request that may or may not win that
race.

It is a hack. It is also the only thing that works on Pages, and the
alternative is `HashRouter` and `/#/list` in every shared URL.

**`HashRouter`.** No server configuration at all, because the fragment never
reaches the server. Uglier URLs, and the fallback when rewrites are not
available.

`vite preview` has the fallback built in, which is how I checked it:

```text
GET /             200
GET /list         200
GET /book/OL123W  200
/list serves:     <div id="root"> and src="/assets/index-DqWxoAGo.js"
```

Worth being clear about what that proves and does not: it proves the *build* is
right and the *router* handles those paths. It proves nothing about the host —
`vite preview` is not the production server, and the 404 on Netlify or Pages
would still happen without the config files.

## base, and the blank page

```ts
const base = process.env["VITE_BASE"] ?? "/";
```

GitHub Pages serves a project site from a subdirectory:
`https://<user>.github.io/<repo>/`. So every asset URL has to start with
`/<repo>/`, and Vite writes those paths into `index.html` **at build time** —
so it has to be known when the build runs, not at runtime.

Getting it wrong is the classic first-deploy failure: `index.html` loads, asks
for `/assets/index-abc.js`, Pages looks at the domain root, and the page is
**blank with a 404 in the console** and no error anywhere visible.

Verified both ways:

```text
VITE_BASE unset          src="/assets/index-DqWxoAGo.js"
VITE_BASE=/jio-reading-list/  src="/jio-reading-list/assets/index-DYIFurAb.js"
```

An environment variable rather than a hard-coded string, so the same source
deploys to a subdirectory, to a domain root and to the dev server without
editing a file.

### And the router needs it too

```tsx
<BrowserRouter basename={import.meta.env.BASE_URL}>
```

Without this, a subdirectory deployment breaks in a way that looks like a
*routing* bug rather than a path bug: the assets load, the app renders, and
every route falls through to the wildcard — because the router sees
`/repo/list` and its routes are `/list`.

`import.meta.env.BASE_URL` is whatever `base` was at build time, so one line
covers all three cases.

### A Git Bash detour

Setting the variable from Git Bash produced this:

```text
src="/Program Files/Git/jio-reading-list/assets/index-vlF7Zqk3.js"
```

MSYS path conversion turned `/jio-reading-list/` into a Windows path on the way
into the process. Nothing to do with Vite. Ran it from PowerShell instead and
it was correct. Worth recording because the symptom looks exactly like a
misconfigured `base`, and I spent a minute reading my own config before
noticing the drive letter.

## Caching

```toml
[[headers]]
  for = "/assets/*"
  Cache-Control = "public, max-age=31536000, immutable"

[[headers]]
  for = "/index.html"
  Cache-Control = "no-cache"
```

The assets are content-hashed, so a filename changes exactly when its contents
do — which makes them safe to cache for a year.

`index.html` is **not** hashed and must never be cached. It is the file that
names the current assets, so a cached copy keeps pointing at files that no
longer exist, and a returning visitor gets a blank page after every deploy.

One file cached forever, one file never cached, and the hash is what makes the
two consistent.

## The Chunk Split I Got Wrong

```ts
// what I wrote first
manualChunks: { vendor: ["react", "react-dom", "react-router"] }
```

It built fine and produced:

```text
vendor-aPGZhvcu.js   51.12 kB
index-BLUK7grZ.js   235.08 kB
```

A 51kB "vendor" chunk next to a 235kB app chunk — so most of React was still
in the app chunk. **Naming an entry point only pulls in what is reachable from
that entry**, and `react-dom/client` is a different entry from `react-dom`, so
the shared internals ended up with my code.

The function form is blunt and correct:

```ts
manualChunks(id) {
    if (id.includes("node_modules")) return "vendor";
    return undefined;
}
```

```text
index-DqWxoAGo.js    25.28 kB
vendor-Jqp1Qt4r.js  261.41 kB
```

Anything from `node_modules` is a dependency, and dependencies change on a
different schedule from my code — so a deploy of a one-line fix invalidates
25kB rather than 286kB.

The lesson: a config that "works" is not a config that does what I meant. The
only reason I know is that I read the output sizes, and the first version's
numbers looked wrong in a way that is easy to skim past.

## Source Maps

```ts
sourcemap: true
```

They cost build time and a few hundred KB of files nobody downloads unless they
open DevTools — and without them a production stack trace is a list of
single-letter names from a minified bundle.

`"hidden"` emits the maps without the `//# sourceMappingURL` comment, so only
an error reporter that uploads them can use them. This is a public learning
project, so plain `true`.

## The Workflow

The order of the steps is the whole point:

```yaml
- run: npm ci
- run: npm run typecheck
- run: npm test
- run: npm run build
```

`npm run build` alone would not catch a failing test or a type error — Vite
does not type-check and does not run tests. A deploy that ships a red test
suite is worse than no deploy.

`npm ci`, not `npm install`. It installs exactly what the lockfile says and
fails if `package.json` and the lockfile disagree, which is what a build
should do rather than quietly resolving a newer version.

```yaml
env:
  VITE_BASE: "/${{ github.event.repository.name }}/"
```

From the context rather than hard-coded, so a renamed or forked repo still
builds.

Two smaller things that cost me time to look up:

- **`permissions: id-token: write`** is required, and without it the deploy
  step fails with an authentication error that does not mention permissions.
- **`concurrency: cancel-in-progress: false`**, because cancelling a
  half-finished Pages deploy can leave the site broken. Better to queue.

### @types/node, for one line

`process.env` in `vite.config.ts` needs `@types/node`, which is now a
devDependency purely for that. Worth noting it is a **build-time** type:
nothing in `src/` may touch `process`, because none of `src/` runs in Node.

## What I Learned

A build is four files and 92kB gzipped, and 83kB of that is React. My code is
8kB over the wire.

`BrowserRouter` plus a static host means a 404 on every refresh unless the host
is told to serve `index.html` for unmatched paths — at status 200, not 301,
or the path is lost.

GitHub Pages has no rewrites, so `404.html` plus a synchronous restore script
in `index.html` is the only way to keep real paths. It is a hack and it is the
accepted one.

`base` is baked in at build time, and getting it wrong gives a blank page with
a console 404 rather than any visible error.

`basename` on the router is the second half of that, and omitting it looks like
a routing bug rather than a path bug.

Content-hashed assets can be cached for a year; `index.html` must not be
cached at all, or a returning visitor loads a page pointing at files that are
gone.

`manualChunks` with a map of names only captures what is reachable from those
exact entries. Splitting on `node_modules` is cruder and actually works — and
I only noticed because the output sizes looked wrong.

Type-check and test *before* build in CI, because `vite build` checks neither.

`vite preview` proves the build and the router are right. It proves nothing
about the host.

MSYS path conversion rewrites path-shaped environment variables on Windows, and
the symptom is indistinguishable from a bad `base`.

## Verification

```text
npm run typecheck   ->  0 errors
npm test            ->  4 files, 83 tests, all passing
npm run build       ->  60 modules, 4 files + 2 maps
```

Both base paths:

```text
default            src="/assets/index-DqWxoAGo.js"
VITE_BASE=/jio-reading-list/   src="/jio-reading-list/assets/index-DYIFurAb.js"
```

`dist/` contains `404.html` and `_redirects`, copied from `public/` as they
should be — a file in `public/` is emitted verbatim and is exactly where a
host-specific config belongs.

The preview server, with the SPA fallback:

```text
GET /             200
GET /list         200
GET /book/OL123W  200
```

Two mistakes of my own, both found by reading output rather than by an error:
the `manualChunks` map that left React in the app chunk, and a `process` usage
that built fine and failed `tsc`.

## Day 39 Outcome

A deployable build: a configurable `base` wired to the router's `basename`, a
vendor split that actually splits, production source maps, and deployment
config for three different hosts — a Netlify rewrite with cache headers, a
Vercel rewrite, and the `404.html` redirect pair that GitHub Pages needs.
A workflow that type-checks and tests before it builds, and builds with the
repository name as the base path.

Verified at both base paths, with the preview server answering 200 on every
deep link.

Day 40 closes Week 8: the capstone review, a release tag, and the architecture
write-up in the README.
