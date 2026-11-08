# Day 51 - The Angular Router

## Topics Covered

- `provideRouter`, and the provider that does not wrap anything
- Routes as data rather than markup
- First-match-wins, and what it costs to get the order wrong
- Route parameters arriving as component **inputs**
- Query parameters as state, and the URL as an untrusted boundary
- `routerLink`, `routerLinkActive` and `aria-current`
- Programmatic navigation after a save
- The wildcard, and why a missing record is not a 404
- `loadComponent`, and reading the build output to tell whether it worked
- `TitleStrategy` as an injectable

## Practical Work

Day 50's single screen, split into routes. No new features and no new domain
logic — the services, the form and the card are the same files — but the shape
of the app changed more than any day since Week 7's context.

```text
src/app/routes.ts                      the route table, 7 entries
src/app/app.ts/.html                   the shell: header, nav, outlet, footer
src/app/title-strategy.ts              a TitleStrategy of my own
src/app/pages/contacts-page.ts/.html   the list, with the toolbar in the URL
src/app/pages/contact-detail-page.*    one contact, by id
src/app/pages/contact-form-page.*      add and edit, two routes, one component
src/app/pages/about-page.ts            the lazy route
src/app/pages/not-found-page.ts        the wildcard
```

The `pages/` folder is new. Everything in `src/app` has been flat since Day 41
and that stopped being useful today: a routed component and a reusable one are
different kinds of thing, and the difference is worth a directory. The rule I
wrote for myself: **a page is addressable and a component is not.**

```text
Day 50   App (111 lines of template, 4 handlers, 1 signal)
Day 51   App (no state at all) + 5 pages
```

## The Provider Does Not Wrap Anything

Day 36's first note about React Router was that `<BrowserRouter>` has to go
*outside* the routes, so the top of the app becomes a component whose job is
configuration.

```tsx
<BrowserRouter><Routes><Route ... /></Routes></BrowserRouter>
```

Angular has no equivalent component:

```ts
providers: [provideRouter(routes, withComponentInputBinding())]
```

The route table is data passed to a provider, and `<router-outlet>` is a
directive in whatever template wants one. Nothing wraps anything. It is the
same difference as Week 7's `<Provider>` versus `providedIn: 'root'`, and after
three frameworks I find Angular's version easier to reason about: there is no
tree position to get wrong.

The features are composable `with...()` calls rather than one options object,
which is how the unused ones stay out of the bundle — the same shape as
`provideHttpClient(withFetch())` tomorrow.

## Routes Are Data

React Router's routes are elements, so they live in a component and can be
composed with whatever is in scope. Angular's are an exported array.

The practical difference showed up immediately: the About page lists the route
table by importing it.

```ts
protected readonly paths = routes.map((route) => `/${route.path ?? ''}`);
```

```text
route list : / /contacts /contacts/new /contacts/:id /contacts/:id/edit /about /**
```

That is not possible with a tree of `<Route>` elements without rendering them.
It also means routes can be unit-tested as a value, which Day 54 will use.

The nav is **not** built from that array, and deciding that took a minute.
`/contacts/:id` is a route and is not a destination without an id; `**` is a
route that must never appear in a nav. So the nav is its own three-entry list.
Day 20's rule is about duplicating the same fact — a nav and a route table
overlap without being the same fact.

## First-Match-Wins, Measured

React Router v6 ranks routes by specificity, so `/contacts/new` beats
`/contacts/:id` whatever order they are written in. Angular walks the array and
takes the first path that matches, so **order is the specificity**.

I believed that and wanted to see it, so I moved one line and rebuilt:

```ts
{ path: 'contacts/:id',  component: ContactDetailPage },
{ path: 'contacts/new',  component: ContactFormPage },   // now unreachable
```

```text
url     : /contacts/new
page    : No such contact
message : Nothing in this list has the id new. It may have been removed since the link was made.
title   : Contact | Day 51 | Routing and Navigation
```

No error, no warning, and a perfectly sensible-looking page about a contact
called "new". This is the failure mode I would least like to debug from a bug
report, and the reason the static segment now has a comment above it saying
what it is doing there.

The same reasoning puts `**` last: it matches everything, so anything below it
is dead. React Router sorts the splat down for you; here it is my job.

## Route Parameters Arrive As Inputs

The thing I did not expect from today. `withComponentInputBinding()` makes the
router set a component's **inputs** from the route — path parameters, query
parameters and route data, matched by name.

```ts
export class ContactDetailPage {
    readonly id = input.required<string>();
}
```

