/* Day 47 - the state, out of the component.

   Day 46's App held four signals, six computeds and every handler. That worked
   and it had the same problem Week 6 had by Day 30: the component that renders
   the list also owns the list, so a second component that needs it has to be
   handed everything through inputs.

   This is the Angular answer, and it is closer to Week 7's context than to
   anything else: one instance, injected wherever it is needed, with the
   component shrinking to a view over it. */

import { Injectable, computed, inject, signal } from '@angular/core';

import { StorageService } from './storage.service';
import {
    SEED_BOOKS,
    STATUSES,
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

/* `providedIn: 'root'` is the whole registration. There is no providers array
   to edit and no module to import it into - the decorator says where it lives,
   and the injector creates it the first time something asks.

   Two consequences worth knowing:

     - It is a singleton for the application. Every injector below the root
       resolves to the same instance, which is what makes this a store.
     - It is tree-shakable. A service nobody injects is removed from the
       bundle, which an NgModule `providers` entry never was, because the
       module referenced it eagerly. */
@Injectable({ providedIn: 'root' })
export class ReadingListService {
    /* `inject()` in a field initialiser rather than a constructor parameter.

       Both work. `inject()` is the current style and it has one real
       advantage: it works in places a constructor does not - field
       initialisers, `computed`, functional guards and interceptors - so there
       is one way to get a dependency instead of two.

       Constructor injection reads better when there are many, and it is also
       what every older tutorial shows, so it is worth being able to read:

           constructor(private storage: StorageService) {} */
    private readonly storage = inject(StorageService);

    /* STATE - private, and writable only in here. */
    private readonly booksSignal = signal<readonly Book[]>(this.storage.load() ?? SEED_BOOKS);
    private readonly querySignal = signal('');
    private readonly filterSignal = signal<Filter>('all');
    private readonly sortSignal = signal<Sort>('added');

    /* PUBLIC - readonly views.

       `.asReadonly()` returns the same signal without `set` or `update`, so a
       component can read it and cannot write it. That is Day 19's lesson -
       export actions, not the state - enforced by the type rather than by a
       comment.

       Without this, `service.books.set([])` from a template would compile. */
    readonly books = this.booksSignal.asReadonly();
    readonly query = this.querySignal.asReadonly();
    readonly filter = this.filterSignal.asReadonly();
    readonly sort = this.sortSignal.asReadonly();

    /* DERIVED - the same three stages as Day 46, now shared by every consumer
       rather than recomputed per component. */
    readonly total = computed(() => this.books().length);

    readonly byStatus = computed(() => {
        const filter = this.filter();
        return filter === 'all' ? this.books() : this.books().filter((b) => b.status === filter);
    });

    readonly matching = computed(() => {
        const needle = this.query().trim().toLowerCase();
        if (needle.length === 0) return this.byStatus();

        return this.byStatus().filter(
            (book) =>
                book.title.toLowerCase().includes(needle) ||
                book.authors.some((name) => name.toLowerCase().includes(needle))
        );
    });

    readonly visible = computed(() => this.matching().toSorted(COMPARATORS[this.sort()]));

    readonly counts = computed(() =>
        STATUSES.reduce<Record<Status, number>>(
            (totals, status) => ({
                ...totals,
                [status]: this.books().filter((book) => book.status === status).length
            }),
            { unread: 0, reading: 0, finished: 0 }
        )
    );

    readonly filtering = computed(
        () => this.query().trim().length > 0 || this.filter() !== 'all'
    );

    /* ACTIONS - the only way in. */

    setQuery(query: string): void {
        this.querySignal.set(query);
    }

    setFilter(filter: Filter): void {
        this.filterSignal.set(filter);
    }

    setSort(sort: Sort): void {
        this.sortSignal.set(sort);
    }

    setStatus(id: string, status: Status): void {
        this.commit((books) =>
            books.map((book) => (book.id === id ? { ...book, status } : book))
        );
    }

    remove(id: string): void {
        this.commit((books) => books.filter((book) => book.id !== id));
    }

    add(book: Book): void {
        if (this.books().some((existing) => existing.id === book.id)) return;
        this.commit((books) => [book, ...books]);
    }

    clearFilters(): void {
        this.querySignal.set('');
        this.filterSignal.set('all');
    }

    reset(): void {
        this.commit(() => SEED_BOOKS);
        this.clearFilters();
        this.sortSignal.set('added');
    }

    /* One place that writes the books and one place that persists them.

       The alternative is an `effect` watching `books` and writing storage -
       which Day 35 used in the React app and which works. This is simpler
       here: persisting is caused by an action, so it belongs in the action
       path rather than in a reaction to it. Day 34's rule about events not
       being effects, applied to a service. */
    private commit(change: (books: readonly Book[]) => readonly Book[]): void {
        this.booksSignal.update(change);
        this.storage.save(this.books());
    }
}
