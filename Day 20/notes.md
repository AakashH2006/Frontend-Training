# Day 20 - API app and pull request

## Topics Covered

- Finishing the Week 4 app: filter, sort, per-book notes, statistics
- Derived state against stored state
- `toSorted`, and why `sort` was the wrong call here
- `localeCompare` against `<` for text
- Exporting to a file with `Blob` and an object URL
- Importing a file, and merging rather than replacing
- A feature branch, a pull request, reviewing my own diff, merging
- `git tag`, and what a tag actually points at
- Merge, squash and rebase, and which one I picked

## Practical Work

The Reading List from Day 19, finished. Day 19 got the modules and the
persistence working; today is the part that makes it an app rather than a
demo — filtering, sorting, notes, a summary panel — and then the Git workflow
the whole week has been building towards.

```text
main.js          wiring: events in, actions out
js/api.js        fetch, retry, timeout, mapping a doc to a book
js/state.js      the store, the actions, and the derived values
js/render.js     the only thing that touches the DOM
js/storage.js    the only thing that touches localStorage
js/format.js     pure formatting - new today
```

`format.js` is the one new file. It came out of `render.js` because those
functions are pure — same argument in, same string out, nothing touched on the
way — and mixing them into the rendering made it hard to see which code decided
*structure* and which decided *wording*. It is also now the only part of the app
that could be tested without a DOM, which is a Week 8 problem I can already see
coming.

## Derived State

The thing I got wrong first and then had to undo.

My first version of filtering stored the filtered array:

```js
// what I wrote first
commit({ filter, visible: state.saved.filter(...) });
```

That is two pieces of state that have to agree. Add a book while a filter is
active and `saved` changes but `visible` does not, so the new book is invisible
until the filter is clicked again. I had that bug for about twenty minutes and
it looked like a *save* failure rather than a filter failure — which is the
expensive part, because I went looking in `storage.js` first.

The fix is that `filter`, `sort` and `savedSearch` are stored, and the list you
can see is computed on every render:

```js
export function visibleSaved(snapshot) {
    return snapshot.saved
        .filter((entry) =>
            snapshot.filter === "all" ? true : entry.status === snapshot.filter
        )
        .filter((entry) => matchesText(entry, snapshot.savedSearch))
        .toSorted(comparators[snapshot.sort] ?? comparators.added);
}
```

Three inputs, one output, recalculated each time. There is no second copy that
can fall out of date, because there is no second copy.

`stats()` works the same way. Totals per status, the oldest year, the commonest
decade — all counted from `saved` when asked for. Storing a running count means
every action has to remember to update it, and the first action that forgets is
a number on screen that is quietly wrong with nothing in the console.

The rule I am taking out of this: **if a value can be calculated from state, it
is not state.**

## Sorting

```js
.toSorted(comparators[snapshot.sort] ?? comparators.added)
```

Two things in that line took a go to get right.

**`toSorted`, not `sort`.** `sort` mutates the array it is called on. The array
here comes out of `getState()`, which copies, so mutating it is survivable — but
`toSorted` returns a new array and that copy stops being load-bearing. The `??`
matters too: a `sort` value that is not in the table would otherwise pass
`undefined` to `toSorted`, which quietly falls back to sorting as strings
instead of failing.

**`localeCompare`, not `<`.** Comparing strings with `<` compares UTF-16 code
points, so every capital letter sorts before every lowercase one and `"Zadie"`
lands before `"achebe"`. `localeCompare` uses the collation rules for the locale
and handles accents as well.

```js
const comparators = {
    added:  (a, b) => b.addedAt.localeCompare(a.addedAt),
    title:  (a, b) => a.title.localeCompare(b.title),
    author: (a, b) => (a.authors[0] ?? "").localeCompare(b.authors[0] ?? ""),
    year:   (a, b) => (b.year ?? -Infinity) - (a.year ?? -Infinity)
};
```

The `year` comparator is where the missing data shows up. A book with no year
has `year === undefined`, and `undefined - 1990` is `NaN`. A comparator that
returns `NaN` does not throw — it makes the sort order *undefined*, so the list
comes back in an order that can differ between engines. `?? -Infinity` sends the
unknown years to the end on purpose instead.

Sorting `added` by ISO string works because ISO 8601 sorts lexicographically in
the same order as it sorts chronologically. That is the actual reason dates are
stored in that format rather than as `Date.now()` numbers or anything localised.

## Export and Import

`localStorage` is per-origin and per-browser. Nothing in it moves to another
browser, another profile or another machine, which makes a file the only way the
list travels — and the only recovery for the corrupt-JSON case in `storage.js`,
where starting empty is the only safe option.

```js
const blob = new Blob([JSON.stringify(saved, null, 2)], {
    type: "application/json"
});

const url = URL.createObjectURL(blob);
const link = document.createElement("a");
link.href = url;
link.download = `reading-list-${new Date().toISOString().slice(0, 10)}.json`;
link.click();

URL.revokeObjectURL(url);
```

An object URL is a reference to an in-memory blob, and it pins that blob until
it is revoked or the document goes away. Not revoking it is a leak — small here,
not small on a page that exports repeatedly.

The `download` attribute is what makes the browser save rather than navigate.
Without it, a JSON blob opens in a tab.

Import merges rather than replaces:

```js
const existing = new Set(state.saved.map((entry) => entry.id));
const incoming = books.filter(
    (book) => book && typeof book.id === "string" && !existing.has(book.id)
);
```

Replacing would mean restoring a backup silently deletes everything added since
that backup was taken. The `Set` is there so de-duplication is one lookup per
incoming book instead of a scan of the whole list each time.

