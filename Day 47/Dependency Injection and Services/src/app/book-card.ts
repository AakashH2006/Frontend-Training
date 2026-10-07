/* Day 45 - one book, with outputs.

   Day 44's card was display-only and the parent put the controls beside it.
   That was the wrong boundary: a card that shows a book should own the
   controls for that book, and the parent should hear about what happened
   rather than wire up the widgets.

   So the card now has three outputs and the parent's template gets shorter. */

import { Component, computed, input, output } from '@angular/core';

import { Badge } from './badge';
import { STATUSES, STATUS_LABELS, isStatus, type Book, type Status } from './domain';

@Component({
    selector: 'app-book-card',
    imports: [Badge],
    templateUrl: './book-card.html',
    styleUrl: './book-card.css'
})
export class BookCard {
    /* `input.required<Book>()` - no default, and the component will not
       compile into a template that omits it. The old decorator form,
       `@Input() book!: Book`, needed the `!` to promise TypeScript a value
       Angular would set later, and that promise was unverifiable. */
    readonly book = input.required<Book>();

    /* An optional input with a default. `showControls={false}` turns the card
       back into Day 44's display-only version, which is what the "every
       binding" panel below uses. */
    readonly showControls = input<boolean>(true);

    /* An input with a TRANSFORM. The template may pass a string or a number
       and the class always sees a number.

       This is the feature I did not know existed and it solves a real
       annoyance: a static attribute in a template is always a string, so
       `position="3"` would otherwise arrive as "3". With a transform the
       conversion happens once, at the boundary, instead of at every read. */
    readonly position = input<number, string | number>(0, {
        transform: (value) => (typeof value === 'number' ? value : Number(value))
    });

    /* Outputs. `output<T>()` returns an OutputEmitterRef with one method,
       `emit`, and the template binds it as `(statusChange)="..."`.

       The old form was `@Output() statusChange = new EventEmitter<Status>()`,
       which exposed the whole EventEmitter - including `subscribe`, which
       invited a parent to subscribe imperatively instead of binding. The new
       one has no subscribe at all, which is a smaller API doing the same job.

       Naming: an output that pairs with an input called `x` should be called
       `xChange`, because then `[(x)]` works. These are deliberately NOT named
       that way - `remove` and `edit` are events, not value changes, and
       pretending otherwise would suggest two-way binding makes sense for
       them. */
    readonly statusChange = output<Status>();
    readonly remove = output<string>();
    readonly edit = output<Book>();

    protected readonly statuses = STATUSES;
    protected readonly statusLabels = STATUS_LABELS;

    protected readonly authorLine = computed(() => {
        const authors = this.book().authors;

        if (authors.length === 0) return 'Author unknown';
        if (authors.length === 1) return authors[0] ?? 'Author unknown';
        if (authors.length === 2) return `${authors[0]} and ${authors[1]}`;
        return `${authors[0]} and ${authors.length - 1} others`;
    });

    protected readonly yearLine = computed(() => {
        const year = this.book().year;
        return year === undefined ? 'Publication year unknown' : `First published ${year}`;
    });

    /* The guard stays here rather than in the parent, so the output's type is
       honest: it emits a `Status`, never a string that might not be one. A
       component that emits `string` and expects the parent to validate has
       moved the problem rather than solved it. */
    protected onStatusChange(event: Event): void {
        const value = (event.target as HTMLSelectElement | null)?.value ?? '';
        if (isStatus(value)) this.statusChange.emit(value);
    }
}
