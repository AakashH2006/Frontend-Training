/* Day 52, extended on Day 56 - the providers.

   `provideHttpClient()` follows the same pattern as `provideRouter()`: a
   provider function, and features as composable `with...()` calls.

   DAY 56 adds two interceptors to the array, and the whole of today's lesson
   about interceptors is in where they went rather than in what they do. The
   array is the pipeline; the positions are argued below. */

import { type ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { TitleStrategy, provideRouter, withComponentInputBinding } from '@angular/router';

import { fakeApiInterceptor } from './fake-api';
import { requestIdInterceptor, retryInterceptor } from './interceptors';
import { logInterceptor } from './http-log.service';
import { routes } from './routes';
import { SuffixTitleStrategy } from './title-strategy';
import { LIST_OPTIONS } from './tokens';

export const appConfig: ApplicationConfig = {
    providers: [
        provideBrowserGlobalErrorListeners(),

        provideRouter(routes, withComponentInputBinding()),
        { provide: TitleStrategy, useClass: SuffixTitleStrategy },

        provideHttpClient(
            /* `withFetch()` swaps the default XMLHttpRequest backend for
               `fetch`.

               XHR is still the default for backwards compatibility: it
               supports upload progress events, which `fetch` cannot report,
               and some code depends on that. Nothing here uploads anything,
               and `fetch` is the platform API with a future, so this is the
               choice I would make in a new app.

               It is not free: it moved the probe from "jsdom has XHR" to
               "jsdom has no fetch at all", so the probe now provides one. The
               notes have the detail - a framework feature that forces a change
               in the test harness is worth recording. */
            withFetch(),

            /* ORDER IS THE PIPELINE. A request walks DOWN this array and
               the response walks back UP it, so each position is an argument -
               and the arguments are weaker than I expected them to be, which
               is the honest summary of the day.

               requestIdInterceptor FIRST, and this one is load-bearing. The
               header has to be on the request before anything below it looks:
               the log prints it, and the retry re-sends a request that already
               carries it, so three attempts share one id. Move it to second
               and the log's id column goes permanently blank while everything
               else keeps working - which is how an ordering mistake in a chain
               survives review. There is a test for that empty column.

               logInterceptor SECOND, below the id and above the retry. I
               justified this position at length with a claim that turned out
               to be false - that a log below a retry would record each attempt
               separately. interceptors.spec.ts measures one entry either way,
               because an interceptor's body runs once per request however it
               is positioned; only a `defer` below the retry sees attempts. So
               the real reason it is here is the id above it, and the timing it
               gets is the same wherever it goes.

               retryInterceptor THIRD, directly above the backend, so what it
               resubscribes to is the request and nothing else is re-run.

               fakeApiInterceptor LAST, which is where a backend belongs: it
               either answers or calls `next` to reach the real network.

               The rule I would now state, having measured it: order decides
               what each interceptor SEES, not how often it runs. */
            withInterceptors([
                requestIdInterceptor,
                logInterceptor,
                retryInterceptor,
                fakeApiInterceptor
            ])
        ),

        { provide: LIST_OPTIONS, useValue: { seedWhenEmpty: true, maxBooks: 50 } }
    ]
};
