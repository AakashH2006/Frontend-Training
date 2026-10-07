/* Day 42 - the component tree.

   App composes and nothing else: six components, no logic beyond deriving a
   count.

       App
       ├── Panel "Summary"      (projects Stat × 4)
       │   └── Stat
       ├── Panel "Your list"    (projects a button into panel-actions)
       │   └── BookList
       │       ├── BookCard -> Badge
       │       └── EmptyState
       └── Panel "The empty case"
           └── BookList with []

   `imports` on this component lists all six, because app.html uses all six.
   That list IS the dependency declaration - which is the part of standalone
   components I like most: a component's dependencies are written on the
   component, so deleting it cannot leave a dangling registration behind. */

import { Component, computed, signal } from '@angular/core';

import { Panel } from './panel';
import { Stat } from './stat';
import { BookList } from './book-list';
import { SEED_BOOKS, STATUSES, STATUS_LABELS, type Book, type Status } from './domain';

@Component({
    selector: 'app-root',
    imports: [Panel, Stat, BookList],
    templateUrl: './app.html'
})
export class App {
    protected readonly books = signal<readonly Book[]>(SEED_BOOKS);
    protected readonly noBooks = signal<readonly Book[]>([]);

    protected readonly statuses = STATUSES;
    protected readonly statusLabels = STATUS_LABELS;

    /* A computed rather than Day 41's getter. The getter ran on every
       change-detection pass; this recalculates only when `books` changes.

       At three books neither is measurable. It is here because the shape is
       the thing worth getting used to, and because a computed reads as a
       value while a getter reads as a call that might do anything. */
    protected readonly total = computed(() => this.books().length);

    protected readonly counts = computed(() => {
        const books = this.books();

        /* Starting from a complete Record rather than {}, so no count can be
           undefined downstream and no assertion is needed. Day 23. */
        return STATUSES.reduce<Record<Status, number>>(
            (totals, status) => ({
                ...totals,
                [status]: books.filter((book) => book.status === status).length
            }),
            { unread: 0, reading: 0, finished: 0 }
        );
    });
}
