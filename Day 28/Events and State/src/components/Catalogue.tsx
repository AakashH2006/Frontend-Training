/* The "search results" half, standing in for an API until Week 7.

   It takes the catalogue and which ids are already saved, and reports a click
   upwards. It holds no state of its own - everything it shows is derived from
   its props, which is the Day 26 rule and the reason this component is three
   lines of logic. */

import { type Book } from "../data";
import { Button } from "./Button";

interface CatalogueProps {
    readonly books: readonly Book[];
    readonly savedIds: ReadonlySet<string>;
    readonly onAdd: (book: Book) => void;
}

export function Catalogue({ books, savedIds, onAdd }: CatalogueProps) {
    return (
        <ul className="book-grid">
            {books.map((book) => {
                const alreadySaved = savedIds.has(book.id);

                return (
                    <li key={book.id} className="book-card">
                        <h3 className="book-card__title">{book.title}</h3>
                        <p className="book-card__meta">
                            {book.authors.length === 0 ? "Author unknown" : book.authors.join(", ")}
                        </p>
                        <p className="book-card__actions">
                            <Button small disabled={alreadySaved} onClick={() => onAdd(book)}>
                                {alreadySaved ? "On your list" : "Add"}
                            </Button>
                        </p>
                    </li>
                );
            })}
        </ul>
    );
}
