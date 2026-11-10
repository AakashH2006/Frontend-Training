/* Day 51, extended on Day 57 - the title strategy.

   DAY 57 gives it a second job, and the reason it belongs here rather than in
   a router subscription of its own is that this class is already the one place
   that knows the name of the page being shown. A navigation in a single-page
   app changes everything on screen and says nothing to a screen reader; the
   page's name is the thing to say, and `buildTitle` has just computed it.

   Two jobs in one method is a smell I thought about and kept, because they are
   the same job for two audiences: tell the user what page this is, in the tab
   for one and out loud for the other.


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

import { Announcer } from './announcer.service';
import { pathOf } from './route-focus.service';

const SUFFIX = 'Day 57 | Accessibility and Quality Pass';

@Injectable({ providedIn: 'root' })
export class SuffixTitleStrategy extends TitleStrategy {
    /* `Title` rather than `document.title = ...`. It is the same assignment
       behind a service, and the reason to take the service is that it can be
       replaced in a test - the same argument as Day 47's StorageService. */
    private readonly title = inject(Title);

    private readonly announcer = inject(Announcer);

    /* `null` until the first navigation, which is not a change and is not
       announced: telling somebody who has just opened /contacts that they are
       on "Contacts" is noise on top of the page their screen reader is about
       to read, and it would interrupt it.

       After that, only a change of PATH is announced. A filter click is a
       navigation to the same page with a different query, and "Contacts" read
       out again tells the user nothing about what changed - the contacts page
       announces its own result count for that case. `pathOf` is shared with
       RouteFocus; this copy of the last path is not, deliberately, so that
       neither depends on the other running first. */
    private lastPath: string | null = null;

    override updateTitle(snapshot: RouterStateSnapshot): void {
        /* `buildTitle` walks the activated route tree and returns the deepest
            title, which is what makes a child route's title win over its
            parent's. It returns undefined when no route in the tree declared
            one. */
        const page = this.buildTitle(snapshot);

        this.title.setTitle(page === undefined ? SUFFIX : `${page} | ${SUFFIX}`);

        const path = pathOf(snapshot.url);
        const previous = this.lastPath;
        this.lastPath = path;

        if (previous === null || previous === path) return;

        /* The page's name WITHOUT the suffix. The tab needs the context
           because a tab is all you can see of a backgrounded page; a person
           who has just pressed a link does not need to be told which build of
           the app they are still in. */
        this.announcer.announce(page ?? 'Page');
    }
}
