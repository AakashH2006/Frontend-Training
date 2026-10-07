/* Day 48 - which mechanism, and when.

   Four ways for components to communicate, all available at once:

       input()        parent -> child, a value
       output()       child -> parent, an event
       model()        both, when the child owns the value
       a service      anyone -> anyone, when there is no useful common parent

   This file uses all four, and the point of the day is the choosing rather
   than the using. The rules I settled on are in the template and in
   Day 48/notes.md.

   What did NOT change: BookCard still takes a `book` input and emits
   `statusChange` and `remove`. It could inject the service and call
   `list.remove(id)` itself - and it should not, which is the most useful
   conclusion of the day. */

import { Component, inject } from '@angular/core';

import { Panel } from './panel';
import { Stat } from './stat';
import { BookCard } from './book-card';
import { FilterBar } from './filter-bar';
import { EmptyState } from './empty-state';
import { NoticeBar } from './notice-bar';
import { SectionA } from './nesting';
import { ReadingListService } from './reading-list.service';
import { NotificationsService } from './notifications.service';
import { StorageService } from './storage.service';
import { STATUSES, STATUS_LABELS, type Filter, type Sort, type Status } from './domain';

@Component({
    selector: 'app-root',
    imports: [Panel, Stat, BookCard, FilterBar, EmptyState, NoticeBar, SectionA],
    templateUrl: './app.html'
})
export class App {
    protected readonly list = inject(ReadingListService);
    protected readonly notifications = inject(NotificationsService);
    protected readonly storage = inject(StorageService);

    protected readonly statuses = STATUSES;
    protected readonly statusLabels = STATUS_LABELS;

    /* These handlers do TWO things - update the list and raise a notice - and
       that is why they still exist rather than the template calling the
       service directly.

       A one-line forward is noise; a handler that coordinates two services is
       the component doing its job. The Reset button in the template calls
       `list.reset()` straight, because there is nothing to coordinate. */
    protected onStatusChange(id: string, status: Status): void {
        this.list.setStatus(id, status);

        const book = this.list.books().find((entry) => entry.id === id);
        this.notifications.show(`"${book?.title ?? id}" is now ${status}.`);
    }

    protected onRemove(id: string): void {
        const book = this.list.books().find((entry) => entry.id === id);
        this.list.remove(id);
        this.notifications.show(`Removed "${book?.title ?? id}".`, 'danger');
    }

    protected onFilterChange(filter: Filter): void {
        this.list.setFilter(filter);
    }

    protected onSortChange(sort: Sort): void {
        this.list.setSort(sort);
    }

    protected onQueryChange(query: string): void {
        this.list.setQuery(query);
    }
}
