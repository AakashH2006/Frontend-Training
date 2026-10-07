/* Day 46 - what signals actually do.

   Six experiments, each one making a claim observable. I wrote these because
   "a signal is a reactive value" is a sentence I could repeat without being
   able to predict what any of this would print. */

import { Component, computed, effect, linkedSignal, signal, untracked } from '@angular/core';

@Component({
    selector: 'app-signals-lab',
    imports: [],
    templateUrl: './signals-lab.html',
    styleUrl: './signals-lab.css'
})
export class SignalsLab {
    /* The log is itself a signal, so writing to it re-renders the list. */
    protected readonly log = signal<readonly string[]>([]);

    private note(message: string): void {
        this.log.update((lines) => [...lines.slice(-11), message]);
    }

    /* ---------------------------------------------------------------
       1. computed is lazy AND cached
       --------------------------------------------------------------- */

    protected readonly a = signal(1);
    protected readonly b = signal(1);

    /* A counter outside the reactive graph, so the number of evaluations is
       observable. A signal here would make the computed depend on it. */
    private expensiveRuns = 0;
    protected readonly runsShown = signal(0);

    protected readonly product = computed(() => {
        this.expensiveRuns += 1;
        /* Deferred to a microtask, because writing a signal from inside a
           computed is not allowed - Angular throws. The counter above is a
           plain field for that reason, and this only mirrors it for display. */
        queueMicrotask(() => this.runsShown.set(this.expensiveRuns));
        return this.a() * this.b();
    });

    /* ---------------------------------------------------------------
       2. computed only notifies when the VALUE changes
       --------------------------------------------------------------- */

    protected readonly count = signal(0);

    /* Depends on `count`, but only on whether it is even. Setting count from
       2 to 4 changes the dependency and not this value - so anything
       depending on THIS does not re-run. */
    protected readonly isEven = computed(() => this.count() % 2 === 0);

    private evenChanges = 0;
    protected readonly evenChangesShown = signal(0);

    /* ---------------------------------------------------------------
       3. untracked
       --------------------------------------------------------------- */

    protected readonly tracked = signal('tracked');
    protected readonly ignored = signal('ignored');

    protected readonly readsOne = computed(
        () => `${this.tracked()} + ${untracked(() => this.ignored())}`
    );

    /* ---------------------------------------------------------------
       4. linkedSignal
       --------------------------------------------------------------- */

    protected readonly statuses = signal<readonly string[]>(['unread', 'reading', 'finished']);

    /* Writable, like a signal, AND derived, like a computed: it resets to the
       computation's value whenever the source changes, and can be written to
       in between.

       This is the shape that needed a `useEffect` + `useState` pair in React -
       "a selection that resets when the options change" - which is the exact
       pattern the React docs warn about and Day 34 removed with a `key`. */
    protected readonly selected = linkedSignal(() => this.statuses()[0] ?? '');

    constructor() {
        /* ---------------------------------------------------------------
           5. effect
           --------------------------------------------------------------- */

        /* An effect runs after the values it reads have changed, and it tracks
           its dependencies automatically like a computed.

           The rule is the same as Day 33's: an effect is for synchronising
           with something OUTSIDE the reactive graph. This one writes to the
           log, which is inside it - so it is a demonstration, not a pattern to
           copy, and it is careful about which signals it reads. */
        effect(() => {
            const value = this.isEven();

            /* `untracked` around the write, because the log is a signal and
               writing a signal an effect depends on would be a loop. Angular
               allows writes in an effect by default, so this guard is mine
               rather than the framework's. */
            untracked(() => {
                this.evenChanges += 1;
                this.evenChangesShown.set(this.evenChanges);
                this.note(`effect: isEven is now ${value}`);
            });
        });

        /* A second effect, reading nothing it writes. This is the honest shape
           - it touches the document title, which is genuinely outside. */
        effect(() => {
            const product = this.product();
            untracked(() => this.note(`effect: product is ${product}`));
        });
    }

    /* ---------------------------------------------------------------
       Actions
       --------------------------------------------------------------- */

    protected bumpA(): void {
        this.a.update((n) => n + 1);
        this.note(`a is now ${this.a()}`);
    }

    protected bumpB(): void {
        this.b.update((n) => n + 1);
        this.note(`b is now ${this.b()}`);
    }

    /* Reads the computed without changing anything, to show the cache. */
    protected readProduct(): void {
        this.note(`read product three times: ${this.product()}, ${this.product()}, ${this.product()}`);
    }

    protected bumpCount(by: number): void {
        this.count.update((n) => n + by);
        this.note(`count is now ${this.count()} (isEven ${this.isEven()})`);
    }

    protected setTracked(): void {
        this.tracked.update((value) => (value === 'tracked' ? 'TRACKED' : 'tracked'));
        this.note(`tracked changed -> readsOne recomputed: ${this.readsOne()}`);
    }

    protected setIgnored(): void {
        this.ignored.update((value) => (value === 'ignored' ? 'IGNORED' : 'ignored'));
        this.note(`ignored changed -> readsOne still: ${this.readsOne()}`);
    }

    protected pickLast(): void {
        const statuses = this.statuses();
        this.selected.set(statuses[statuses.length - 1] ?? '');
        this.note(`selected set by hand: ${this.selected()}`);
    }

    protected changeOptions(): void {
        this.statuses.update((list) => (list.length === 3 ? ['abandoned', 'wishlist'] : ['unread', 'reading', 'finished']));
        this.note(`options changed -> selected reset to: ${this.selected()}`);
    }

    protected clearLog(): void {
        this.log.set([]);
    }
}
