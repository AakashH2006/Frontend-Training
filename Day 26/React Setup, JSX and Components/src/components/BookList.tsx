/* The list. Takes books, renders cards, and owns the empty case.

   Splitting this from BookCard is not decoration. BookList knows there is a
   collection and that a collection can be empty; BookCard knows what one book
   looks like and nothing about there being others. Neither has to change when
   the other does. */

import { type Book } from "../data";
import { BookCard } from "./BookCard";

interface BookListProps {
    readonly books: readonly Book[];
}

export function BookList({ books }: BookListProps) {
    /* An early return for the empty state. Day 18's lesson was that empty is a
       state of its own and not an error, and in a component it is simply a
       different thing to return. */
    if (books.length === 0) {
        return <p className="empty-state">Nothing on the list yet.</p>;
    }

    return (
        <ul className="book-grid">
            {/* `key` is the thing I would have skipped today and paid for on
                Day 28. It is not a prop the component receives - BookCard
                never sees it - it is how React matches an element in this
                render against the same element in the last one.

                `book.id` because it is stable and unique. The index would
                compile and would be wrong the moment the list is reordered or
                an item is removed from the middle: React would keep the DOM
                node and swap the data underneath it, so any state attached to
                that node - a focused input, a half-typed note - would end up
                on the wrong row. */}
            {books.map((book) => (
                <BookCard key={book.id} book={book} />
            ))}
        </ul>
    );
}

/* Why `.map` and not a `for` loop: JSX children can be an array, and `map`
   produces one. A `for` loop would need an array to push into and a variable
   to hold it, which is the same thing with more steps - and Week 4's
   DocumentFragment is gone entirely, because React is doing the batching. */
