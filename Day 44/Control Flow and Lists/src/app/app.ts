/* Day 44 - control flow, and a filterable list.

   The list is the practical half: a text filter, status filters and a sort,
   all derived with `computed()`. The control-flow half is the templates. */

import { Component, computed, signal } from '@angular/core';

import { Panel } from './panel';
import { Stat } from './stat';
import { BookCard } from './book-card';
import { ControlFlow } from './control-flow';
import {
    FILTERS,
    SEED_BOOKS,
    SORTS,
    STATUSES,
    STATUS_LABELS,
    isStatus,
    type Book,
    type Filter,
    type Sort,
    type Status
} from './domain';

const SORT_LABELS: Record<Sort, string> = {
    added: 'Recently added',
    title: 'Title',
    author: 'Author',
    year: 'Year published'
};

const FILTER_LABELS: Record<Filter, string> = {
    all: 'All',
    unread: STATUS_LABELS.unread,
    reading: STATUS_LABELS.reading,
    finished: STATUS_LABELS.finished
};

/* A closed Record, so adding a Sort member is a compile error here until it
   has a comparator. Day 23's lesson, third framework. */
const COMPARATORS: Record<Sort, (a: Book, b: Book) => number> = {
    added: (a, b) => b.addedAt.localeCompare(a.addedAt),
    title: (a, b) => a.title.localeCompare(b.title),
    author: (a, b) => (a.authors[0] ?? '').localeCompare(b.authors[0] ?? ''),
    year: (a, b) => (b.year ?? -Infinity) - (a.year ?? -Infinity)
};

@Component({
    selector: 'app-root',
    imports: [Panel, Stat, BookCard, ControlFlow],
    templateUrl: './app.html'
})
export class App {
    protected readonly books = signal<readonly Book[]>(SEED_BOOKS);

    protected readonly query = signal('');
    protected readonly filter = signal<Filter>('all');
    protected readonly sort = signal<Sort>('added');

    protected readonly statuses = STATUSES;
    protected readonly statusLabels = STATUS_LABELS;
    protected readonly filters = FILTERS;
    protected readonly filterLabels = FILTER_LABELS;
    protected readonly sorts = SORTS;
    protected readonly sortLabels = SORT_LABELS;

    /* Three inputs, one output, recomputed when any of them changes.

       The dependency tracking is automatic and that is the thing to notice:
       nothing here lists `query`, `filter`, `sort` or `books` as a dependency.
       Angular records which signals were *read* while the computation ran.
       React's useMemo needs that array written by hand, and a wrong array is a
       stale value with no error - which I got wrong once already, on Day 32. */
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
            /* toSorted, because `books()` is readonly and sorting in place
               would mutate the signal's value without changing its
               reference. */
            .toSorted(COMPARATORS[this.sort()]);
    });

    protected readonly total = computed(() => this.books().length);

    protected readonly counts = computed(() =>
        STATUSES.reduce<Record<Status, number>>(
            (totals, status) => ({
                ...totals,
                [status]: this.books().filter((book) => book.status === status).length
            }),
            { unread: 0, reading: 0, finished: 0 }
        )
    );

    protected setQuery(event: Event): void {
        const input = event.target as HTMLInputElement | null;
        this.query.set(input?.value ?? '');
    }

    protected setSort(event: Event): void {
        const select = event.target as HTMLSelectElement | null;
        const value = select?.value ?? '';
        if ((SORTS as readonly string[]).includes(value)) this.sort.set(value as Sort);
    }

    protected changeStatus(id: string, event: Event): void {
        const value = (event.target as HTMLSelectElement | null)?.value ?? '';
        if (!isStatus(value)) return;

        this.books.update((books) =>
            books.map((book) => (book.id === id ? { ...book, status: value } : book))
        );
    }

    protected remove(id: string): void {
        this.books.update((books) => books.filter((book) => book.id !== id));
    }

    protected clearFilters(): void {
        this.query.set('');
        this.filter.set('all');
    }

    protected reset(): void {
        this.books.set(SEED_BOOKS);
        this.clearFilters();
        this.sort.set('added');
    }
}