Everything in that file is untrusted. It has been on a disk and it may have been
edited by hand. So it is checked for being an array first, then each entry is
checked for an `id` that is a string, and the defaults are spread *before* the
incoming object so a file missing `status` still produces a valid entry:

```js
.map((book) => ({ status: "unread", note: "", addedAt: ..., ...book }))
```

Spread order is the whole behaviour there. Putting the defaults second would let
a file overwrite them with `undefined`.

## Notes That Save Themselves

```js
const saveNote = debounce((id, value) => store.setNote(id, value), 400);
```

The note field writes to `localStorage` as you type, debounced at 400ms, so
there is no Save button to forget to press.

Debouncing is not a nicety here. `storage.save()` is a `JSON.stringify` of the
entire list plus a synchronous write, and doing that on every keystroke blocks
the main thread on every keystroke.

## Git: The Workflow

The part of today that was not code.

```bash
git switch -c feature/reading-list-dashboard
# ... the day's work, in several commits ...
git push -u origin feature/reading-list-dashboard
```

Then a pull request on GitHub from that branch into `main`, reviewed by me,
merged by me.

Reviewing my own diff felt pointless for about a minute and then found two
things: a `console.log` left in `render.js`, and a comment in `state.js` that
still described the version where `visible` was stored. Neither would have been
caught by running the app, because neither of them changes what it does.

Reading the diff is a different activity from reading the file. The diff shows
only what changed, so what is on screen is exactly the set of decisions I made
today — which is why a leftover log jumps out of it and does not jump out of a
400-line file I have been staring at all afternoon.

### What `-u` does

`-u` sets the upstream, so the local branch now tracks a remote branch. After
that, plain `git push` and `git pull` know where to go, and `git status` can tell
me I am "ahead by 2 commits". Without it, every push needs the remote and the
branch spelled out again.

### Merge, squash or rebase

The three buttons on the PR, and they do genuinely different things:

| Option | What ends up on `main` |
|--------|------------------------|
| Merge commit | Every branch commit, plus a merge commit with two parents |
| Squash | One new commit containing the whole branch |
| Rebase | Each branch commit replayed onto `main`, no merge commit |

I took the merge commit. This branch has commits worth keeping apart — sorting,
then export/import, then the stats panel — and squashing them into one
`day 20: finish the app` would throw away the order they were built in, which is
the thing this repo exists to show. For a branch that is one fix in five messy
commits I would squash without thinking about it.

### Tagging

```bash
git switch main
git pull
git tag -a v1.0 -m "Week 4: Reading List Dashboard"
git push origin v1.0
```

A tag is a name for one specific commit, and unlike a branch it does not move.
That is the entire difference: a branch pointer advances every time you commit
on it, a tag stays on the commit it was made on.

`-a` makes it annotated — a real object in the repository with an author, a date
and a message — rather than lightweight, which is only a name. A release should
be annotated, because in six weeks the message is the only record of why that
commit was the one worth naming.

Tags are not pushed by `git push`. They have to be pushed by name, which I did
not know, and which is why my tag existed locally and nowhere else for a while.

## Accessibility

The things I checked, because this screen is mostly controls:

- The status line is `role="status"`, so the search phase is announced without
  moving focus
- The filters are real `<button>`s carrying `aria-pressed`, not styled `<div>`s
- Each status `<select>` has its own label, associated by `id`, visually hidden
  but present for a screen reader
- `change` is the event on those selects, not `click`, so the keyboard works
- The `/` shortcut checks `event.target.matches("input, textarea, select")`
  first, otherwise it eats a slash typed into a note field
- Skeleton cards are `aria-hidden`, because the status message already says what
  is happening and a list of empty boxes is noise

## What I Learned

If a value can be calculated from state, it should not be stored. Two copies
cannot be kept in agreement, and the one that goes stale shows up as a wrong
number on screen with nothing in the console.

`sort` mutates and `toSorted` does not. A comparator that returns `NaN` produces
an order that varies between engines rather than an error.

`localeCompare` is the comparison for text; `<` compares code points, so case
and accents come out wrong.

ISO date strings sort lexicographically in chronological order, which is the
reason to store them over anything localised.

An object URL pins its blob in memory until it is revoked, and `download` is
what makes a browser save a blob instead of navigating to it.

Imported data is untrusted data. Merging on a unique key is what stops a restore
from deleting newer work, and spread order decides whether a file can overwrite
my defaults.

Reading my own diff before merging catches a different class of problem from
running the app. Dead code and stale comments do not change behaviour.

A tag names one commit and does not move. Annotated tags carry a message, and
`git push` on its own does not push them.

## How to run it

A module page needs a server. From `Day 20/Reading List Dashboard`:

```bash
npx serve .
# or
python -m http.server 8000
```

Then open the printed address. Double-clicking `index.html` fails on the module
imports — that is the `file://` CORS problem from Day 19.

## Day 20 Outcome

The Week 4 app is finished. It searches Open Library live, renders all four
request states, saves books to `localStorage` behind a version envelope, and
survives blocked or corrupt storage without failing to start. The saved list
filters by status, searches by title and author, sorts four ways, and takes a
per-book note that saves itself. A summary panel counts totals per status, the
oldest year and the commonest decade — all derived, none of it stored. The list
exports to a JSON file and imports by merge.

The work went through a feature branch, a pull request I reviewed and merged
myself, and an annotated `v1.0` tag on `main`.

That closes Month 1. Week 5 is TypeScript: a Vite project, everyday types,
narrowing, interfaces and generics, and then this same app migrated to typed
code with no unexplained `any`.
