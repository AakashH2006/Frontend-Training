/* Day 51 - the shell.

   Day 50's App was the whole screen: the form, the list, the toolbar and every
   handler that connected them, a little over a hundred lines of template. This
   one has a header, a nav, an outlet and a footer, and it holds no state at
   all.

   That is the structural change the router makes, and it is bigger than it
   looks written down. The component at the top of the tree stopped being the
   place where everything meets. What used to be `editingId` is a URL; what
   used to be a conditional panel is a route; what used to be four handlers
   coordinating two panels is two pages that never refer to each other.

   The nav is built from `NAV`, below, rather than from `routes` directly -
   see the comment there. */

import { Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

import { NoticeBar } from './notice-bar';
import { StorageService } from './storage.service';

/* The three navigable destinations, which is NOT the same list as the route
   table: /contacts/:id is a route and is not somewhere you can navigate to
   without an id, and `**` is a route that must never appear in a nav.

   So this is hand-written, and the About page lists `routes` instead. Day 20's
   rule is about duplicating the SAME fact; a nav and a route table are two
   different facts that overlap. */
const NAV = [
    { link: '/contacts', label: 'Contacts', exact: true },
    { link: '/contacts/new', label: 'Add a contact', exact: false },
    { link: '/about', label: 'About', exact: false }
] as const;

@Component({
    selector: 'app-root',
    imports: [RouterOutlet, RouterLink, RouterLinkActive, NoticeBar],
    templateUrl: './app.html'
})
export class App {
    protected readonly storage = inject(StorageService);
    protected readonly nav = NAV;
}
