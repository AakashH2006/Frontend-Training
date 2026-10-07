/* Day 46 - the reading list, with every derived value as a computed.

   Day 45 already used `computed` for the filtered list and the counts. What
   changes today is that the derivations are split and named, the getters are
   gone, and `effect` is used exactly once - for something genuinely outside
   the reactive graph.

   The shape this converges on is the same conclusion as Day 20 and Day 31:
   there are a few pieces of state, and everything else is derived. Signals
   make that cheaper to express than either previous framework did. */

import { Component, computed, effect, signal, untracked } from '@angular/core';

import { Panel } from './panel';
import { Stat } from './stat';
import { BookCard } from './book-card';
import { FilterBar } from './filter-bar';
import { EmptyState } from './empty-state';
import { SignalsLab } from './signals-lab';
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
    imports: [Panel, Stat, BookCard, FilterBar, EmptyState, SignalsLab],
    templateUrl: './app.html'
})
export class App {
    /* STATE - four signals, and that is all of it. */
    protected readonly books = signal<readonly Book[]>(SEED_BOOKS);
    protected readonly query = signal('');
    protected readonly filter = signal<Filter>('all');
    protected readonly sort = signal<Sort>('added');

    protected readonly statuses = STATUSES;
    protected readonly statusLabels = STATUS_LABELS;

    /* DERIVED - six computeds, none of them stored. */
    protected readonly total = computed(() => this.books().length);

    /* Split into three stages deliberately. Day 45 had one computed doing
       filter-then-search-then-sort; three named steps are the same work, and
       the graph now caches each stage - so changing only the sort does not
       redo the filtering.

       That is not a split I would make in React, because three useMemos mean
       three dependency arrays to keep correct. Here it costs nothing. */
    protected readonly byStatus = computed(() => {
        const filter = this.filter();
        return filter === 'all'
            ? this.books()
            : this.books().filter((book) => book.status === filter);
    });

    protected readonly matching = computed(() => {
        const needle = this.query().trim().toLowerCase();
        if (needle.length === 0) return this.byStatus();

        return this.byStatus().filter(
            (book) =>
                book.title.toLowerCase().includes(needle) ||
                book.authors.some((name) => name.toLowerCase().includes(needle))
        );
    });

    protected readonly visible = computed(() =>
        this.matching().toSorted(COMPARATORS[this.sort()])
    );

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

    /* A computed reading two other computeds. The graph handles the ordering,
       so there is no "which one updates first" question - which was a real one
       in Week 4's hand-rolled store, where render() had to be called after
       every action and in the right order. */
    protected readonly summary = computed(() => {
        const shown = this.visible().length;
        const all = this.total();

        if (all === 0) return 'Nothing on the list.';
        if (shown === all) return `All ${all} books.`;
        return `${shown} of ${all} books.`;
    });

    constructor() {
        /* The ONE effect in this component, and it earns the name: the
           document title lives outside Angular's reactive graph, so keeping it
           in step is synchronisation.

           Day 33's test - name the outside thing - and the outside thing is
           `document`. If I had reached for an effect to keep `visible` in step
           with `query`, that would be Day 34's mistake in a new framework. */
        effect(() => {
            const shown = this.visible().length;
            const all = this.total();

            untracked(() => {
                document.title =
                    shown === all ? `Reading List (${all})` : `Reading List (${shown}/${all})`;
            });
        });
    }

    protected onStatusChange(id: string, status: Status): void {
        this.books.update((books) =>
            books.map((book) => (book.id === id ? { ...book, status } : book))
        );
    }

    protected onRemove(id: string): void {
        this.books.update((books) => books.filter((book) => book.id !== id));
    }

    protected onFilterChange(filter: Filter): void {
        this.filter.set(filter);
    }

    protected onSortChange(sort: Sort): void {
        this.sort.set(sort);
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
