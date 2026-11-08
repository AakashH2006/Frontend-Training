/* Day 51 - the lazy route.

   This component is in its own chunk because `routes.ts` reaches it through
   `loadComponent: () => import(...)` rather than by importing it at the top of
   the file. The build output is the proof:

       main.js            the app
       chunk-XXXXXXXX.js  this file, fetched the first time /about is visited

   Nothing in the app's behaviour changes, which is why the build output is the
   only honest way to check that a lazy route is actually lazy. An import added
   to any eagerly-loaded file would quietly pull it back into main and the app
   would still work.

   It lists the routes from the same array the router uses, so the table cannot
   drift from the real thing - which is the practical benefit of routes being
   data rather than markup. */

import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

import { routes } from '../routes';

@Component({
    selector: 'app-about-page',
    imports: [RouterLink],
    template: `
        <section class="panel">
            <h2>About this build</h2>

            <p class="text-muted">
                Day 51 of the course: the Angular Router. Day 50's single
                screen is now five routes, and the one piece of state the
                component owned - which contact is being edited - is in the
                URL.
            </p>

            <h3 class="text-sm">The route table</h3>

            <!-- Read from routes.ts, not retyped. A hand-written table here
                 would be a second copy of the truth, which is Day 20's
                 mistake and the one this file exists to avoid. -->
            <ul class="tags" id="route-list">
                @for (route of paths; track route) {
                    <li class="tag">{{ route }}</li>
                }
            </ul>

            <p class="text-sm text-muted">
                This page is a lazy route, so the code you are reading arrived
                in its own chunk when you navigated here.
            </p>

            <a class="button button--small" routerLink="/contacts">Back to the contacts</a>
        </section>
    `
})
export class AboutPage {
    protected readonly paths = routes.map((route) => `/${route.path ?? ''}`);
}
