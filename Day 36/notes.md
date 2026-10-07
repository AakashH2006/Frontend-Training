# Day 36 - Client-side routing

## Topics Covered

- `BrowserRouter` against `HashRouter`, and what each needs from the server
- `Routes` and `Route`, a layout route and `<Outlet />`
- An `index` route
- `Link` against `<a href>`
- `NavLink`, `end`, and `aria-current`
- Route parameters and `useParams`
- `useNavigate`, and navigating in a handler
- `<Navigate replace>` for a redirect
- A wildcard route, and what happens without one
- `useSearchParams`: putting the query in the URL

## Practical Work

Day 35's single page, as five routes.

```text
src/App.tsx                 the route table
src/routes/Layout.tsx       header, nav, footer, <Outlet />
src/routes/SearchRoute.tsx  "/"        - query in the URL
src/routes/ListRoute.tsx    "/list"
src/routes/AddRoute.tsx     "/add"
src/routes/BookRoute.tsx    "/book/:id"
src/routes/NotFound.tsx     "*"
```

```tsx
<BrowserRouter>
    <ListProvider>
        <Routes>
            <Route element={<Layout />}>
                <Route index element={<SearchRoute />} />
                <Route path="list" element={<ListRoute />} />
                <Route path="add" element={<AddRoute />} />
                <Route path="book/:id" element={<BookRoute />} />
                <Route path="books" element={<Navigate to="/list" replace />} />
                <Route path="*" element={<NotFound />} />
            </Route>
        </Routes>
    </ListProvider>
</BrowserRouter>
```

The whole shape of the app in one readable block — which is the thing routing
gives that a single page did not.

## The Provider Goes Outside The Routes

```tsx
<BrowserRouter>
    <ListProvider>
        <Routes>
```

Inside a route, the provider would unmount on every navigation, the state would
be re-read from storage each time, and anything not persisted would be lost.
Outside, the list survives navigation.

Same reasoning puts the header in a **layout route**: the shell renders once and
is not remounted, so the storage notice and the offline warning do not flicker
when the route changes.

## The URL Is State

The best thing in the day, and it closes the last item on Week 7's list of
known limitations — "search state is lost on navigation, because it lives in a
hook in one component".

```tsx
const [searchParams, setSearchParams] = useSearchParams();
const query = searchParams.get("q") ?? "";
```

Four things came free:

- navigating to the list and back keeps the results
- the back button steps through searches
- a search is a shareable link
- a reload re-runs the same search

None of them needed code. They are what the URL already does, and Week 7 was
keeping the query somewhere that threw them away.

```text
after submit   : url = /?q=dune
to /list       : url = /list
back           : url = /?q=dune
query restored : "dune"
status         : Showing 1 of 1 results.
```

That last line is the part I did not expect to be free: coming back re-runs the
fetch, because `query` changed from `""` to `"dune"` and the Day 33 effect
depends on it. The URL became the input to a state machine that was already
there.

And a deep link works:

```text
=== /?q=beloved ===
input value : "beloved"
status      : Showing 1 of 1 results.
```

### Two pieces of state, still

The input keeps its own state. A URL that updates per keystroke fills the
history with twenty entries for one search and makes the back button useless.
So `text` is local and `query` is in the URL, and the split is the same one from
Day 33 with a different home for the second half.

That needs one effect:

```tsx
useEffect(() => { setText(query); }, [query]);
```

When the URL changes from *outside* the component — back button, pasted link,
reload — the input has to catch up. That is synchronising with something
outside React in the Day 33 sense, because the history stack genuinely is
outside React.

The alternative I considered and rejected: a `key` on the input keyed by
`query`. It resets correctly and it also steals focus mid-typing.

### What I did not put in the URL

The list's `filter` and `sort` stay in the reducer. They could go in the URL and
there is a real argument for it — a filtered list would be shareable too.

I left them because they would then exist in two places: the URL and the
reducer, with the reducer's copy needing to follow the URL. One source of truth
per fact, and for these the reducer is the one that already has the selectors
attached. Noted as a trade rather than a conclusion.

## Link, not an anchor

```tsx
<Link to={`/book/${book.id}`}>{book.title}</Link>
```

An `<a href>` does a full page load: the in-memory state is lost and the whole
bundle is refetched. `Link` pushes onto the history stack and re-renders.

`NavLink` is `Link` plus knowing whether it is active:

```tsx
<NavLink to="/" end className={({ isActive }) => ...}>
```

**`end` matters.** Without it, `/` is considered active on every route, because
every path starts with `/`. With it, only an exact match counts.

And `NavLink` sets `aria-current="page"` on the active link itself, which is why
the stylesheet hangs off the attribute:

```css
.nav__link[aria-current="page"] { background-color: var(--color-brand); }
```

One source of truth for "this is the current page" — announced *and* visible,
and they cannot disagree. Same reasoning as `aria-pressed` on the filters in
Week 6.

## Route Parameters

```tsx
const { id } = useParams();
const book = id === undefined ? undefined : state.list.byId[id];
```

