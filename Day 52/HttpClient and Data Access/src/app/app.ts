/* Day 52 - the shell.

   Two changes from Day 51. The storage note has gone, because the client no
   longer has storage to report on, and in its place is a request log read from
   `HttpLogService` - the interceptor's output, on screen.

   That log is there for a reason beyond demonstration: it is the only way to
   see that a request happened at all. Day 18's fetch work had a visible
   loading state and nothing else; a request that succeeds quietly and a
   request that was never made look identical from the outside, and that cost
   me real time today. */

import { Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

import { HttpLogService } from './http-log.service';
import { NoticeBar } from './notice-bar';

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
    protected readonly log = inject(HttpLogService);
    protected readonly nav = NAV;
}