`useParams()` returns `string | undefined` whatever the route says, so every
React page starts by handling a case the router has already ruled out.
`input.required` is the stronger claim and it is a true one: the route cannot
match without the segment.

What it is really worth is testability. Without it, a page starts like this:

```ts
private readonly route = inject(ActivatedRoute);
readonly id = toSignal(this.route.paramMap.pipe(map((p) => p.get('id') ?? '')));
```

...and cannot be rendered without a router at all. With it, a page is a
component with inputs, and the router is merely one of the things that can set
them. A test is another, which is Day 54.

It is opt-in for backwards compatibility. I would turn it on in any new app.

## The URL Is State

Day 36's rule, and this is the first app I have built where it paid for itself
twice over.

```text
/contacts?q=maths&filter=work
```

- the search box, the group filter and the sort order are query parameters
- so a filtered list is a link, and a tag on the detail page is a link to the
  list filtered by that tag
- so a reload reproduces the view exactly

```text
tag link   : analytical engine -> /contacts?q=analytical%20engine
deep link  : /contacts?q=maths&filter=work
  shows    : Ada Lovelace | Showing 1 of 3.
  search box: maths
  filter on : Work
```

The last two lines are the test that matters: the input's value and the pressed
filter button come back from the URL on a cold load, because the URL is
upstream of them both.

### One direction only

The service still owns `query`, `filter` and `sort`, because the three cached
computeds behind them are worth keeping. What changed is that **the URL is the
only thing that writes them**:

```ts
effect(() => {
    const query = this.q() ?? '';
    /* ... */
    untracked(() => { this.contacts.setQuery(query); /* ... */ });
});
```

The toolbar navigates; the router sets the inputs; this effect copies them in.
Nothing else calls `setQuery`. It is a cache of the URL with exactly one
writer, which is the only version of duplicated state I have been able to
defend so far.

An effect is right here for Day 33's reason — the thing on the other side is
outside the signal graph, and the URL is as outside as `document.title` was.
The `untracked` is mine, not the framework's: Angular permits writing signals
from an effect (Day 46).

### Three details that are easy to get wrong

**The inputs are `string | undefined`.** A parameter that is not in the URL has
no value, so `input<string>('all')` would be a lie the first time somebody
deletes it from the address bar.

**The default of a parameter is its absence.** Every handler passes `null` for
the default value, because `?filter=all&sort=added` and `/contacts` are the
same list and only one of them should be the link people copy. A `null` removes
the key; an empty string leaves `?q=` sitting there.

**Typing replaces rather than pushes.** Without `replaceUrl: true`, typing
"ada" leaves three history entries and the back button walks the user through
their own typing. Same mistake, same fix as React Router's `replace`.

### The URL is a boundary

The values are whatever is in the address bar, which is to say user-supplied:

```text
/contacts?filter=javascript:alert(1)&sort=nonsense
->  3 cards | filter=All
```

So the query string gets the same treatment Week 5 gave storage — a guard and a
fallback. `isFilter` and `isSort` from `domain.ts` are the same two functions
`storage.service.ts` uses on data it reads back off disk, which is a nice
demonstration that "parse, don't validate" is about where data comes from
rather than what it came through.

## The State That Stopped Existing

The best thing the router did today, and it is a deletion.

Day 50 held "which contact is being edited" in a signal, set by a click
handler, cleared in four places, and the cause of the week's last bug: the form
stayed in edit mode after a successful save, because the parent's signal and
the form's own copy disagreed.

It is now a path segment:

```text
contacts/new        add
contacts/:id/edit   edit
```

So it survives a reload, it is linkable, and **it cannot get out of step with
the form**, because leaving the route destroys the component. There is no copy
to disagree with: navigating away ends the component's life and arriving
creates a new one.

```text
edit by URL : /contacts/34e103bc.../edit | Editing Alan Turing
  prefilled : Alan Turing | alan@example.com | maths, logic
  saved ->  : /contacts/34e103bc...
  note      : Broke Enigma.
  form gone : yes (navigated away)
```

Day 50's bug is not fixed here — it is **not expressible**, which is the better
kind of fix and the first time routing has given me one.

### The one place it is harder

Filling the form moved from a click handler back into an effect, which reverses
Day 50's decision, so I wrote down why.

On Day 50, filling was caused by a click, and the handler was the honest place
for it. Here there is no click: the router constructs the component, and the
two things it needs — the contact (an input) and the form (a `viewChild`) —
arrive in an order I do not control. An effect is the only thing that runs when
both are present.

