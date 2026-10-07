/* Day 48 - the component that proves the point.

   This sits at the bottom of a deliberately silly tree:

       App > Panel > SectionA > SectionB > SectionC > DeepToolbar

   and it needs the reading list and the notifications. With inputs, the three
   sections that care about neither would each need two inputs and two outputs
   purely to pass them through - twelve declarations to move two values three
   levels.

   With injection it needs nothing from its parents at all. That is the thing
   Week 7 solved with context, and Angular's version needs no provider
   component because the service is already application-wide. */

import { Component, inject } from '@angular/core';

import { NotificationsService } from './notifications.service';
import { ReadingListService } from './reading-list.service';

@Component({
    selector: 'app-deep-toolbar',
    imports: [],
    template: `
        <div class="demo">
            <p class="text-sm text-muted">
                Five levels deep, and it takes no inputs.
            </p>
            <p class="text-sm" id="deep-count">
                It can see {{ list.total() }} {{ list.total() === 1 ? 'book' : 'books' }} and
                {{ notifications.count() }} {{ notifications.count() === 1 ? 'notice' : 'notices' }}.
            </p>
            <div class="form-actions">
                <button type="button" class="button button--small" id="deep-mark" (click)="markAllRead()">
                    Mark everything finished
                </button>
                <button type="button" class="button button--quiet button--small" id="deep-note" (click)="notifications.show('A notice from five levels down.')">
                    Raise a notice
                </button>
            </div>
        </div>
    `
})
export class DeepToolbar {
    protected readonly list = inject(ReadingListService);
    protected readonly notifications = inject(NotificationsService);

    protected markAllRead(): void {
        const changed = this.list.books().filter((book) => book.status !== 'finished').length;

        for (const book of this.list.books()) {
            this.list.setStatus(book.id, 'finished');
        }

        this.notifications.show(
            changed === 0
                ? 'Everything was already finished.'
                : `Marked ${changed} ${changed === 1 ? 'book' : 'books'} finished.`
        );
    }
}
