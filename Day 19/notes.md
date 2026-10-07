# Day 19 - Modules, localStorage and Git basics

## Topics Covered

- `export` and `import`, named and namespace
- Module scope against global scope
- Why a module is deferred and strict by default
- Live bindings, and why an imported value is not a copy
- The single-evaluation rule
- Why `file://` cannot load a module
- `localStorage` against `sessionStorage`
- Serialising to JSON and the three ways reading it back fails
- `QuotaExceededError` and blocked storage
- Versioning stored data
- Git: the three areas, what a commit really is, branches, remotes

## Practical Work

Day 18's app rewritten as five files instead of one, with the saved list
persisted. It is now a **Reading List** over the Open Library search API — real
data this time, still no key.

```text
main.js          wiring: events in, actions out
js/api.js        fetch, retry, timeout, and the mapping to a book
js/state.js      the store; the only thing that may change state
js/render.js     the only thing that may touch the DOM
js/storage.js    the only thing that may touch localStorage
```

The split is not cosmetic. Day 18's `app.js` was 449 lines in one scope, and by
the end I was scrolling to work out whether a name was a DOM node or a piece of
data. The rule I settled on is one job per file, with the dependencies pointing
one way.

## Modules

```js
export class HttpError extends Error { ... }   // named export
export async function searchBooks(query) { ... }

import { searchBooks, HttpError } from "./js/api.js";
import * as store from "./js/state.js";        // namespace import
```

Four things change the moment a script becomes `type="module"`:

**Scope.** Top-level `const` in a module is local to that module. In a classic
script it is global. Day 18 had `state`, `controller` and `render` sitting on
the global namespace where anything could reach them; now nothing leaks.

**Deferred.** Modules are deferred automatically, so the DOM is parsed before
the module runs. The `DOMContentLoaded` wrapper is gone, and so is `defer` in
the tag.

**Evaluated once.** `api.js` is imported by both `main.js` and `render.js`, and
it runs one time. The module has one instance of its state, whoever imports it.
That is what makes `state.js` a store rather than a template for one.

**Strict mode**, always, with no way to turn it off.

### The extension is not optional

```js
import * as store from "./js/state.js";   // works
import * as store from "./js/state";      // 404
```

Node and bundlers resolve a missing extension. The browser does not — an import
specifier is an ordinary URL and it fetches exactly what is written. The leading
`./` is not optional either; a bare `"state.js"` is reserved for import maps.

### Live bindings

An import is not a copy of the value; it is a live read-only binding to the
exporting module's variable. If the module reassigns it, the importer sees the
new value. Read-only from the importer's side — assigning to an import is a
`TypeError`.

This is why `state.js` exports *functions* that change state rather than the
state object. An exported object binding is read-only, but the object it points
at is still fully mutable, so `import { state }` would have let any file mutate
it directly and skip every action. Exporting `getState()` and the actions closes
that, and `getState()` returns a copy for the same reason.

### file:// does not work

This is the thing that cost me the most time today. Opening `index.html` by
double-clicking it gives:

```text
Access to script at 'file:///.../main.js' from origin 'null'
has been blocked by CORS policy
```

Modules are fetched under CORS rules, and a `file://` page has an opaque origin,
so every import is cross-origin and denied. Days 16-18 worked from the file
system because a classic `<script src>` is not fetched under those rules.

A local server fixes it:

```bash
npx serve .            # or
python -m http.server 8000
```

## localStorage

```js
localStorage.setItem("key", "value");   // strings only
JSON.parse(localStorage.getItem("key"));
```

Per origin, about 5MB, synchronous, and it never expires on its own.
`sessionStorage` has the same API and is cleared when the tab closes — which is
why the saved list is in `localStorage` and nothing here uses `sessionStorage`.

Being synchronous matters: a large `JSON.parse` on load blocks the main thread.
That is fine for a list of books and would not be for a list of thousands.

### Four ways it fails

Every one of these is handled in `storage.js`, because all four happen.