```ts
if (this.filledFor === contact.id) return;
this.filledFor = contact.id;
form.fillFrom(contact);
```

The guard is load-bearing: without it, every change to the contact refills the
form, *including the change caused by saving it*, which would throw away
anything typed since. Day 34's rule survives — this is not state synchronising
with state, it is a one-time view operation whose preconditions arrive
separately.

## Links, And The One Compromise

```text
link href : Add a contact -> /contacts/new
card link : Ada Lovelace -> /contacts/c1
```

`routerLink` renders a real `href` and intercepts the click, so middle-click,
"copy link address" and the status bar all work — Day 36's argument for `<Link>`
over an `onClick`, and the same conclusion.

`routerLinkActive` is a directive that adds a class while its link matches:

```html
<a [routerLink]="item.link"
   routerLinkActive="nav__link--active"
   [routerLinkActiveOptions]="{ exact: item.exact }"
   #active="routerLinkActive"
   [attr.aria-current]="active.isActive ? 'page' : null">
```

React Router needs `<NavLink>` and a function returning a className; this is an
attribute on an ordinary link. `exact` matters on `/contacts`, which is
otherwise a prefix of `/contacts/new` and stays highlighted — exactly what
NavLink's `end` prop is for.

Exporting the directive as `#active` to read `isActive` is how `aria-current`
gets set, because a class alone tells a screen reader nothing. Day 38's rule
that colour is never the only signal, in its routing form.

### The compromise

`ContactCard` now imports `RouterLink`, which I argued against on Day 48.

What I settled on: the card is coupled to the **router**, not to this app's
**route table**, because the target is an input.

```ts
readonly detailLink = input<(string | number)[] | null>(null);
```

The alternative is a fourth output and a parent that navigates, which keeps
`@angular/router` out of the card and turns a link back into a click handler.
That trade is worth it for an action and not for a title. `null` renders plain
text, so the card still works with no router at all — which is how Day 54 will
render it in a test.

## A Missing Record Is Not A 404

```text
bad id    : No such contact          (/contacts/does-not-exist)
bad route : That page does not exist (/nonsense)
```

Two different failures that a lot of apps show the same page for. The route
matched perfectly in the first case — the shape was right and the record is
missing, and the thing to do about it is different. Day 18's "empty and broken
are different states", arriving in routing.

Both pages have a link out. A dead end with no way back is the part people
actually complain about.

And the 404 is still a rendered route, not an HTTP status: the server returned
200 and `index.html`. Day 39's SPA refresh problem is the same shape in
Angular, and Day 59 will have to configure it again.

## Titles Are A Service

`title` on a route is applied by a `TitleStrategy`, and the default sets
`document.title` to exactly the route's title. Overriding it is a provider:

```ts
{ provide: TitleStrategy, useClass: SuffixTitleStrategy }
```

```text
/contacts          -> Contacts | Day 51 | Routing and Navigation
/about             -> About this build | Day 51 | Routing and Navigation
/nonsense          -> Page not found | Day 51 | Routing and Navigation
```

Day 38 did this in React with an effect in every page. Here no page mentions
its own title at all — the route declares it and an injectable applies it,
which is Day 47's lesson showing up in a part of the framework I did not expect
to be swappable.

`buildTitle` walks the activated route tree and returns the deepest title,
which is what makes a child's title win over its parent's.

## What The Probe Cannot Do

jsdom has no module loader, and today's build is the first one that needs one:
`main.js` is 3.44 kB that imports a 322 kB chunk, and the About route reaches
its component through `import()`.

So the probe now re-bundles the built output into one script with esbuild — the
same esbuild the Angular build uses — and evaluates that. The code being driven
is still the compiled, optimised output rather than the source, but the lazy
chunk is inlined, so **a probe cannot show that it was fetched separately.**

That claim comes from the build output and from reading the chunks:

```text
chunk-HMJHA7LN.js: 1.1 kB   | lazy    | holds AboutPage
chunk-RJRXUG2S.js: 314.9 kB | initial
main-VRJGHT6U.js : 3.4 kB   | initial
AboutPage in     : 1 file(s): chunk-HMJHA7LN.js
up front?        : no
```

The search string is a sentence from the About template rather than its route
title, which was my first attempt and found the string in both files — the
title lives in `routes.ts`, which is eagerly loaded. A test that passes for the
wrong reason, caught by being surprised at the answer.

## What I Learned

Angular's router is configured by a provider and rendered by a directive, so
nothing has to wrap anything.

Routes are data, which makes them readable, testable and listable. A nav is a
different fact from a route table and should be written separately.

