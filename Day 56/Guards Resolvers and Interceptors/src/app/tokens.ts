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

export const LIST_OPTIONS = new InjectionToken<ListOptions>('contacts options', {
    providedIn: 'root',
    factory: () => ({ seedWhenEmpty: true, maxBooks: 100 })
});
