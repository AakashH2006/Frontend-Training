/* Day 57 - where focus goes after a navigation, which is nowhere at all today.

   THE MEASUREMENT FIRST, because this is the one I would not have believed
   without it. A probe against Day 56's built bundle, reading
   `document.activeElement` after clicking a nav link:

       activeElement             : body
       after nav activeElement   : body

   Focus never moves. In a server-rendered app a link navigation loads a new
   document and focus resets to its top; in a single-page app nothing happens
   to focus at all, because nothing happened to the document. So a keyboard
   user who activates the fifth link in the nav is, after the page has changed
   completely, still on the fifth link in the nav - and their next Tab
   continues through the chrome rather than into the page they just asked for.
   A screen-reader user gets no indication that anything changed.

   This is the single most common accessibility defect in single-page apps and
   it is invisible to everybody who navigates with a mouse. It cost nothing to
   create and six days of this app have had it.

   TWO THINGS FIX IT and they are separate.

   The ANNOUNCEMENT - "Contacts, Day 57..." - is `SuffixTitleStrategy` calling
   `Announcer.announce`, because the title is the name of the page and the
   router already computes it.

   The FOCUS MOVE is this service. `<main>` gets `tabindex="-1"` so it can
   receive programmatic focus without entering the tab order, and focus is
   moved there after each navigation. The next Tab then goes to the first thing
   inside the new page, and a screen reader starts reading from the top of the
   content rather than from wherever it happened to be.

   WHY NOT THE HEADING. Moving focus to the `<h2>` is the other common
   recommendation and it reads better - the heading's text is announced - but it
   needs every page to have one at a known selector, and this app's pages put
   their heading inside `<app-panel>` with an id the page chooses. `<main>` is
   in the shell, is always there, and is the thing the skip link already points
   at. One target, one rule.

   WHY NOT THE FIRST NAVIGATION. On load, focus belongs where the browser put
   it. Stealing it on the first render would break "open a link and start
   reading", and would fight the browser's own fragment handling if the URL had
   one. So the first NavigationEnd is skipped, which is a `skip(1)` and a
   sentence of explanation. */

import { DOCUMENT, DestroyRef, Injectable, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs';

/* The path, without the query string.

   Day 55 made the URL the query: choosing a filter, typing a search and
   turning a page are all navigations to `/contacts?...`. So "a navigation
   happened" is the wrong trigger for both of today's behaviours, and getting
   that wrong is worse than not doing them at all.

   FOCUS. Moving focus to `<main>` when somebody clicks the Work filter takes
   focus off the button they are using, so their next Tab starts from the top
   of the page and the filter they wanted to adjust is six presses away. A
   navigation that changes only the query is not a new page; it is new results
   on the page they are already on, and focus belongs where they left it.

   ANNOUNCEMENTS. "Contacts" read out again after a filter click says nothing
   about what changed, and the thing that does know - the count - is on the
   page. So the shell announces the PAGE on a path change and the contacts page
   announces its RESULTS on a query change, and neither has to know about the
   other.

   One exported helper, used by two independent consumers that each keep their
   own copy of the last path. Shared state would mean whichever of them ran
   first decided what the other saw. */
export function pathOf(url: string): string {
    const query = url.indexOf('?');
    const fragment = url.indexOf('#');

    const cut = [query, fragment].filter((index) => index >= 0);

    return cut.length === 0 ? url : url.slice(0, Math.min(...cut));
}

/* `#main` rather than `main`, because the skip link in the shell targets the
   same id and the two must not be able to drift apart. */
const TARGET = 'main';

@Injectable({ providedIn: 'root' })
export class RouteFocus {
    private readonly router = inject(Router);

    /* The DOCUMENT token rather than the global `document`.

       Day 47's argument for tokens, in the one place where it is not optional:
       a service that reads the global cannot be given a different document, and
       this one is tested by appending an element to the test document and
       navigating. It is also what makes the service safe under
       server-rendering, which this app does not do and Day 59 might. */
    private readonly document = inject(DOCUMENT);

    /* Taken as a field rather than relied on implicitly, because
       `takeUntilDestroyed()` with no argument needs an injection context - and
       `start()` is a method, called from the shell's constructor in the app and
       from a plain `beforeEach` in the spec. The spec failed four times with

           NG0203: takeUntilDestroyed() can only be used within an injection
           context such as a constructor, a factory function, a field
           initializer...

       which is the same class of error as Day 56's `inject()` inside a
       `defer`: an injection context is a moment, not a place, and anything
       that needs one has to grab what it needs while it still has one. A field
       initializer runs during construction, so this does. */
    private readonly destroyRef = inject(DestroyRef);

    private moves = 0;

    /* `null` means "nothing has been navigated to yet", which is how the first
       navigation is told from a later one. A boolean `first` flag would do the
       same job and could not also answer "is this the same page", which is the
       question that actually matters. */
    private lastPath: string | null = null;

    /* Called by the shell's constructor rather than starting itself.

       A root service that subscribed to the router in its own constructor would
       start the moment anything injected it, which in a test means any spec
       that touches the router gets focus moved under it. Being started
       explicitly by the one component that owns the `<main>` it focuses keeps
       that honest. */
    start(): void {
        this.router.events
            .pipe(
                filter((event) => event instanceof NavigationEnd),
                takeUntilDestroyed(this.destroyRef)
            )
            .subscribe((event) => {
                const path = pathOf(event.urlAfterRedirects);
                const previous = this.lastPath;

                /* Recorded before the early returns, so that a query-only
                   navigation still updates what "the current page" is. */
                this.lastPath = path;

                /* The initial load: focus belongs where the browser put it.
                   Stealing it would break "open a link and start reading" and
                   would fight the browser's own fragment handling. */
                if (previous === null) return;

                /* Same page, different query - see `pathOf` above. */
                if (previous === path) return;

                this.focusMain();
            });
    }

    focusMain(): void {
        const main = this.document.getElementById(TARGET);
        if (main === null) return;

        /* `preventScroll` is deliberately NOT passed. Focusing the top of the
           new page should scroll to the top of the new page: a navigation that
           leaves the viewport halfway down the previous page's scroll position
           is its own bug, and this is the one line that fixes both. */
        main.focus();
        this.moves += 1;
    }

    /* Only for the spec, and named so that it reads as such. Counting is the
       cheapest way to assert "did not move focus on the first navigation",
       which is otherwise indistinguishable from "moved it to the same place". */
    get focusMoves(): number {
        return this.moves;
    }
}
