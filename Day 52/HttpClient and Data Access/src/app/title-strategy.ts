/* Day 51 - the title strategy, unchanged.

   `title` on a route is applied by a `TitleStrategy`, and the default one sets
   `document.title` to exactly the route's title. Every page in this app would
   then be called "Contacts" or "About this build" with nothing saying which
   day's build it is, and the browser tab would lose the one piece of context
   that is the same on every page.

   Overriding it is a provider, which is Day 47's lesson arriving somewhere I
   did not expect: `TitleStrategy` is an injectable the router asks for, so
   replacing it is one entry in `app.config.ts` and no route changes.

   This is also the first time the app has extended a framework class rather
   than implemented an interface - hence `override`, which tsconfig's
   `noImplicitOverride` requires. */

import { Injectable, inject } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { TitleStrategy, type RouterStateSnapshot } from '@angular/router';

const SUFFIX = 'Day 52 | HttpClient and Data Access';

@Injectable({ providedIn: 'root' })
export class SuffixTitleStrategy extends TitleStrategy {
    /* `Title` rather than `document.title = ...`. It is the same assignment
       behind a service, and the reason to take the service is that it can be
       replaced in a test - the same argument as Day 47's StorageService. */
    private readonly title = inject(Title);

    override updateTitle(snapshot: RouterStateSnapshot): void {
        /* `buildTitle` walks the activated route tree and returns the deepest
            title, which is what makes a child route's title win over its
            parent's. It returns undefined when no route in the tree declared
            one. */
        const page = this.buildTitle(snapshot);

        this.title.setTitle(page === undefined ? SUFFIX : `${page} | ${SUFFIX}`);
    }
}
