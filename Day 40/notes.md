# Day 40 - React mini-capstone review

## Topics Covered

- Reviewing my own diff across a whole week
- Extracting the route table, and the coverage gap it had hidden
- What a duplicated source of truth costs, measured
- A release tag and what it points at
- Writing an architecture summary that is useful six weeks later

## Practical Work

The review day. One real refactor, one new test, and the Week 8 README.

```text
src/routes/AppRoutes.tsx   new - the route table, extracted
src/App.tsx                now three decisions and nothing else
src/routes/*.test.tsx      both import the real table
Day 40/README.md           the Week 8 write-up
```

```text
84 tests (up from 83)
2,751 lines of app source across 33 files
1,286 lines of tests
```

## The Refactor

I left a note in the tests on Day 37:

> The route table, repeated here rather than imported from App. That is a real
> duplication and I thought about it: importing App would pull in
> BrowserRouter, which reads the actual URL and cannot be pointed at a route.
> The alternative is extracting the `<Routes>` into its own component — which
> is tidier and is what Day 40 does.

So the routes are now in `AppRoutes.tsx`, `App` provides the router, and the
tests render `AppRoutes` under a `MemoryRouter`.

```tsx
export function App() {
    return (
        <BrowserRouter basename={import.meta.env.BASE_URL}>
            <ListProvider>
                <AppRoutes />
            </ListProvider>
        </BrowserRouter>
    );
}
```

`App` is down to three decisions: which router, where the provider goes, and
what the base path is. Everything else it used to hold was a list.

### The duplication had already cost something

This is the part worth recording. The copied table in the tests **never had the
`/books` redirect**. It was added to `App` on Day 36, tested by hand through
jsdom that day, and then had **no automated coverage at all** for four days —
because the thing the tests exercised was a different route table that happened
to look similar.

One route added to the real table, and it appeared in the tests for free:

```tsx
it("redirects /books to /list", () => {
    renderAt("/books");
    expect(heading("Your list")).toBeInTheDocument();
});
```

84 tests instead of 83, and the new one passed first time — which is the
correct outcome and also exactly why the gap was invisible. The redirect was
never broken. It was just never checked, and nothing would have told me if a
later edit had broken it.

The general version: **a duplicated source of truth does not announce itself
when it drifts.** I had written the note on Day 37 and still half-expected the
extraction to be a tidiness exercise.

## Reviewing My Own Week

Reading the whole week's diff rather than each day's. Day 20 taught me that a
diff shows the set of decisions rather than the code, and over five days that
turned up things no single day would have:

**Three near-identical `renderAt` helpers.** Two test files had their own copy
of the setup, and after the extraction they are nearly identical again — same
`MemoryRouter`, same provider, same `userEvent.setup()`. Left as it is,
deliberately: a shared test helper in a fourth file would mean reading two
files to understand one test, and the two differ in their `beforeEach`. Noted
rather than fixed, because "two similar things" is not yet "a duplication".

**`src/data.ts` is almost empty now.** The `Book` type moved to the reducer on
Day 31, and what is left is `STATUSES`, `SORTS`, `FILTERS`, their labels and
three guards. The filename stopped describing the contents four days ago. It
should be `domain.ts`, and renaming it would touch nine imports for no
behavioural change — so it is in the README's limitations rather than done
quietly on the last day of the week.

**The author sort still orders by forename.** Flagged in Week 6's README,
flagged in Week 7's, still true. It sorts on `authors[0]`, which is a full
name. A surname sort needs a surname field, and splitting on the last space
breaks "Ursula K. Le Guin". This is the third week it has been written down and
not fixed, which is itself worth noticing: a known limitation that survives
three reviews is either not worth fixing or is being avoided. This one is the
former, and saying so is better than carrying it forward a fourth time.

**No dead code, no `any`, no suppressions.** The Day 38 sweep still holds, and
I re-ran it rather than assuming.

## The Release Tag

```bash
git switch -c feature/week08-react-capstone
# ... the week's commits ...
git push -u origin feature/week08-react-capstone
# PR opened, reviewed, merged
git switch main && git pull
git tag -a v2.0 -m "Week 8: React mini-capstone - routed, tested, deployed"
git push origin v2.0
```

`v2.0` rather than `v1.1`. `v1.0` was the Week 4 vanilla app; this is the same
product rebuilt on a different stack, which is a major version by any reading.

A tag names one commit and does not move — Day 20's lesson, and the reason the
annotated form matters: in six weeks the message is the only record of why that
commit was worth naming. And `git push` does not push tags, which I still have
to remember.

## The Architecture Summary

The README's job is to answer, six weeks from now, "why is it like this". So it
records the decisions rather than the file list:

- state in a reducer because handlers started updating two things at once
- normalised because an update to a missing id should be visible
- three contexts split by how often their values change
- search state in a hook because nothing outside the panel needs it
- the query in the URL because it should be shareable
- only the books persisted, because a three-day-old filter is worse than none

Each of those is a sentence that was a day's work, and none of them is
recoverable from the code alone. The file list is recoverable from the code, so
it gets less space.

## What I Learned

A duplicated source of truth does not tell you when it drifts. Mine had hidden
a route with no coverage for four days, and extracting it added a passing test
— which is the version of this that is easy to miss, because nothing was ever
broken.

Reviewing a week's diff at once finds different things from reviewing a day's:
duplication that grew gradually, filenames that stopped matching contents, and
limitations that have survived more than one review.

A limitation written down three weeks running is a decision, and it should be
stated as one rather than carried forward again.

"Two similar things" is not automatically a duplication. The two `renderAt`
helpers stay, because sharing them would make a test harder to read.

A major version is about the product, not the amount of code.

An architecture summary should record why, because the what is already in the
files.

## Verification

```text
npm run typecheck   ->  0 errors
npm test            ->  4 files, 84 tests, all passing
npm run build       ->  clean
```

```text
dist/index.html                  1.91 kB │ gzip:  0.94 kB
dist/assets/index-Uy-v5xRK.css   7.50 kB │ gzip:  1.97 kB
dist/assets/index-BwPT5gUz.js   25.31 kB │ gzip:  8.26 kB
dist/assets/vendor-Jqp1Qt4r.js 261.41 kB │ gzip: 83.14 kB
```

The app chunk moved by 0.03 kB after the refactor, which is what a pure
reorganisation should look like.

Re-ran the Day 38 sweep: no `any`, no `@ts-ignore`, no stray `console`, no
`outline: none`, no positive tabindex, every placeholder beside a real label.

## Day 40 Outcome

The React mini-capstone, finished: five routes behind a shared route table, 84
tests across pure logic, one component and the routes wired together, a
keyboard and screen-reader pass with announcements and focus management, a
production build with a configurable base path, and deployment config for three
hosts.

The week's one refactor removed a duplicated route table that had been hiding a
four-day coverage gap, and the review surfaced two limitations worth stating
plainly rather than carrying into Week 9.

That closes Month 2. Week 9 is Angular: the CLI, standalone components,
template binding and the modern control-flow syntax — the same reading list
again, on a framework with very different opinions.
