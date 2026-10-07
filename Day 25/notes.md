# Day 25 - Migration mini-project

## Topics Covered

- Migrating a working JavaScript app to TypeScript
- Where `strictNullChecks` actually hurts: the DOM
- One helper instead of twenty `!` assertions
- `cloneNode` returning `Node`, and `event.target` being an `EventTarget`
- `dataset` entries as `string | undefined`
- Replacing a flat state object with a discriminated union
- Receiving a `fetch` body as `unknown` and validating it
- A typed `debounce` that keeps its wrapped signature
- `ReturnType<typeof setTimeout>`
- What the types removed, and what they could not reach

## Practical Work

Day 20's Reading List Dashboard, in TypeScript. Same app, same features, same
stylesheet — 2,064 lines of JavaScript became ten TypeScript modules.

```text
index.html             Day 20's markup, with <script src="/src/main.ts">
src/main.ts            wiring: events in, actions out
src/styles.css         unchanged from Day 20
src/lib/model.ts       from Day 23, unchanged
src/lib/result.ts      from Day 24, unchanged
src/lib/repository.ts  from Day 24, unchanged
src/lib/api.ts         fetch, retry, timeout, response validation
src/lib/state.ts       the store, and the derived values
src/lib/render.ts      the only file that touches the DOM
src/lib/format.ts      pure formatting
src/lib/dom.ts         new - the DOM lookup helpers
```

Three of those were written on Days 23 and 24 and dropped in without an edit,
which was the point of writing them there.

```bash
npm install
npm run dev
npm run typecheck   # 0 errors, and no @ts-expect-error anywhere in this one
```

Worth saying: unlike Days 21-24, this project has **no deliberate errors**. It
is the app, and it compiles clean.

## The DOM Was the Hard Part

Not the business logic. The business logic was mostly already correct, and the
types agreed with it. The friction was all at the DOM.

Day 20's `render.js` opened like this:

```js
const el = {
    results: document.getElementById("results"),
    saved: document.getElementById("saved"),
    status: document.getElementById("status"),
    // ...nine of them
};
```

Every one of those is `HTMLElement | null`, so every later use became an error.
Twenty-two errors from that one object and its users. Three ways out:

**1. `!` on each lookup.** Twenty-two silent promises. If one is wrong — a
renamed id, a typo — the error arrives later as "cannot set properties of null"
on whichever line happened to touch it first, which is not the line that is
wrong.

**2. A null check in every render function.** Correct and unreadable. The real
work ends up three levels deep inside guards that can never fire.

**3. One function that looks it up, throws if it is missing, and returns a
non-null type.**

```ts
export function mustFind<T extends HTMLElement = HTMLElement>(id: string): T {
    const element = document.getElementById(id);
    if (element === null) {
        throw new Error(`Expected an element with id "${id}" and found none.`);
    }
    return element as T;
}
```

Option 3, and it is better than Day 20 was rather than merely equivalent. A
missing id now fails at startup with the id in the message, before anything has
rendered. Day 20 would have carried on and failed somewhere else entirely.

`T extends HTMLElement = HTMLElement` is a constrained parameter with a default:
callers who do not care get an `HTMLElement`, callers who need `.value` write
`mustFind<HTMLInputElement>("query")` and get it without a cast.

The `as T` is a real assertion — nothing checks that `#query` is an input rather
than a div. I wrote that down in the file rather than leaving it implied, and
noted the safer version (passing the constructor and using `instanceof`) and why
I did not use it.

### The other three DOM shapes

**`cloneNode` returns `Node`**, which has no `querySelector`. Every
`template.content.cloneNode(true)` in Day 20 needed narrowing:

```ts
export function cloneTemplate(template: HTMLTemplateElement): DocumentFragment {
    const clone = template.content.cloneNode(true);
    if (!(clone instanceof DocumentFragment)) throw new Error(...);
    return clone;
}
```

That check always passes — cloning a `DocumentFragment` deeply gives another
one. It passes *as a check* rather than as an assertion, which is the difference
worth paying one `instanceof` for.

**`event.target` is `EventTarget | null`**, and `EventTarget` has no `closest`,
no `dataset` and no `value`. So Day 20's delegated handlers were all errors:

```js
const save = event.target.closest('[data-action="save"]');   // Day 20
```

This one is not pedantry. `event.target` genuinely can be a text node or the
document, so the `instanceof HTMLElement` narrowing is a real check for a real
case.

