/* Day 41 - the root component.

   A component is a class with a @Component decorator, and the decorator is
   the part that is genuinely different from React. In React a component *is*
   a function that returns markup. Here the class holds the data and the
   behaviour, and the decorator points at a template file that is compiled
   separately.

   Three consequences I had to get used to:

     - the template is a separate file, so there is no JSX and no `return`
     - the template can only see what is on the class
     - `imports` is per component, which is the standalone part - the
       component declares what its own template uses, rather than an NgModule
       declaring it on everyone's behalf */

import { Component, signal } from '@angular/core';

import { BookCard } from './book-card';
import { SEED_BOOKS, STATUSES, STATUS_LABELS, type Book } from './domain';

@Component({
    /* The element this component replaces. `app-` is the prefix set in
       angular.json, and prefixing is not cosmetic: a selector is global, so an
       unprefixed `<card>` would collide with any library that had the same
       idea. */
    selector: 'app-root',

    /* What this template is allowed to use. BookCard is here because app.html
       contains <app-book-card>; leaving it out is a compile error naming the
       unknown element, which is a much better failure than React's silent
       lowercase-tag problem from Day 26. */
    imports: [BookCard],

    templateUrl: './app.html',
    styleUrl: './app.css'
})
export class App {
    /* `protected` so the template can read it and nothing outside the class
       can. The template is compiled as part of the class, so it has access to
       protected members - which is a visibility level React has no equivalent
       of, because a React component's state is a local variable.

       The CLI generates `protected readonly` on everything it scaffolds, and
       after a day of it the reasoning is clear: a field that is only for the
       template should say so. */
    protected readonly title = 'Reading List';

    /* A signal, used here as the simplest possible example - the deep end is
       Day 46. `signal()` returns a getter function, so the template reads it
       as `books()`, and that call is what Angular tracks to know which
       templates depend on which values. */
    protected readonly books = signal<readonly Book[]>(SEED_BOOKS);

    /* Plain fields, because they never change. Not everything has to be a
       signal, and making a constant one would be noise. */
    protected readonly statuses = STATUSES;
    protected readonly statusLabels = STATUS_LABELS;

    /* A getter, which is the other way to derive a value. It runs on every
       change-detection pass, which is the argument for `computed()` on Day 46
       - but for counting three books it is the simpler thing and worth
       showing before the thing that replaces it. */
    protected get total(): number {
        return this.books().length;
    }

    protected countOf(status: string): number {
        return this.books().filter((book) => book.status === status).length;
    }
}
