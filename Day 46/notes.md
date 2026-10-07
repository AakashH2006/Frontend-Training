# Day 46 - Signals and computed state

## Topics Covered

- `signal()`, `.set()` and `.update()`
- `computed()`: lazy, cached, and dependency-tracked
- Why a computed notifies on a changed **value**, not a changed dependency
- `effect()`, and the one thing it is for
- Writing a signal from inside a computed (not allowed) and from an effect
- `untracked()`
- `linkedSignal()`
- Splitting one computed into three

## Practical Work

The reading list with every derived value named, plus a lab making each claim
observable.

```text
src/app/app.ts + .html             4 signals, 6 computeds, 1 effect
src/app/signals-lab.ts + .html     the six experiments
```

## computed Is Lazy And Cached

The first thing I wanted to see rather than be told.

```ts
protected readonly product = computed(() => {
    this.expensiveRuns += 1;
    return this.a() * this.b();
});
```

The template reads `product()` once per render, and a button reads it three
more times:

```text
runs at start : The computation has run 1 time.
after 3 reads : The computation has run 1 time.    <- unchanged
after a+1     : The computation has run 2 times.
```

**Four reads, one evaluation.** It recalculates only when a signal it read has
changed; every read in between returns the cached value.

That is strictly more than `useMemo` does. `useMemo` caches across renders of
one component; a computed is cached globally and read from anywhere.

### A counter has to live outside the graph

`expensiveRuns` is a plain field, not a signal, and that is forced: **writing a
signal from inside a computed throws.** Angular refuses, because a computation
that changes the graph while reading it has no defined order.

So the count is a plain field, mirrored into a signal via `queueMicrotask` only
so it can be displayed. That constraint is a good one — it is the rule that
makes a computed safe to call from anywhere.

## It Notifies On A Changed Value

The behaviour I did not expect, and the one that makes the model different from
React's.

```ts
protected readonly count = signal(0);
protected readonly isEven = computed(() => this.count() % 2 === 0);
// an effect watches isEven
```

```text
start    : The effect watching isEven has run 1 time.
after +2 : The effect watching isEven has run 1 time.   <- count changed, isEven did not
after +1 : The effect watching isEven has run 2 times.
```

`+2` changes `count` and leaves `isEven` alone, so **nothing downstream
re-runs**. The graph propagates *values*, and a consumer only hears about it
when the value it depends on actually differs.

React has no equivalent. A `useMemo` consumer re-renders whenever its component
re-renders, memo or not — the memo saves the *computation*, not the render.
Here the propagation stops at the unchanged value.

This is the thing that makes the three-stage split below free.

## Splitting One Computed Into Three

Day 45 had one computed doing filter-then-search-then-sort. Day 46 has:

```ts
byStatus = computed(...)   // depends on books, filter
matching = computed(...)   // depends on byStatus, query
visible  = computed(...)   // depends on matching, sort
```

Same work, three names — and because the graph caches each stage, **changing
only the sort does not redo the filtering.**

I would not make that split in React, because three `useMemo`s mean three
dependency arrays to keep correct, and a wrong one is a stale value with no
error. Here there are no arrays, so the split costs nothing but the names.

## untracked

```ts
protected readonly readsOne = computed(
    () => `${this.tracked()} + ${untracked(() => this.ignored())}`
);
```

```text
start           : readsOne = tracked + ignored
ignored changed : readsOne = tracked + ignored        <- stale, on purpose
tracked changed : readsOne = TRACKED + IGNORED        <- both picked up
```

`readsOne` reads both signals and depends on one. Changing the untracked one
does not recompute it, so the displayed value goes stale deliberately — and
when something else does trigger a recompute, the new value appears.

It is for reading something you do not want to **react** to: a configuration
value, a timestamp, a logger. Used sparingly, because a stale value with no
error is exactly the failure mode Week 7 spent a day on.

## effect

```ts
effect(() => {
    const shown = this.visible().length;
    const all = this.total();

    untracked(() => {
        document.title = shown === all ? `Reading List (${all})` : `Reading List (${shown}/${all})`;
    });
});
```