**`dataset` entries are `string | undefined`.** Day 20 read
`row.dataset.id` and passed it straight to an action expecting a string. Usually
fine; `undefined` whenever the attribute is absent.

All three ended up in `dom.ts` behind `closestAction`, which replaced this
pattern repeated four times:

```js
const button = event.target.closest('[data-action="save"]');
if (!button) return;
const id = button.closest(".result-card").dataset.id;
```

Three nullable results in three lines, one of them unchecked.

## The State Union

The most valuable change, and the one that needed real rewriting rather than
annotation.

Day 20's state was nine flat fields. Three combinations were constructible and
wrong:

```text
phase: "error"    with a full results array
phase: "success"  with an error message still set
phase: "loading"  with the previous query
```

I had actually hit the first one, which is why `searchFailed` in Day 20 sets
`results: []` — a fix by remembering, in one of four places.

```ts
export type SearchState =
    | { readonly phase: "idle" }
    | { readonly phase: "loading"; readonly query: string }
    | { readonly phase: "success"; readonly query: string;
        readonly results: readonly Book[]; readonly total: number }
    | { readonly phase: "empty"; readonly query: string }
    | { readonly phase: "failed"; readonly query: string; readonly message: string };
```

Now `results` exists on exactly one member. The three bad combinations are not
things to remember; they are things that do not typecheck.

It changed the call sites, which is how I know it is load-bearing:

```ts
const search = store.getState().search;
if (search.phase !== "success") return;
const book = search.results.find((entry) => entry.id === hit.id);
```

That guard is not ceremony. In Day 20, `state.results` was always present and
could hold a stale array from a previous search, so clicking Save on a card
during a re-render could save a book from the last search. I never saw it
happen. I also could not have ruled it out.

And `render` is now exhaustive:

```ts
default: {
    const unreachable: never = search;
    throw new Error(`Unhandled phase: ${JSON.stringify(unreachable)}`);
}
```

Day 20's `default:` **rendered the results**, which meant an unrecognised phase
silently drew the success view. Adding a sixth phase now breaks `render.ts`
until it has a view.

### A side effect I did not expect

`getState()` got faster. Day 20 copied the whole saved list on every call:

```js
return { ...state, results: [...state.results], saved: state.saved.map((e) => ({ ...e })) };
```

...because nothing else stopped a caller mutating it. Every field is `readonly`
and every array is `readonly T[]` now, so the snapshot can be the object itself.
The types replaced a defensive deep copy that ran on every keystroke.

## The API Boundary

```ts
async function getJson(url: URL, signal: AbortSignal | undefined): Promise<unknown> {
    ...
    return (await response.json()) as unknown;
}
```

`response.json()` is declared `Promise<any>`. Left alone, that `any` flows into
`toBook`, into the store, into `render`, and the app has types written on it
rather than types in it.

Receiving it as `unknown` forces a validation step, and the validation found a
real decision I had not made. The guard is deliberately loose:

```ts
function isDoc(value: unknown): value is OpenLibraryDoc {
    ...
    return typeof candidate["key"] === "string" && typeof candidate["title"] === "string";
}
```

`key` and `title` are the only two fields `toBook` cannot work without;
everything else it already defaults. A stricter guard would drop usable records
over a missing cover id. And the count of dropped docs is returned rather than
swallowed, because silently showing 18 of 20 results should at least reach the
console.

The six failures from Day 18 became a union, so `describeSearchFailure` is
exhaustive and a new failure kind cannot be forgotten.

One thing I had to check rather than guess: a timeout from
`AbortSignal.timeout` arrives as a `DOMException` with `name === "TimeoutError"`,
while `controller.abort()` gives one named `"AbortError"`. Day 18 told them
apart by `name` alone. The `instanceof DOMException` is what makes reading
`.name` safe in the first place.

## Two Generics Worth Having

**A debounce that keeps its signature.** Day 20's was `(fn, delay = 250)` with
untyped `...args`, so it erased the type of whatever it wrapped.

```ts
function debounce<Args extends readonly unknown[]>(
    fn: (...args: Args) => void,
    delay = 250
): (...args: Args) => void
```

`Args extends readonly unknown[]` is the part that took a try: with a plain
`unknown[]` the spread back into `fn` does not typecheck.

**`ReturnType<typeof setTimeout>`** rather than `number`, because the DOM's
`setTimeout` returns a number and Node's returns a `Timeout` object. Writing
`number` compiles until `@types/node` is in scope and then stops.

## What the Types Could Not Reach

