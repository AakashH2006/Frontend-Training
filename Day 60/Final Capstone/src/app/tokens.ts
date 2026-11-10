/* Day 52 - the tokens, now describing a server rather than a storage key.

   Day 47's lesson was that a token makes configuration injectable rather than
   imported: the default lives here, the application overrides it, and nothing
   that consumes it knows which it got. Today that stops being a demonstration
   and becomes the thing I actually need, because two of these three values are
   different in a test, in a probe and in a real deployment.

   `STORAGE_KEY` has gone, with `storage.service.ts`. The client does not
   persist anything any more - the server does - so the key belongs to the
   server and is below. */

import { InjectionToken, inject } from '@angular/core';
import { PlatformLocation } from '@angular/common';

/* Where the API lives, as a prefix rather than a full URL.

   Relative, so the app works on whatever origin it is served from - Day 39's
   base-path problem, avoided rather than solved. An absolute
   'http://localhost:3000' here would be a value that has to change for every
   environment, which is exactly what Day 59 will have to deal with for real.

   DAY 59, dealing with it for real. `/api` is not relative. It is
   root-absolute, which is a different thing and the difference is invisible
   until the app is served from somewhere other than the root of a domain:

       served at /                      asset at /api/contacts.json       OK
       served at /Frontend-Training/    asset at /api/contacts.json       404

   Nine days of this project's HTTP work, every spec, every probe and every
   `ng serve` ran at the root, so the string `/api` was indistinguishable from
   a correct answer. GitHub Pages serves a project site from /<repo>/, and that
   is where it stops being one: the requests the fake server answers itself are
   fine, because it matches on the path and never reaches the network, but the
   two that fall through to a STATIC FILE - the seed data for the contacts and
   the directory - ask the host for a path that does not exist there.

   I guessed wrong about what that looks like. I wrote, before measuring, that
   the list would come up empty with no error, because an empty seed is a valid
   seed. The probe says otherwise: `withRows` seeds with `switchMap`, so the
   404 is an error IN THE PIPELINE OF THE REQUEST THAT TRIGGERED IT, and the
   list renders its failure state - "The contacts could not be loaded" - with
   a 404 for `/api/contacts?sort=added&page=1` in the HTTP log. The log is
   lying in a useful way: it records the URL the app asked for, which the
   fake server would have answered, not the static file the seed fell through
   to. A 404 against an endpoint the app itself implements is exactly the
   contradiction that makes this bug hard to read in production, and it is
   luckier than my guess - a visible error beats a page that looks empty.

   So the base is derived from the document's `<base href>`, which is the same
   value the router uses to decide what a URL means and the one thing on the
   page that already knows where the app is deployed. `ng build --base-href`
   writes it; nothing in the app has to be rebuilt per environment. */
export const API_BASE = new InjectionToken<string>('api base path', {
    providedIn: 'root',
    /* `PlatformLocation.getBaseHrefFromDOM()` rather than reading `<base>`
       by hand or using `document.baseURI`.

       `getBaseHrefFromDOM` is what `PathLocationStrategy` itself calls, so the
       API path and the router's idea of the base cannot disagree - and they
       MUST not, or a deep link would route correctly while fetching from the
       wrong place. `document.baseURI` would have been the obvious alternative
       and is wrong for this: it is absolute, so it would turn every request
       into a cross-origin-looking URL in tests, and it falls back to the
       document's own URL when there is no `<base>` - which means it would
       return `/contacts/c1` on a detail page and build `/contacts/c1/api`. */
    factory: () => apiBase(inject(PlatformLocation).getBaseHrefFromDOM())
});

/* Exported and pure, because it is a string function with exactly the kind of
   edge cases that are easier to assert than to reason about. */
export function apiBase(baseHref: string): string {
    /* An empty string is what `getBaseHrefFromDOM` returns when there is no
       `<base>` tag at all, which is every TestBed in this project. */
    const base = baseHref.trim();
    if (base === '' || base === '/') return '/api';

    /* An absolute base href is legal - `<base href="https://example.com/app/">`
       - and taking its path is what keeps the request same-origin. */
    const path = base.startsWith('http') ? new URL(base).pathname : base;

    return `${path.replace(/\/+$/, '')}/api`;
}

/* Day 60: how long one answer to GET /api/tags is reused.

   Much longer than `RECORD_CACHE_MS`, and for a reason that is about the data
   rather than about caching. A record is read on a screen that polls it, so a
   stale one is visible for as long as the window lasts. The tag list is read
   by the form's datalist, where staleness means one suggestion missing from a
   list that is only ever a suggestion - and every write invalidates it
   anyway, so the only way to see a stale list is for somebody ELSE to have
   added a tag, which this app has no mechanism for at all.

   30 seconds is therefore "the length of a session of form-filling". The
   number is a token rather than a constant because the spec that proves the
   cache exists has to be able to turn it off - which is the same argument
   Day 58 made for the other two, and the reason all three are here. */
