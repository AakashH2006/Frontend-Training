/* Day 45 - the Week 9 build.

   The parent coordinates and owns the state. Every child is a function of its
   inputs and reports what happened through outputs - which is the same shape
   as the React app, reached by a different mechanism.

   What the parent's template looks like now:

       <app-filter-bar [(query)]="query" [filter]="filter()" ... />
       <app-book-card [book]="book" (statusChange)="..." (remove)="..." />

   Day 44's version had the status select, the Remove button and all three
   filter controls inline here - about 60 lines of template that belonged to
   the components they were controlling. */

import { Component, computed, signal } from '@angular/core';

import { Panel } from './panel';
import { Stat } from './stat';
import { BookCard } from './book-card';
import { FilterBar } from './filter-bar';
import { EmptyState } from './empty-state';
import {
    SEED_BOOKS,
    STATUSES,
    STATUS_LABELS,
    type Book,
    type Filter,
    type Sort,
    type Status
} from './domain';

const COMPARATORS: Record<Sort, (a: Book, b: Book) => number> = {
    added: (a, b) => b.addedAt.localeCompare(a.addedAt),
    title: (a, b) => a.title.localeCompare(b.title),
    author: (a, b) => (a.authors[0] ?? '').localeCompare(b.authors[0] ?? ''),
    year: (a, b) => (b.year ?? -Infinity) - (a.year ?? -Infinity)
};

@Component({
    selector: 'app-root',
    imports: [Panel, Stat, BookCard, FilterBar, EmptyState],
    templateUrl: './app.html'
})
export class App {
    protected readonly books = signal<readonly Book[]>(SEED_BOOKS);

    /* `query` is bound with [(query)] and is written by FilterBar through its
       model(). It is still declared here, which is the part that matters: the
       state lives in the parent and the child has permission to write it. */
    protected readonly query = signal('');
    protected readonly filter = signal<Filter>('all');
    protected readonly sort = signal<Sort>('added');

    /* The last thing that happened, so the outputs are visible on the page
       rather than only in a handler. */
    protected readonly lastEvent = signal('Nothing yet.');

    protected readonly statuses = STATUSES;
    protected readonly statusLabels = STATUS_LABELS;

    protected readonly total = computed(() => this.books().length);

    protected readonly visible = computed<readonly Book[]>(() => {
        const needle = this.query().trim().toLowerCase();
        const filter = this.filter();

        return this.books()
            .filter((book) => filter === 'all' || book.status === filter)
            .filter(
                (book) =>
                    needle.length === 0 ||
                    book.title.toLowerCase().includes(needle) ||
                    book.authors.some((name) => name.toLowerCase().includes(needle))
            )
            .toSorted(COMPARATORS[this.sort()]);
    });

    protected readonly counts = computed(() =>
        STATUSES.reduce<Record<Status, number>>(
            (totals, status) => ({
                ...totals,
                [status]: this.books().filter((book) => book.status === status).length
            }),
            { unread: 0, reading: 0, finished: 0 }
        )
    );

    protected readonly filtering = computed(
        () => this.query().trim().length > 0 || this.filter() !== 'all'
    );

    /* Handlers for the outputs. Each one receives a typed payload, because
       the guard that turns a DOM string into a Status lives in the card. */
    protected onStatusChange(id: string, status: Status): void {
        this.books.update((books) =>
            books.map((book) => (book.id === id ? { ...book, status } : book))
        );
        this.lastEvent.set(`statusChange from ${id}: ${status}`);
    }

    protected onRemove(id: string): void {
        this.books.update((books) => books.filter((book) => book.id !== id));
        this.lastEvent.set(`remove from ${id}`);
    }

    protected onEdit(book: Book): void {
        /* No edit form until Day 49 - this records the event so the output is
           demonstrably wired rather than being a button that does nothing. */
        this.lastEvent.set(`edit from ${book.id}: "${book.title}"`);
    }

    protected onFilterChange(filter: Filter): void {
        this.filter.set(filter);
        this.lastEvent.set(`filterChange: ${filter}`);
    }

    protected onSortChange(sort: Sort): void {
        this.sort.set(sort);
        this.lastEvent.set(`sortChange: ${sort}`);
    }

    protected clearFilters(): void {
        this.query.set('');
        this.filter.set('all');
        this.lastEvent.set('filters cleared by the parent');
    }

    protected reset(): void {
        this.books.set(SEED_BOOKS);
        this.query.set('');
        this.filter.set('all');
        this.sort.set('added');
        this.lastEvent.set('reset');
    }
}
