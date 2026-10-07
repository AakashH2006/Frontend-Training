/* Day 41 - the component I generated with the CLI.

       ng generate component book-card --inline-style=false

   What that produced, and what I changed:

     - a folder `book-card/` with four files. I flattened it to two, because at
       this size a folder per component is more navigation than information.
       The CLI's layout is right for a large app and `--flat` is the flag.
     - `standalone: true` was absent, because it is the default in Angular 19+.
       Every tutorial that includes it is older than that.
     - an empty `book-card.spec.ts`, which I deleted. Day 37's lesson was that
       a test asserting `toBeTruthy()` on a component instance tests the
       framework rather than my code. Real tests arrive on Day 45. */

import { Component, input } from '@angular/core';

import { STATUS_LABELS, type Book } from './domain';

@Component({
    selector: 'app-book-card',
    imports: [],
    templateUrl: './book-card.html',
    styleUrl: './book-card.css'
})
export class BookCard {
    /* `input()` - the signal-based input, which is the current API. The
       decorator version, `@Input() book!: Book`, needed the `!` to promise
       TypeScript a value that Angular would set later, and that promise was
       unverifiable.

       `input.required<Book>()` has no such hole: the component will not
       compile into a template that omits it, and inside the class it is a
       signal with a non-nullable type. Day 45 is where this gets used
       properly. */
    readonly book = input.required<Book>();

    /* Public rather than protected, because `book-card.html` is this
       component's template but `app.html` is the one that *sets* it - and an
       input has to be writable from outside. `strictInputAccessModifiers` in
       tsconfig.json makes a private input an error for that reason. */

    protected readonly statusLabels = STATUS_LABELS;

    protected authorLine(): string {
        const authors = this.book().authors;

        if (authors.length === 0) return 'Author unknown';
        if (authors.length === 1) return authors[0] ?? 'Author unknown';
        if (authors.length === 2) return `${authors[0]} and ${authors[1]}`;
        return `${authors[0]} and ${authors.length - 1} others`;
    }
}
