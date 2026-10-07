/* Day 44 - each control-flow block, with something observable.

   @if and @for are in the list above. This component covers the two I had not
   used, plus the `track` mistake that is worth making on purpose once. */

import { Component, computed, input, signal } from '@angular/core';

import { STATUSES, type Book, type Status } from './domain';

@Component({
    selector: 'app-control-flow',
    imports: [],
    templateUrl: './control-flow.html',
    styleUrl: './control-flow.css'
})
export class ControlFlow {
    readonly books = input.required<readonly Book[]>();

    protected readonly statuses = STATUSES;

    /* For the @switch section. */
    protected readonly phase = signal<'idle' | 'loading' | 'success' | 'empty' | 'failed'>('idle');
    protected readonly phases = ['idle', 'loading', 'success', 'empty', 'failed'] as const;

    /* For the track demonstration: the same list, rendered twice, with a
       stateful <input> inside each row. */
    protected readonly rows = signal<readonly Book[]>([]);

    protected readonly grouped = computed(() => {
        const books = this.books();

        return this.statuses
            .map((status) => ({
                status,
                books: books.filter((book) => book.status === status)
            }))
            /* Groups with nothing in them are dropped here rather than being
               hidden by an @if in the template. A template should render what
               it is given. */
            .filter((group) => group.books.length > 0);
    });

    protected readonly nextPhase = computed(() => {
        const index = this.phases.indexOf(this.phase());
        return this.phases[(index + 1) % this.phases.length] ?? 'idle';
    });

    protected cyclePhase(): void {
        this.phase.set(this.nextPhase());
    }

    protected loadRows(): void {
        this.rows.set(this.books().slice(0, 3));
    }

    /* Reverses the list, which is the operation that exposes a bad `track`.
       With `track $index` the DOM nodes stay put and only the text changes -
       so anything the user typed into a row ends up on a different book. */
    protected reverseRows(): void {
        this.rows.update((rows) => [...rows].reverse());
    }

    protected statusOf(status: Status): string {
        return status;
    }
}
