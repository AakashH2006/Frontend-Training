/* Day 51 - the wildcard's component.

   Day 36's conclusion, unchanged: a 404 page in a single-page app is a
   rendered route, not an HTTP status. The server returned 200 and index.html;
   nothing about this response says "not found" to anything but a reader.

   It offers a way out, because a dead end with no link is the part people
   actually complain about. */

import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
    selector: 'app-not-found-page',
    imports: [RouterLink],
    template: `
        <div class="empty-state" id="not-found">
            <h2>That page does not exist</h2>
            <p class="text-muted">
                The address did not match any route in this build.
            </p>
            <a class="button button--small" routerLink="/contacts">Back to the contacts</a>
        </div>
    `
})
export class NotFoundPage {}