Honest accounting, because this is the part a migration can oversell.

**The falsy-value bugs.** Day 22's section 7 all over again. Nothing here stops
me writing `if (!page)` where `0` is valid. Both spellings typecheck.

**Data already on disk.** A `localStorage` entry written by Day 20's code is
still there, and no type reaches it. What helps is the *guard* at that boundary,
not the type — and the guard is why a row with `status: "readng"` is now one
dropped entry instead of a card with no badge.

**Logic.** `visibleSaved` could filter on the wrong field and compile perfectly.

**Anything about the DOM's actual contents.** `mustFind<HTMLInputElement>` is a
claim about markup the compiler has never seen.

What the types *did* remove: every "cannot read properties of null" class of
bug at the DOM, three impossible state combinations, the stale-results race, the
status typo, and the `any` that would have spread from `response.json()` through
the whole app.

## Verification

```text
npm run typecheck   ->  0 errors, no @ts-expect-error in the app
npm run build       ->  tsc clean, 12 modules transformed, built in 299ms
```

Then two checks beyond that, because compiling is not working:

**Every `mustFind` id exists.** A script cross-referencing the ids in
`index.html` against every `mustFind` call and `queryIn` selector in `src` — 24
lookups, 12 template selectors, all present. That is the one failure mode the
helper introduced, so it is worth testing rather than assuming.

**The app driven against a real DOM.** The built bundle loaded into jsdom with
`fetch` stubbed to return two Open Library docs, one of them deliberately sparse:

```text
status line   : Search for a title, an author or a subject.
storage note  : Saved in this browser. The list will still be here after a reload.
status options: unread=Unread, reading=Reading, finished=Finished

after search:
status line   : Showing 2 results of 2.
   - Things Fall Apart | Chinua Achebe | First published 1958
   - Untitled          | Author unknown | Publication year unknown

after saving the first result:
saved count   : 1 book saved, 1 shown.
summary tiles : On the list=1, Reading=0, Finished=0 (0%), Oldest=1958, Commonest decade=1950s
button        : On your list | disabled: true

problems: none
```

The sparse doc is the interesting line. One record with a blank title, no
author and no year came through as `Untitled` / `Author unknown` /
`Publication year unknown` — which is `toBook` from Day 23 making all three
decisions, and the thing I would otherwise have found as three blank spaces on a
card.

It also caught a mistake of mine: I first read the Save button from a node
reference captured *before* the re-render, saw "Save", and thought the disable
was broken. `renderResults` replaces the whole list, so the reference was
detached. Re-querying showed `On your list | disabled: true`. A stale DOM
reference after a re-render is exactly the bug the one-way data flow exists to
prevent, and I managed to write it in the test harness instead.

## What I Learned

The DOM is where `strictNullChecks` costs the most, and one throwing lookup
helper is better than both the alternatives — it turns a renamed id into a
startup error that names the id.

`cloneNode` gives `Node`, `event.target` gives `EventTarget | null`, and
`dataset` entries give `string | undefined`. All three were unchecked in working
Day 20 code.

A flat state object with a phase string allows combinations that a discriminated
union does not. Replacing it changed real call sites, which is how I know the
old shape was hiding a race rather than merely being untidy.

An exhaustive `switch` with a `never` default is strictly better than a
`default:` that guesses, because the guess renders the wrong thing silently.

`readonly` throughout removed a defensive deep copy that ran on every keystroke.
Immutability in the type system replaced immutability by copying.

`response.json()` returns `any`, and receiving it as `unknown` is the single
most important line in the migration. Everything downstream depends on that one
annotation.

A loose guard at a boundary can be the right guard. Dropping a record over a
missing cover id would lose usable data.

Types do not catch falsy-value bugs, wrong logic, or data already written to
disk. Guards at the boundaries catch the last one; nothing catches the first two.

## Day 25 Outcome

The Week 4 app, migrated. Ten modules, compiling clean under `strict` plus
`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noUnusedLocals` and
`verbatimModuleSyntax`, with no `any` and no suppression comment anywhere in it.
The API response and the stored list are both received as `unknown` and
validated; the request phase is a five-member discriminated union that makes
three previously-constructible bad states impossible; and the DOM lookups fail
loudly at startup instead of quietly later.

Verified by type-check, production build, an id cross-reference and a jsdom run
that drives a search and a save through the real event handlers.

That closes Week 5 and the first third of the course. Week 6 is React: the same
reading list as a component tree, with typed props, lists and keys, state, and
controlled inputs.