`useParams()` returns `Record<string, string | undefined>`. The `id` is
`string | undefined` even though the route pattern guarantees it is there,
because the types cannot know which route rendered this component.

So there are **two** nullable steps in that lookup, and both are real:

1. `id` may be undefined (the types cannot prove the route matched).
2. `byId[id]` may be undefined — the state is normalised and
   `noUncheckedIndexedAccess` is on.

The second is not pedantry. Somebody edits the address bar, or follows a link to
a book they have since removed:

```text
=== /book/DOESNOTEXIST ===
heading : Book not found
message : Nothing on your list has the id "DOESNOTEXIST". It may have been removed.
```

That is not an error page. It is a specific, explainable state — the same
distinction Day 18 drew between "empty" and "failed".

## Navigating In A Handler

```tsx
onSubmit={(draft) => {
    dispatch(bookAdded(draft));
    void navigate("/list");
}}
```

Navigation caused by a submit belongs in the submit handler. The alternatives —
a `<Navigate>` element rendered conditionally, or an effect watching the list
length — are both Day 34's mistake of treating an event as a state change.

Same on the detail route's Remove: the thing this route is about no longer
exists, so it navigates away. Staying would render the not-found panel, which is
correct and reads like an error rather than a completed action.

```text
after remove : url = /list | heading: Your list
```

## The Wildcard

```tsx
<Route path="*" element={<NotFound />} />
```

Without it, an unmatched path renders **nothing** — no error, no message, just
the shell with an empty `<main>`. That is the worst failure mode available,
because it looks like a loading state that never finishes.

```text
=== /nonsense === heading: Page not found
```

And a redirect for a path people will guess:

```tsx
<Route path="books" element={<Navigate to="/list" replace />} />
```

`replace` keeps it out of the history, so Back does not bounce straight back
here again.

```text
=== /books === url = /list
```

## BrowserRouter and the deployment problem

`BrowserRouter` uses the real URL and the History API. The server has to serve
`index.html` for **every** path, because `/list` is not a file.

In dev, Vite does that automatically. On a static host it is one rewrite rule,
and getting it wrong is exactly why a deployed SPA works until somebody
refreshes on a sub-route and gets a 404. That is Day 39's problem, and it is
worth knowing the cause now rather than discovering it during a deploy.

`HashRouter` (`/#/list`) needs no server configuration at all — the fragment
never reaches the server. Uglier URLs, and the fallback when rewrites are not
available.

## What I Learned

The URL is state, and it is better state than `useState` for anything a user
might want to share, bookmark or go back to. Four behaviours came free.

A query in the URL should change on submit, not per keystroke, or the history
becomes unusable.

A layout route renders the shell once, so shared UI does not remount on
navigation. The provider goes outside the routes for the same reason.

`end` on a `NavLink` to `/` is required, or it is active everywhere.

`NavLink` sets `aria-current` itself, so styling from that attribute keeps the
visible and announced states in sync.

`useParams` gives `string | undefined`, and a route parameter can name
something that does not exist. Both checks are real.

Navigation caused by an event belongs in the handler, not in an effect or a
conditional `<Navigate>`.

Without a wildcard route, an unknown path renders silence.

`BrowserRouter` needs a server rewrite; `HashRouter` does not. That choice is a
deployment decision made at the top of `App.tsx`.

## Verification

```text
npm run typecheck   ->  0 errors
npm run build       ->  clean
```

Driven through jsdom, with real clicks on `Link`s and `window.history.back()`:

```text
nav links      : Search | Your list (0) | Add by hand
active link    : Search
index route    : Search Open Library
skip link      : Skip to the main content -> #main

after submit   : url = /?q=dune   | Showing 1 of 1 results.
saved          : Book for dune
to /list       : url = /list      | active link: Your list (1)
row is a link  : /book/OLDUNE
back           : url = /?q=dune   | query restored: "dune" | results re-fetched
book route     : url = /book/OLDUNE | fields: Authors, First published, Added, Note
edit panel     : Book for dune | Editing "Book for dune"
after remove   : url = /list

/book/DOESNOTEXIST -> "Book not found"
/nonsense          -> "Page not found"
/books             -> redirected to /list
/?q=beloved        -> input "beloved", results loaded
problems       : none
```

The nav count going from `Your list (0)` to `Your list (1)` without a remount is
the layout route working — the header is reading context that lives above the
`<Routes>`.

## Day 36 Outcome

Five routes behind a layout route: an index search route whose query lives in the
URL, a list, an add form that navigates on success, a detail route driven by a
route parameter that handles a missing id as its own state, a redirect, and a
wildcard. `NavLink` marks the current route with `aria-current`, a skip link is
first in the tab order, and the provider sits outside the routes so the list
survives navigation.

Searches are now shareable, bookmarkable and reachable with the back button,
which was Week 7's last open limitation.

Day 37 is the first tests in this repo — Vitest and React Testing Library over
the reducer, the selectors and two or three user-visible behaviours.