Matching is first-match-wins. Getting the order wrong produces a plausible
wrong page and no warning at all.

`withComponentInputBinding()` turns route parameters, query parameters and
route data into inputs, which is the difference between a page that needs a
router and a component that happens to be routed.

A query parameter that is absent has no value, and the default of a parameter
should be its absence rather than a value spelled out in the URL.

The URL is an untrusted boundary and deserves the guards the storage layer has.

Moving a piece of state into the URL can make a whole class of bug
inexpressible rather than fixed.

An effect is justified when the preconditions for a one-time view operation
arrive separately and in an order you do not control — and it needs a guard so
it stays one-time.

`routerLink` gives a real href; a click handler does not. Worth importing the
router into a presentational component for a title, not for an action.

A missing record and a missing route are different failures and deserve
different pages.

`TitleStrategy` is injectable, so route titles need no code in any page.

## Verification

```text
npm run typecheck   ->  tsc -b --force, 0 errors
npm run build       ->  initial 334.49 kB raw, 87.29 kB transfer
                        lazy    about-page 1.15 kB raw, 622 B transfer
```

The router's cost, measured on the same machine with the same toolchain — Day
50's app built from this folder before any of today's changes:

```text
Day 50  main 222.57 kB raw | 60.43 kB transfer
Day 51  main + chunk 325.85 kB raw | 85.46 kB transfer      (+103 kB / +25 kB)
```

Twenty-five kilobytes over the wire for routing, which is a real number to have
and more than I would have guessed.

Fifteen scenarios through jsdom, across ten page loads sharing one
`localStorage`:

```text
loaded /        : /contacts                        (the '' redirect)
title           : Contacts | Day 51 | Routing and Navigation
nav active      : Contacts
aria-current    : Contacts
cards           : Katherine Johnson, Grace Hopper, Ada Lovelace
link href       : Add a contact -> /contacts/new

card link       : Ada Lovelace -> /contacts/c1
after click     : /contacts/c1
title now       : Contact | Day 51 | Routing and Navigation
detail heading  : Ada Lovelace
tag link        : analytical engine -> /contacts?q=analytical%20engine
after tag       : /contacts?q=analytical%20engine | Ada Lovelace

typed hopper    : /contacts?q=hopper | Grace Hopper
no match        : /contacts?q=nobody | No contact matches that search.
cleared         : /contacts | 3 cards

deep link       : /contacts?q=maths&filter=work
  shows         : Ada Lovelace | Showing 1 of 3.
  search box    : maths
  filter on     : Work
junk params     : 3 cards | filter=All

/contacts/new   : Add a contact
  cancel says   : Back to the list
  no-such?      : no
after add       : /contacts/34e103bc-3ab4-4114-99a4-0bc62f9816a3
  heading       : Alan Turing
  notice        : Added Alan Turing.

edit by URL     : /contacts/34e103bc.../edit | Editing Alan Turing
  prefilled     : Alan Turing | alan@example.com | maths, logic
  cancel says   : Cancel
  saved ->      : /contacts/34e103bc...
  note          : Broke Enigma.
  form gone     : yes (navigated away)

bad id          : No such contact
bad route       : That page does not exist | way out: /contacts
/about          : About this build
  route list    : / /contacts /contacts/new /contacts/:id /contacts/:id/edit /about /**

problems        : none
```

Plus the route-order experiment above, run against its own build and reverted.

Three things the probe corrected today:

1. The chunk check found "About this build" in the main chunk, because I had
   searched for the route's **title** rather than anything from its template.
2. The first card in the list has no tags, so the tag-link scenario was reading
   `null` — the seed data's deliberately empty record, doing its job.
3. `Showing 1 of 3` on a deep link, which is correct and which I had to read
   twice: the filter narrows what is shown and `total()` is the whole list.

## Day 51 Outcome

Seven routes over the same services and the same form: a list whose toolbar
lives in the query string, a detail page addressed by id, one component serving
both `contacts/new` and `contacts/:id/edit`, a lazy About page in its own
1.1 kB chunk, a wildcard page, and route titles applied by an injectable of my
own.

Day 50's `editingId` signal is gone, and with it the bug that signal caused.

Known wart, for Day 57: the detail route's title is the static string
"Contact", so `/contacts/does-not-exist` is titled "Contact" too. Making it the
record's name needs a resolved title, which is the same machinery as a
resolver — Day 56.

Day 52 is `HttpClient`: typed requests, an interceptor, and what the loading and
error states have to look like once the data is not simply there.
