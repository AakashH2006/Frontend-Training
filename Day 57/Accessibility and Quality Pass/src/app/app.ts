/* Day 52, extended on Days 56 and 57 - the shell.

   DAY 57 adds the two things an accessibility pass puts in a shell rather than
   in a page, because both have to survive navigation: the skip link and the
   live region. It also starts `RouteFocus`, which moves focus into `<main>`
   after each navigation - measured as doing nothing at all until today.


   The request log read from `HttpLogService` is the interceptor's output, on
   screen. It is there for a reason beyond demonstration: it is the only way to
   see that a request happened at all. Day 18's fetch work had a visible
   loading state and nothing else; a request that succeeds quietly and a
   request that was never made look identical from the outside, and that cost
   me real time today.

   DAY 56 adds two things to the shell, and both are here rather than in a page
   because of where they have to live.

   `<app-confirm-dialog />` is rendered ONCE, by the shell, outside the outlet.
   A dialog owned by a page cannot survive the page being destroyed, and the
   whole reason the dialog exists is to ask "may I destroy this page?" - a
   question whose asker must outlive the answer. This is the structural insight
   of the day and it is not obvious from the guard's signature.

   The session line is here because the nav is here: whether to offer Settings
   or Sign in is a property of the app's chrome, not of any page. */

import { Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

import { AnnouncerRegion } from './announcer';
import { ConfirmDialog } from './confirm-dialog';
import { HttpLogService } from './http-log.service';
import { NoticeBar } from './notice-bar';
import { RouteFocus } from './route-focus.service';
import { SessionService } from './session.service';

/* Settings is in the nav for everybody, including people who are not signed
   in - deliberately, because a guard that is never reached is a guard nobody
   can see working. Hiding the link would be the kinder product decision and
   would also be defence by menu: the URL still works, so the guard would still
   have to exist, and it would never run in normal use. */
const NAV = [
    { link: '/contacts', label: 'Contacts', exact: true },
    { link: '/contacts/new', label: 'Add a contact', exact: false },
    { link: '/settings', label: 'Settings', exact: false },
    { link: '/about', label: 'About', exact: false }
] as const;

@Component({
    selector: 'app-root',
    imports: [
        RouterOutlet,
        RouterLink,
        RouterLinkActive,
        NoticeBar,
        ConfirmDialog,
        AnnouncerRegion
    ],
    templateUrl: './app.html'
})
export class App {
    protected readonly log = inject(HttpLogService);
    protected readonly session = inject(SessionService);
    protected readonly nav = NAV;

    /* Day 57: started here rather than in the service's own constructor.

       The shell is the component that owns the `<main>` the service focuses,
       so the component whose template guarantees the target exists is the one
       that turns the behaviour on. A root service that subscribed to the
       router on construction would start the moment any spec injected it. */
    constructor() {
        inject(RouteFocus).start();
    }
}
