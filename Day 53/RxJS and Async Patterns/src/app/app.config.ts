/* Day 52 - the providers, with HttpClient in them.

   `provideHttpClient()` follows the same pattern as `provideRouter()`: a
   provider function, and features as composable `with...()` calls. The two
   features here are the whole of today's configuration. */

import { type ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { TitleStrategy, provideRouter, withComponentInputBinding } from '@angular/router';

import { fakeApiInterceptor } from './fake-api';
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

            /* ORDER IS THE PIPELINE. A request walks down this array and the
               response walks back up it, so:

                 - logInterceptor runs first on the way out, which means it
                   records the URL the app asked for rather than the rewritten
                   one, and it times everything below it - including the fake
                   backend's latency, which is the only reason the timings in
                   the UI are interesting
                 - fakeApiInterceptor runs last, which is where a backend
                   belongs: it either answers or calls `next` to reach the real
                   network

               Swapping them would still work and would log nothing for any
               request the fake answered, because an interceptor that returns
               its own response never passes the request down. */
            withInterceptors([logInterceptor, fakeApiInterceptor])
        ),

        { provide: LIST_OPTIONS, useValue: { seedWhenEmpty: true, maxBooks: 50 } }
    ]
};
