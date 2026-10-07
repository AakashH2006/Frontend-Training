/* Day 43 - binding and events. */

import { Component, computed, signal } from '@angular/core';

import { Panel } from './panel';
import { BookCard } from './book-card';
import { Bindings } from './bindings';
import { SEED_BOOKS, isStatus, type Book, type Status, STATUSES, STATUS_LABELS } from './domain';

@Component({
    selector: 'app-root',
    imports: [Panel, BookCard, Bindings],
    templateUrl: './app.html'
})
export class App {
    protected readonly books = signal<readonly Book[]>(SEED_BOOKS);
    protected readonly statuses = STATUSES;
    protected readonly statusLabels = STATUS_LABELS;

    protected readonly total = computed(() => this.books().length);

    /* The first real interactivity in the Angular week: a status select per
       row, and a remove. Both go through a method on the class rather than an
       expression in the template, for the Day 42 reason - a template that
       needs explaining is doing the class's job. */
    protected changeStatus(id: string, event: Event): void {
        const select = event.target as HTMLSelectElement | null;
        const value = select?.value ?? '';

        /* The guard that turns a DOM string into a Status. Week 6's lesson,
           and the "readng" typo from Week 4 still cannot get through it. */
        if (!isStatus(value)) return;

        this.setStatus(id, value);
    }

    protected setStatus(id: string, status: Status): void {
        /* `.update()` with a new array. A signal holding a mutated array is
           the Angular version of Day 28's bug: the reference is unchanged, so
           nothing that depends on it recomputes. */
        this.books.update((books) =>
            books.map((book) => (book.id === id ? { ...book, status } : book))
        );
    }

    protected remove(id: string): void {
        this.books.update((books) => books.filter((book) => book.id !== id));
    }

    protected reset(): void {
        this.books.set(SEED_BOOKS);
    }
}
