/* Day 42 - the list, and the empty case.

   Splitting this from BookCard is the same decision as Day 26: BookList knows
   there is a collection and that a collection can be empty; BookCard knows
   what one book looks like and nothing about there being others. Neither has
   to change when the other does. */

import { Component, input } from '@angular/core';

import { BookCard } from './book-card';
import { EmptyState } from './empty-state';
import { type Book } from './domain';

@Component({
    selector: 'app-book-list',
    imports: [BookCard, EmptyState],
    templateUrl: './book-list.html'
})
export class BookList {
    readonly books = input.required<readonly Book[]>();
    readonly emptyMessage = input<string>('Nothing on the list yet.');
}
