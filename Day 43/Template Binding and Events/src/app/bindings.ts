/* Day 43 - every kind of binding, on one page.

   Angular has five and they are not interchangeable. Getting them confused is
   the main way a template silently does nothing, so this component exercises
   each one with something observable. */

import { Component, computed, signal } from '@angular/core';

import { STATUSES, type Status } from './domain';

@Component({
    selector: 'app-bindings',
    imports: [],
    templateUrl: './bindings.html',
    styleUrl: './bindings.css'
})
export class Bindings {
    protected readonly statuses = STATUSES;

    /* ---- interpolation and property binding ---- */
    protected readonly title = signal('Beloved');
    protected readonly disabled = signal(false);
    protected readonly coverUrl = signal('https://covers.openlibrary.org/b/id/8231856-M.jpg');

    /* ---- attribute binding ---- */
    protected readonly describedBy = signal<string | null>('title-help');

    /* ---- class and style binding ---- */
    protected readonly status = signal<Status>('reading');
    protected readonly highlighted = signal(false);
    protected readonly progress = signal(40);

    /* ---- events ---- */
    protected readonly clicks = signal(0);
    protected readonly lastKey = signal('');
    protected readonly typed = signal('');
    protected readonly log = signal<readonly string[]>([]);

    /* ---- two-way ---- */
    protected readonly note = signal('');

    protected readonly progressLabel = computed(() => `${this.progress()}% read`);

    protected note_(message: string): void {
        this.log.update((previous) => [...previous.slice(-4), message]);
    }

    protected handleClick(): void {
        /* `.update()` for anything derived from the previous value - the
           signal equivalent of Day 28's functional update, and the same
           reason: `this.clicks.set(this.clicks() + 1)` reads the current value
           and would be wrong if two updates were batched. */
        this.clicks.update((n) => n + 1);
        this.note_(`clicked, now ${this.clicks()}`);
    }

    /* `$event` is typed as the real DOM event, so this signature is the
       contract. `Event` would compile and `event.target.value` would not -
       `target` is `EventTarget | null`, which is Day 25's problem again.

       KeyboardEvent and the cast below are the two ways round it. */
    protected handleKey(event: KeyboardEvent): void {
        this.lastKey.set(event.key);

        if (event.key === 'Escape') {
            this.typed.set('');
            this.note_('Escape cleared the field');
        }
    }

    protected handleInput(event: Event): void {
        /* The cast, with a reason. `event.target` is `EventTarget | null`, and
           an EventTarget has no `value`. Angular's own template syntax offers
           `$event.target.value` which is implicitly any - so doing it in the
           class with an explicit narrowing is the honest version.

           `instanceof` would be better still and needs the DOM lib types in
           scope, which tsconfig.app.json excludes via `types: []`. Noted
           rather than hidden. */
        const input = event.target as HTMLInputElement | null;
        this.typed.set(input?.value ?? '');
    }

    protected toggleDisabled(): void {
        this.disabled.update((value) => !value);
        this.note_(`disabled is now ${this.disabled()}`);
    }

    protected cycleStatus(): void {
        const current = this.statuses.indexOf(this.status());
        const next = this.statuses[(current + 1) % this.statuses.length];
        if (next !== undefined) this.status.set(next);
    }

    protected setProgress(event: Event): void {
        const input = event.target as HTMLInputElement | null;
        this.progress.set(Number(input?.value ?? 0));
    }

    protected clearLog(): void {
        this.log.set([]);
    }
}
