# Week 4 — Browser JavaScript, APIs and Git/GitHub

Reading List Dashboard. A browser app that searches a live API, persists what you
save, and went through a real pull request. No framework and no dependencies.

## What this is

The week takes Week 3's language work into the browser: selecting and updating
the DOM, handling events and forms, calling an API with `async`/`await`,
splitting the result into ES modules, and persisting it in `localStorage`.

The finished app for the week is:

`Day 20/Reading List Dashboard/index.html`

It searches [Open Library](https://openlibrary.org/developers/api) — a public
JSON API with no key and CORS enabled — and keeps a reading list in the browser.

## How to run it

Days 16 to 18 are plain scripts and open directly in a browser. **Days 19 and 20
are ES modules and need a server.**

```bash
cd "Day 20/Reading List Dashboard"
npx serve .
# or
python -m http.server 8000
```

Then open the printed address.

Double-clicking `index.html` on Day 19 or 20 fails with a CORS error on every
import. A module is fetched under CORS rules and a `file://` page has an opaque
origin, so every import is treated as cross-origin and blocked. A classic
`<script src>` is not fetched that way, which is why Days 16–18 work from the
file system and these two do not.

## Folder layout

```text
Day 16/DOM Selection and Updates/    query, create, remove, render a list
Day 17/Events and Forms/             events, delegation, validation, debounce
Day 18/Promises, Async and Fetch/    fetch, the four states, typed failures
Day 19/Modules, localStorage and Git/  five ES modules, persistence
Day 20/Reading List Dashboard/       the finished app, filter/sort/stats
```

Each day keeps its own snapshot, so the app can be read as it grew rather than
only in its final state. Day 18's `app.js` was 449 lines in one scope; Day 19 is
the same app as five modules, and the diff between those two folders is the
clearest thing in the week.

## Architecture

Five modules, with the dependencies pointing one way and one job each.

```text
main.js       wiring: events in, actions out. Reads no state, writes no DOM.
js/api.js     the only file that touches the network
js/state.js   the only file that may change state
js/render.js  the only file that touches the DOM
js/storage.js the only file that touches localStorage
js/format.js  pure functions: a value in, a string out
```

The store notifies subscribers, and `render` is subscribed exactly once:

```js
store.subscribe(render);
```

So no event handler ever calls `render()`. A handler calls an action, the action
commits, and the commit notifies. The bug this design removes is the one where a
new feature changes state and forgets to redraw.

### State against derived values

Stored: `query`, `results`, `saved`, `phase`, `error`, `filter`, `sort`,
`savedSearch`.

Derived on every render, never stored: the visible saved list (filter + search +
sort) and the whole statistics panel.

The first version stored the filtered array, and adding a book while a filter
was active left the new book invisible, because `saved` changed and the filtered
copy did not. If a value can be calculated from state, it is not state.

## What the app does

- Searches Open Library live, with an eight-second timeout
- Renders four request states: loading, success, empty and error
- Tells six failure types apart — 404, 429, 5xx, network, timeout, bad JSON —
  each with a message that says what to do next
- Retries network-level failures once with a backoff, and does not retry a 404
- Cancels a superseded request, so a slow earlier response cannot overwrite a
  faster later one
- Saves books to `localStorage` behind a `{ version, savedAt, items }` envelope
- Filters by status, searches by title and author, sorts by added/title/author/year
- Takes a per-book note that saves itself, debounced at 400ms
- Summarises the list: totals per status, oldest year, commonest decade
- Exports to JSON and imports by merge, de-duplicated on `id`
- Falls back to in-memory storage, and says so, when `localStorage` is blocked

## What I learned this week

- `textContent` escapes and `innerHTML` parses, so anything that came from a
  user or an API goes in through `textContent`.
- Rebuilding a list with `innerHTML = ""` destroys focus and scroll position.
  A `DocumentFragment` is one reflow instead of one per node.
- One delegated listener on a container survives a re-render; per-item listeners
  have to be reattached every time the items are replaced.
- `event.target` is what was clicked and `currentTarget` is what is listening,
  and `closest()` is what bridges the gap when the click lands on an icon inside
  a button.
- `fetch` does not reject on 404 or 500. `response.ok` has to be checked by
  hand, and skipping it is why fetch bugs surface as confusing parse errors.
- Every failure has a different `error.name`, and telling them apart is the
  whole difference between a useful message and "something went wrong".
- An empty successful result is a state of its own, not an error.
- Microtasks all run before the next timer, so `setTimeout(fn, 0)` lands after
  an already-resolved promise.
- `Promise.all` is all-or-nothing; `allSettled` is for when half a panel is
  still worth showing.
- A module's top-level names are not global, the `.js` extension is required
  because an import specifier is a URL, and imports are live read-only bindings
  rather than copies.
- `localStorage` stores strings only, and the `JSON` round trip is not lossless:
  a `Date` comes back as a string and `undefined` disappears.
- Reading storage can fail three ways — blocked, corrupt, over quota — and all
  three have to be handled before anything renders.
- A commit is a snapshot with a parent pointer, a branch is a movable pointer to
  a commit, and a tag is a pointer that does not move.

## Checks I ran

- All four request states exercised on purpose, with three buttons on Day 18
  that force a 404, a network failure and an empty result
- Searched, closed the tab, reopened it, and confirmed the list came back
- Corrupted the stored JSON by hand in DevTools and confirmed the app still
  starts, empty, instead of throwing
- Blocked site data and confirmed the in-memory fallback and its header note
- Exported, cleared the list, re-imported, and confirmed nothing duplicated
- Keyboard-only pass: tab order matches visual order, `/` focuses search,
  `Escape` clears it, every select is reachable and labelled
- Checked that aborting a search leaves no error on screen, because the newer
  results are already there
- Console clean on load and after each action

## Week 4 completion checkpoint

- [x] DOM updates driven from JavaScript data
- [x] Event handling, including delegation for dynamic lists
- [x] Async API flow with loading, success, empty and error states
- [x] Local persistence where it is useful
- [x] Code split into ES modules
- [x] A merged pull request, and a `v1.0` tag
- [x] README with setup steps and what I learned
- [x] Five daily commits

## Git workflow used

```bash
git switch -c feature/reading-list-dashboard
git add .
git commit -m "day 20: filter, sort and derived stats"
git push -u origin feature/reading-list-dashboard
# PR opened, reviewed, merged into main as a merge commit
git switch main && git pull
git tag -a v1.0 -m "Week 4: Reading List Dashboard"
git push origin v1.0
```

Reviewing my own diff before merging found a leftover `console.log` and a
comment that still described an earlier design. Neither would have shown up by
running the app.

## Next week

Week 5 is TypeScript: a Vite project, everyday types, functions and narrowing,
object types and interfaces, then generics and classes — finishing with this
same app migrated to TypeScript with every API response typed and no
unexplained `any`.
