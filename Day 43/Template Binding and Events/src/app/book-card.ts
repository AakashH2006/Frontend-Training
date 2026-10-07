/* Day 42 - one book, composed from the small components. */

import { Component, computed, input } from '@angular/core';

import { Badge } from './badge';
import { type Book } from './domain';

@Component({
    selector: 'app-book-card',
    imports: [Badge],
    templateUrl: './book-card.html',
    styleUrl: './book-card.css'
})
export class BookCard {
    readonly book = input.required<Book>();

    /* Pulled out of the template as a computed, because the template is an
       expression language and this is three branches.

       The rule I settled on: anything with more than a ternary belongs on the
       class. A template that needs explaining is a template doing the class's
       job - which is the same instinct as Day 20 pulling format.js out of
       render.js. */
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
}