```text
title       : Reading List (7)   | summary: All 7 books.
after query : Reading List (2/7) | summary: 2 of 7 books.
after clear : Reading List (7)
```

**One effect in the whole component**, and it earns the name: the document
title lives outside Angular's reactive graph, so keeping it in step is
synchronisation.

Day 33's test applies unchanged — *name the outside thing* — and the outside
thing is `document`. If I had reached for an effect to keep `visible` in step
with `query`, that would be Day 34's mistake in a new framework.

### Writes in an effect

Angular **allows** writing signals from an effect, unlike from a computed. So
`untracked` around the write is my discipline rather than the framework's: an
effect that writes a signal it also reads is a loop, and nothing stops it being
written.

That is a real difference from the computed rule, and it is worth knowing which
of the two guardrails is the framework's and which is mine.

## linkedSignal

The one I had not met, and it names a pattern I have fought twice.

```ts
protected readonly statuses = signal<readonly string[]>(['unread', 'reading', 'finished']);
protected readonly selected = linkedSignal(() => this.statuses()[0] ?? '');
```

Writable like a signal, derived like a computed: it **resets to the
computation's value whenever the source changes**, and can be written to in
between.

```text
start           : options = [unread, reading, finished] · selected = unread
picked last     : options = [unread, reading, finished] · selected = finished
options changed : options = [abandoned, wishlist]       · selected = abandoned
```

This is "a selection that resets when the options change" — the exact shape
that needs `useState` plus a `useEffect` in React, which is the pattern the
React docs warn about and which Day 34 removed with a `key`.

Both of those are workarounds. This is a declaration.

## What I Learned

A computed is lazy and cached: four reads, one evaluation. Cached globally
rather than per component, which `useMemo` is not.

Writing a signal inside a computed throws, and that constraint is what makes a
computed safe to read from anywhere.

A computed notifies when its **value** changes, not when a dependency does. So
`count` 2 → 4 stops at `isEven` and nothing downstream re-runs. React has no
equivalent — a memo's consumers re-render with their component regardless.

That is why splitting a derivation into named stages is free here and a
liability in React, where each stage is another dependency array.

`untracked` reads without depending, which deliberately produces a stale value
— useful, and the same failure mode as a wrong dependency array if overused.

An effect may write signals; a computed may not. One guardrail is the
framework's, the other is mine.

`linkedSignal` is a writable value that resets when its source changes, which
is a declaration where React needs a `useEffect` or a `key`.

## Verification

```text
npm run typecheck   ->  tsc -b --force, 0 errors
npm run build       ->  143.32 kB raw, 42.52 kB transfer
```

Every claim driven through jsdom:

```text
effect        : title "Reading List (7)" -> "(2/7)" on a query -> back to "(7)"
1 lazy/cached : 3 extra reads, run count unchanged; a+1 -> 2
2 value equal : +2 does not re-run the effect; +1 does
3 untracked   : the untracked change left readsOne stale, as designed
4 linkedSignal: written by hand, then reset by the source change

log:
    effect: isEven is now true
    effect: product is 1
    read product three times: 1, 1, 1
    a is now 2
    effect: product is 2
    count is now 2 (isEven true)
    count is now 3 (isEven false)
    effect: isEven is now false
    ignored changed -> readsOne still: tracked + ignored
    tracked changed -> readsOne recomputed: TRACKED + IGNORED
    selected set by hand: finished
    options changed -> selected reset to: abandoned

problems      : none
```

The log line `count is now 2 (isEven true)` with **no** following
`effect: isEven` line is the value-equality claim in one line: the count moved,
the derived value did not, and the effect stayed quiet.

The probe also caught two of my own strings reading "has run 1 times". Fixed.

## Day 46 Outcome

The reading list with four signals and six named computeds — the filter,
search and sort split into three cached stages — and exactly one effect, for
the document title, which is the only thing on the page outside the reactive
graph.

Plus a lab that demonstrates rather than asserts: a computed evaluating once
across four reads, a derived value stopping propagation when it does not
change, `untracked` producing a deliberate stale read, and `linkedSignal`
resetting a selection that was set by hand.

Day 47 moves the state out of the component entirely: a service, provided at
the right scope and consumed with `inject()`.