**It stores strings only.** `setItem("x", {a: 1})` stores the literal
`"[object Object]"`. Objects have to go through `JSON.stringify`, and anything
JSON cannot represent — a `Date`, `undefined`, a `Map`, a function — is silently
converted or dropped. Dates go in as ISO strings for exactly that reason.

**The stored JSON can be corrupt.** Something edited it in DevTools, or a write
was cut short. `JSON.parse` throws, and without a `try` the app never starts.

**Writing can throw.** `QuotaExceededError` when the origin is full. The name
differs between engines, so both spellings are checked.

**Access itself can throw.** In Safari private mode, and with site data blocked,
`localStorage` exists and throws when touched. So the feature test has to be a
real write inside a `try`, not `typeof localStorage !== "undefined"`:

```js
const available = (() => {
    try {
        localStorage.setItem("__probe__", "__probe__");
        localStorage.removeItem("__probe__");
        return true;
    } catch {
        return false;
    }
})();
```

When it is unavailable the app falls back to an in-memory copy and says so in
the header. It forgets on reload, which is a far better failure than a page that
will not start.

### Versioning

```js
JSON.stringify({ version: 1, savedAt: ..., items })
```

Storing a bare array works right up until the shape changes, and then every
existing user's next visit is a crash. The envelope means old data can be
detected and ignored — or migrated later — instead of being parsed as though it
were the current shape.

## Git

The part I had been using without understanding.

**Three areas.** Working directory (edited files), staging area / index
(`git add`), repository (`git commit`). `git add` is not "mark this for commit",
it is "copy this version into the index" — editing a file after adding it means
the commit contains the older version unless it is added again.

**A commit is a snapshot, not a diff.** It stores the full tree plus a pointer
to its parent. Diffs are calculated between two commits when asked for; they are
not what is stored.

**A branch is a movable pointer to a commit.** That is the whole thing — which
is why branching is instant and why there is no reason to avoid it.

```bash
git status                     # what is in which area
git add .
git commit -m "day 19: ES modules and localStorage"
git log --oneline --graph
git switch -c feature/reading-list
git push -u origin feature/reading-list
```

`HEAD` is a pointer to the current branch, which points to a commit. Detached
HEAD is just HEAD pointing straight at a commit with no branch in between, which
is why a commit made there has nothing referring to it afterwards.

Commit messages in this repo are `day NN: topic`, present tense, one concern per
commit.

## What I Learned

A module's top-level names are not global, which removes a whole category of
accidental collisions that Day 18 was one typo away from.

The `.js` extension is required in the browser, because an import specifier is a
URL and nothing resolves it for you.

Imports are live read-only bindings, not copies — so exporting actions rather
than the state object is what actually protects the state.

A module page cannot be opened over `file://`. It needs a server, and the error
message talks about CORS rather than anything about modules.

`localStorage` stores strings only, and `JSON.stringify` quietly drops
`undefined` and turns a `Date` into a string. The round trip is not lossless.

Reading storage can fail three different ways — blocked, corrupt, over quota —
and all three have to be handled before the app renders anything.

Storing a version alongside the data is what makes it possible to change the
shape later without breaking everyone who already has the old shape.

`git add` copies the current content into the index, so editing after adding
leaves the older version staged.

A branch is a pointer to a commit. Nothing is copied when one is created.

## How to run it

A module page needs a server. From this folder:

```bash
npx serve .
# or
python -m http.server 8000
```

Then open the printed address. Double-clicking `index.html` will not work.

## Day 19 Outcome

The app is five ES modules with the dependencies pointing one way: `main.js`
wires events to actions, `state.js` owns the data and notifies subscribers,
`render.js` is the only file that touches the DOM, `api.js` is the only one that
touches the network, and `storage.js` is the only one that touches
`localStorage`. Render is subscribed once, so no handler has to remember to
redraw. The saved list persists across reloads, survives corrupt or blocked
storage without failing to start, carries a version number, and can be exported
to and imported from a JSON file.

Day 20 finishes the Week 4 app and takes it through a feature branch, a pull
request and a `v1.0` tag.
