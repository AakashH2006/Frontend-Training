# Week 8 — React Routing, Testing and Mini-Capstone

A routed, tested, accessible React application with a production build and
deployment config. The Month 2 capstone.

## What this is

Five routes over the reading list from Week 7, with 84 tests, a keyboard and
screen-reader pass, and three hosts' worth of deployment configuration.

The finished app for the week is:

`Day 40/Reading List Capstone/`

```text
2,751 lines of app source across 33 files
1,286 lines of tests
84 tests in 4 files
92 kB gzipped, of which 83 kB is React and the router
```

## How to run it

```bash
cd "Day 40/Reading List Capstone"
npm install
npm run dev
```

```bash
npm run dev         # dev server
npm test            # 84 tests
npm run test:watch  # the one I actually use
npm run typecheck   # tsc --noEmit
npm run build       # tsc && vite build
npm run preview     # serve dist/, with the SPA fallback
```

**All three of `typecheck`, `test` and `build` matter and none implies the
others.** Vite does not type-check and does not run tests; Vitest erases types
the same way Vite does, so a suite can pass green while `tsc` fails. The CI
workflow runs them in that order for exactly this reason.

Searching hits [Open Library](https://openlibrary.org/developers/api) — real
data, no key — so the dev server needs a connection. The saved list does not.

## Routes

```text
/            SearchRoute   query lives in ?q=, so a search is shareable
/list        ListRoute     filter, sort, search the saved list
/add         AddRoute      the form; navigates to /list on success
/book/:id    BookRoute     detail, status, edit, remove
/books       -> /list      a redirect for a path people guess
*            NotFound      with the shell still around it
```

All of them inside a **layout route**, so the header, nav, announcer and footer
render once and are not remounted on navigation.

## Architecture

```text
src/App.tsx                 router + provider + base path. Three decisions.
src/routes/AppRoutes.tsx    the route table - imported by App and by the tests
src/routes/Layout.tsx       shell, nav, route announcement, focus management
src/routes/*.tsx            one file per route
src/state/reducer.ts        the shape, 10 actions, one pure function, 6 selectors
src/state/persistence.ts    read/write, version envelope, 4 failure modes
src/state/ListContext.tsx   3 contexts, 5 hooks, 1 effect
src/hooks/                  useBookSearch, useDebouncedValue, useOnlineStatus
src/lib/api.ts              fetch, 5 typed failure kinds, the unknown boundary
src/components/             presentational, plus 2 that read context
src/test/setup.ts           matchers, cleanup, one jsdom gap
```

Dependencies point one way: `api.ts` and `reducer.ts` import nothing of the
app's, `persistence.ts` imports the reducer's types, the context imports both,
the routes import the context's hooks. Nothing points back up.

### Why it is like this

The file list is recoverable from the code. These are not.

**State in a reducer**, because by the end of Week 6 four handlers were
updating two things at once — removing a book had to also close the editor —
and each one was a chance to forget the second half. One action, one
transition, written once.

**Normalised (`byId` + `ids`)**, not for speed. An update to an id that is not
in the list is a silent no-op in an array, because `.map` matches nothing. The
cost is one invariant, which Day 31 renders on screen and checks live.

**Ids and timestamps on the action**, not generated in the reducer, so the
reducer is pure. That felt pedantic on Day 31 and paid off twice: 26 reducer
tests need no mocks at all, and when search results became a second source of
books on Day 35 it needed a new action *creator* rather than a new action type.

**Three contexts**, split by how often their values change — `dispatch` never,
`state` on every change, `notice` almost never. Bundled, a Remove button would
re-render on every keystroke in the filter box.

**Search state in a hook, not the reducer**, because nothing outside the search
panel needs it. The same "closest common parent" rule as component state.

**The query in the URL.** Four behaviours came free: back-button history,
shareable links, surviving navigation, and re-running on reload. Week 7 kept it
in `useState`, which threw all four away.

**Only the books are persisted.** Restoring a three-day-old filter and showing
"Showing 0 of 12" is a worse first impression than starting clean, and a
restored `editingId` could open an editor for a deleted book.

**The route table is a component.** Day 37's tests copied it; Day 40 extracted
it — see below.

## Testing

```text
src/state/reducer.test.ts         26  pure functions, no DOM
src/components/BookForm.test.tsx  17  one component, through its labels
src/routes/routing.test.tsx       18  routes wired together, stubbed fetch
src/routes/accessibility.test.tsx 23  the things invisible to a mouse
```

Three levels, and the rules applied throughout:

- **Every query is by role or by label.** No class names and no test ids. A
  test that finds a button by `.button--danger` passes after the class is
  renamed and the button has stopped working, and fails after a restyle when
  nothing has.
- **`userEvent`, not `fireEvent.** It dispatches the full interaction sequence
  including focus. A bare `change` sets a value without ever focusing the
  field, so a test can pass while the form is unusable by keyboard.
- **`findBy*` and `waitFor`**, not `setTimeout`. My hand-rolled jsdom probes in
  Weeks 6–7 all used a fixed wait, which is both slower than necessary and
  flaky when it is too short.
- **`within` rather than a test id** when a query is ambiguous — and an
  ambiguous query is often a real accessibility gap. One of them was: the
  summary list had no accessible name, so a test could not tell its "Finished"
  tile from the "Finished" filter button, and neither could a screen reader.
- **`toBe`, not `toEqual`, for bail-outs.** The reducer returns the same
  reference when there is nothing to do, so React skips the render. Identity is
  the only way to test that, and it is worth testing because it is otherwise
  invisible.

### The route table extraction

Day 37 duplicated the route table into the tests, because importing `App`
pulls in `BrowserRouter`, which reads the real URL and cannot be pointed at a
path. The note said Day 40 would extract it.

It did, and the duplication had already cost something: **the copied table
never had the `/books` redirect.** That route shipped on Day 36 and had no
automated coverage for four days, because the tests exercised a different table
that happened to look similar. Importing the real one added a passing test
immediately.

Nothing was ever broken. That is precisely why the gap was invisible — and the
general lesson is that a duplicated source of truth does not announce itself
when it drifts.

## Accessibility

A client-side route change announces **nothing** and moves focus **nowhere** by
default. Both are invisible when testing with a mouse, and both are fixed here:

- A polite live region that starts empty and names the new page after each
  navigation — keyed on `location.key`, so navigating to the same path twice
  still announces, and skipping the first render because the browser already
  announced the document.
- Focus moved to `<main>` (with `tabIndex={-1}`) after navigation, and **not**
  on arrival.
- A focusable error summary on the form, listing every problem in field order,
  each linked to a field whose existence is asserted by a test.
- `aria-invalid` plus `aria-describedby` on each field, with the wiring tested
  through `toHaveAccessibleDescription` rather than assumed.
- `aria-pressed` on the filter buttons and `aria-current` on the nav, so the
  state is announced and not merely coloured — and the stylesheet hangs off
  those attributes, so visible and announced cannot disagree.
- A skip link first in the tab order, with its target asserted. A skip link
  pointing at a missing id is worse than none, because it looks like it works.
- Accessible names on every region, the nav and the summary list.
- Reduced-motion media query around the skeleton animation.

The whole palette was **measured**, not eyeballed:

```text
body text        16.22:1      brand on surface   9.57:1
text-muted        7.83:1      white on brand     9.57:1
danger            7.92:1      finished badge     6.51:1
```

Everything already passed AA before the pass, including the two colours I was
sure were the problem — my guesses were out by more than a point. The one
colour change is a readability preference at 0.8125rem, and the stylesheet says
so rather than claiming a fix that was not needed.

## Deployment

`BrowserRouter` uses real paths, so `/list` is a URL the **server** is asked
for. Clicking around works; refreshing 404s. Three fixes, all included:

| Host | Mechanism |
|------|-----------|
| Netlify | `_redirects` / `netlify.toml` — `/* /index.html 200` |
| Vercel | `vercel.json` rewrite |
| GitHub Pages | `public/404.html` + a synchronous restore script in `index.html` |

**200, not 301** — a redirect to `/` loses the path the router needs to see.

GitHub Pages has no rewrites at all, so `404.html` is the only hook: it
rewrites `/repo/list` to `/repo/?redirect=/list`, and an inline script in
`index.html` puts the path back before the bundle loads. It is a hack, and the
alternative is `HashRouter` and `/#/list` in every shared URL.

### Base path

```ts
const base = process.env["VITE_BASE"] ?? "/";          // vite.config.ts
<BrowserRouter basename={import.meta.env.BASE_URL}>     // App.tsx
```

Both halves are needed. Wrong `base` gives a **blank page with a console 404**
and no visible error. Missing `basename` gives an app that renders with every
route falling through to the wildcard, which looks like a routing bug rather
than a path bug.

### Caching

```text
/assets/*     max-age=31536000, immutable   (content-hashed)
/index.html   no-cache                      (names the current assets)
```

One cached forever, one never cached, and the content hash is what keeps them
consistent. Caching `index.html` is how a returning visitor gets a blank page
after every deploy.

### CI

`npm ci` → `typecheck` → `test` → `build` → deploy. In that order, because
`vite build` checks neither types nor tests, and a deploy that ships a red
suite is worse than no deploy.

## What I learned this week

- The URL is state, and better state than `useState` for anything shareable,
  bookmarkable or reachable with the back button.
- A layout route renders the shell once; the provider goes outside the routes
  for the same reason.
- `end` on a `NavLink` to `/` is required, or it is active on every route.
- `useParams` gives `string | undefined`, and a route parameter can name
  something that does not exist. Both checks are real, and "not found" is a
  state rather than an error.
- Navigation caused by an event belongs in the handler, not in an effect.
- Without a wildcard route, an unknown path renders silence.
- Vitest reusing `vite.config.ts` means the tests compile the way the app does.
- `@testing-library/jest-dom/vitest` registers the matchers *and* their types.
- `cleanup` and a storage reset between tests prevent leakage whose failure
  always appears in the innocent test.
- A ref meant to survive navigation has to live in a component that survives
  navigation — mine was in five components that remount, so the feature never
  ran once and only a test found it.
- `tabIndex={-1}` is the one correct use of a negative tabindex.
- A test breaking because the DOM legitimately changed is the suite working:
  make the test specific, do not remove the behaviour.
- Calculate contrast; do not estimate it.
- `manualChunks` with a map of names only captures what is reachable from those
  exact entries. Splitting on `node_modules` is cruder and works — and I only
  noticed because the output sizes looked wrong.
- A duplicated source of truth hides drift silently.

## Checks I ran

- `typecheck`, `test` and `build` clean on every day of the week
- 84 tests, including 23 for behaviour that is invisible without a screen
  reader or keyboard
- Day 36 driven through jsdom: every route, the back button restoring *and*
  re-running a search, a deep link to a missing book, the redirect, and an
  unknown path
- Builds verified at both base paths, with the emitted asset URLs inspected
- `vite preview` answering 200 on `/`, `/list` and `/book/OL123W` — the SPA
  fallback working
- `dist/` confirmed to contain `404.html` and `_redirects` from `public/`
- The quality sweep re-run on the last day rather than assumed: no `any`, no
  `@ts-ignore`, no stray `console`, no `outline: none`, no positive tabindex,
  every placeholder beside a real label

Mistakes of mine that the checks caught, all fixed: a focus hook that never
fired, a `manualChunks` config that left React in the app chunk, a `process`
usage that built but failed `tsc`, a wrong expectation about which titles
contain an "o", two ambiguous queries (one of which was a real accessibility
gap), and contrast figures I had guessed rather than measured.

## Week 8 completion checkpoint

- [x] Routed, with nested routes, a route parameter and a not-found route
- [x] Tested at key behaviours — 84 tests across three levels
- [x] Accessible by keyboard, with route announcements and focus management
- [x] A production build, previewed locally
- [x] Deployment configuration for three hosts, and a CI workflow
- [x] Documented: this file, plus five daily notes
- [x] Five daily commits, a review PR and a `v2.0` tag

## Known limitations

Stated plainly rather than carried into Week 9.

- **`src/data.ts` is misnamed.** The `Book` type moved to the reducer on
  Day 31; what is left is three unions, their labels and three guards. It
  should be `domain.ts`. Renaming touches nine imports for no behavioural
  change, so it is recorded rather than done on the last day of a week.
- **The author sort orders by forename.** It sorts on `authors[0]`, which is a
  full name. A surname sort needs a surname field; splitting on the last space
  breaks "Ursula K. Le Guin". Flagged in three consecutive weeks now, which
  makes it a decision rather than a backlog item.
- **No pagination.** The API returns 12 results and there is no next page.
- **Two near-identical `renderAt` helpers** in the test files. Sharing them
  would mean reading two files to understand one test, and their `beforeEach`
  blocks differ. Two similar things are not yet a duplication.
- **Not actually deployed.** The configuration for three hosts is written and
  the build is verified at both base paths, but no live URL exists — the repo
  has no remote set up for Pages.

## Next week

Week 9 is Angular: the CLI, standalone components, template binding and the
modern `@if`/`@for` control flow. The same reading list again, on a framework
with very different opinions about where things belong.
