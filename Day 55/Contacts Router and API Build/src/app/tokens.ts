/* Day 52 - the tokens, now describing a server rather than a storage key.

   Day 47's lesson was that a token makes configuration injectable rather than
   imported: the default lives here, the application overrides it, and nothing
   that consumes it knows which it got. Today that stops being a demonstration
   and becomes the thing I actually need, because two of these three values are
   different in a test, in a probe and in a real deployment.

   `STORAGE_KEY` has gone, with `storage.service.ts`. The client does not
   persist anything any more - the server does - so the key belongs to the
   server and is below. */

import { InjectionToken } from '@angular/core';

/* Where the API lives, as a prefix rather than a full URL.

   Relative, so the app works on whatever origin it is served from - Day 39's
   base-path problem, avoided rather than solved. An absolute
   'http://localhost:3000' here would be a value that has to change for every
   environment, which is exactly what Day 59 will have to deal with for real. */
export const API_BASE = new InjectionToken<string>('api base path', {
    providedIn: 'root',
    factory: () => '/api'
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
    factory: () => 'day55.server'
});

/* Kept from Day 47 for the same reason it was kept on Day 50: it is the
   demonstration that an application can override a token's default, and
   app.config.ts still does. */
export interface ListOptions {
    readonly seedWhenEmpty: boolean;
    readonly maxBooks: number;
}

export const LIST_OPTIONS = new InjectionToken<ListOptions>('contacts options', {
    providedIn: 'root',
    factory: () => ({ seedWhenEmpty: true, maxBooks: 100 })
});