export const TAGS_CACHE_MS = new InjectionToken<number>('tags cache window in ms', {
    providedIn: 'root',
    factory: () => 30_000
});

/* How slow the fake server is.

   This exists because a backend that answers instantly hides every mistake in
   the loading states: a spinner that is never seen is a spinner that is never
   tested. 120ms is enough for the UI to have to render "Loading" at least
   once, and the probe overrides it to 0 where it would only make the test
   slow. */
export const API_LATENCY = new InjectionToken<number>('fake api latency in ms', {
    providedIn: 'root',
    factory: () => 120
});

/* The key the FAKE SERVER keeps its rows under.

   Deliberately named after the server rather than the app, because the
   contents are not the client's data structure - they are whatever the server
   holds, including rows this client cannot parse. */
export const SERVER_STORE_KEY = new InjectionToken<string>('fake server store key', {
    providedIn: 'root',
    factory: () => 'day56.server'
});

/* Day 56: where the fake session keeps the signed-in name.

   Separate from the server's key, because they are different things owned by
   different sides: clearing the session must not clear the contacts, and a
   test that wants one of them fresh should not have to know about the other. */
export const SESSION_STORE_KEY = new InjectionToken<string>('session store key', {
    providedIn: 'root',
    factory: () => 'day56.session'
});

/* Day 56: how many times a failed GET is re-sent.

   A token rather than a constant because the right value is different in three
   places, which is the test Day 47 set for whether something deserves one:

     - the app wants 2, so a flaky connection recovers without the user noticing
     - a spec wants it set deliberately, and some specs want 0 so that one
       failure is one request
     - the probe wants 0, because a retry triples the time a failure takes to
       report and the probe is already the slowest thing here

   Default 2, meaning up to three attempts in all. */
/* Day 56, added while writing the spec rather than while writing the feature.

   The backoff base was `300` written into `retryInterceptor`, and the
   interceptor spec waits for real timers on purpose - so nineteen tests of
   retrying took 10.2s of a 14.2s suite. A token lets the spec ask for a 20ms
   base and keep real timers, which is the combination I wanted: the scheduler
   is still RxJS's rather than a fake clock, and the measured numbers are 2.6s
   for that file and 7.3s for the suite.

   And it belongs here on its own merits. A retry delay is configuration in
   exactly the sense Day 56 spent the morning pinning down: decided once, per
   environment, never by a person using the app. A slow network wants a longer
   one; a test wants a shorter one; neither is a signal. */
export const API_RETRY_DELAY = new InjectionToken<number>('http retry backoff base in ms', {
    providedIn: 'root',
    factory: () => 300
});

export const API_RETRIES = new InjectionToken<number>('http retry attempts', {
    providedIn: 'root',
    factory: () => 2
});

/* Kept from Day 47 for the same reason it was kept on Day 50: it is the
   demonstration that an application can override a token's default, and
   app.config.ts still does. */
export interface ListOptions {
    readonly seedWhenEmpty: boolean;
    readonly maxBooks: number;
}

/* Day 58: how often the detail page re-asks for its record.

   Day 53 wrote this as a `const POLL_MS = 1500` in the component with the
   comment "on Day 58 it would be a token so the page could be told", and that
   is exactly what it is for: the probe sets it to something long so that a
   poll does not fire in the middle of a measurement, and the specs set it to
   something that never fires at all.

   The number is also the constraint on the cache in `contacts.api.ts`. A
   response held for longer than this interval would be served back to the
   poll, which would turn the poll into a loop that re-reads its own cached
   answer - a thing that would look like the server never changing. The two
   values have to be chosen together, and they are both here so that it is
   possible to see that at a glance. */
export const DETAIL_POLL_MS = new InjectionToken<number>('detail poll interval', {
    providedIn: 'root',
    factory: () => 1500
});

/* Day 58: how long one record's response may be reused.

   The detail page asks for `GET /api/contacts/:id` twice per visit and always
   has: once from `contactTitleResolver`, which needs the name before the
   component exists, and once from the component, which needs the record. Two
   consumers of one fact, a few milliseconds apart, and neither can be deleted
   without losing something - the resolver is what puts the name in the tab
   before anything is on screen, and the component is what shows the record.

   So the request is shared instead. 1000ms is chosen against the poll above
   and not in isolation: it has to be long enough to cover the gap between the
   resolver resolving and the component subscribing (measured at 10ms), and
   SHORTER than `DETAIL_POLL_MS`, or the poll would be answered out of the
   cache and the page would stop updating while looking like it was working.

   0 turns it off, which is what the router specs do: a test about navigation
   should not depend on a cache, and the cache has its own tests. */
export const RECORD_CACHE_MS = new InjectionToken<number>('record cache window', {
    providedIn: 'root',
    factory: () => 1000
});

export const LIST_OPTIONS = new InjectionToken<ListOptions>('contacts options', {
    providedIn: 'root',
    factory: () => ({ seedWhenEmpty: true, maxBooks: 100 })
});
