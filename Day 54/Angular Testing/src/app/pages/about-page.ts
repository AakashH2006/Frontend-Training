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

import { Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';

import { DirectoryService } from '../directory.service';
import { routes } from '../routes';

@Component({
    selector: 'app-about-page',
    imports: [RouterLink],
    template: `
        <section class="panel">
            <h2>About this build</h2>

            <p class="text-muted">
                Day 53 of the course: RxJS. The same five routes, plus a
                typeahead against a staff directory the client never
                downloads - which is the first thing in this app that needed
                debounce, distinct and switchMap rather than merely tolerating
                them.
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

            <!-- Consumer two of DirectoryService.size$ (no backticks in here:
                 this template is a JS template literal, and one backtick ends
                 it - which is exactly how I found out, with five TS1005s in a
                 file I had not changed the syntax of).

                 The search panel on the contacts page is consumer one. Between
                 them the request log shows ONE GET /api/directory/size, which
                 is shareReplay working - and the only way to observe it, since
                 both components behave identically either way. -->
            <p class="text-sm text-muted" id="about-directory-size">
                @if (directorySize(); as total) {
                    The staff directory has {{ total }} people in it.
                } @else {
                    Asking how big the staff directory is&hellip;
                }
            </p>

            <a class="button button--small" routerLink="/contacts">Back to the contacts</a>
        </section>
    `
})
export class AboutPage {
    protected readonly paths = routes.map((route) => `/${route.path ?? ''}`);

    private readonly directory = inject(DirectoryService);

    protected readonly directorySize = toSignal(this.directory.size$, { initialValue: null });
}
