/* Day 27 - props and composition.

   Still no state: every handler below logs and does nothing else, and wiring
   them to real state is Day 28. Passing a function as a prop is a props
   lesson; what the function does is a state lesson.

       App
       ├── Panel "Search results"   actions={<Button/>}
       │   └── BookList variant="result"
       │       └── BookCard variant="result"  (Badge, Button)
       ├── Panel "Your list"
       │   ├── SummaryBar  -> Stat
       │   └── BookList variant="saved"
       │       └── BookCard variant="saved"
       └── Panel "Conditional rendering"
           └── ConditionalUI */

import { BOOKS, type Book, STATUSES, STATUS_LABELS } from "./data";
import { Panel } from "./components/Panel";
import { Button } from "./components/Button";
import { Stat } from "./components/Stat";
import { BookList } from "./components/BookList";
import { ConditionalUI } from "./components/ConditionalUI";

/* Two slices of the same static data, so both card variants are on the page.
   On Day 30 these come from state; today they are constants. */
const RESULTS: readonly Book[] = BOOKS;
const SAVED: readonly Book[] = BOOKS.slice(0, 2);
const SAVED_IDS: ReadonlySet<string> = new Set(SAVED.map((book) => book.id));

/* SummaryBar, now composed out of Stat rather than repeating the markup. It
   still derives its counts rather than being handed them. */
function SummaryBar({ books }: { readonly books: readonly Book[] }) {
    return (
        <ul className="summary">
            <Stat label="On the list" value={books.length} />
            {STATUSES.map((status) => (
                <Stat
                    key={status}
                    label={STATUS_LABELS[status]}
                    value={books.filter((book) => book.status === status).length}
                />
            ))}
        </ul>
    );
}

export function App() {
    return (
        <div className="page">
            <header className="app-header">
                <h1>Reading List</h1>
                <p className="text-muted">
                    Day 27 &mdash; typed props, composition and conditional UI.
                    The buttons log to the console; they get real behaviour on
                    Day 28.
                </p>
            </header>

            <main id="main">
                <Panel
                    id="results"
                    title="Search results"
                    /* The `actions` slot: a prop holding an element. The panel
                       places it and knows nothing about it, which is why it
                       needed no new props to gain a button. */
                    actions={
                        <Button variant="quiet" small onClick={() => console.log("clear results")}>
                            Clear
                        </Button>
                    }
                >
                    <BookList
                        variant="result"
                        books={RESULTS}
                        savedIds={SAVED_IDS}
                        emptyMessage="No results yet."
                        onSave={(id) => console.log("save", id)}
                    />
                </Panel>

                <Panel id="saved" title="Your list">
                    <SummaryBar books={SAVED} />
                    <BookList
                        variant="saved"
                        books={SAVED}
                        emptyMessage="Nothing saved yet."
                        onRemove={(id) => console.log("remove", id)}
                    />
                </Panel>

                <Panel id="conditions" title="Conditional rendering">
                    <ConditionalUI count={0} note="" year={null}>
                        <span className="text-sm text-muted">
                            Passed in as children, so this line is the caller&rsquo;s
                            and not the component&rsquo;s.
                        </span>
                    </ConditionalUI>
                </Panel>

                <Panel id="empty" title="The empty case">
                    {/* The same BookList with an empty array, so the empty
                        branch is on the page rather than only in the code. A
                        path that is never exercised is a path that does not
                        work - Day 18. */}
                    <BookList
                        variant="saved"
                        books={[]}
                        emptyMessage="This list is deliberately empty."
                        onRemove={(id) => console.log("remove", id)}
                    />
                </Panel>
            </main>

            <footer className="app-footer">
                <p className="text-sm text-muted">
                    Week 6, Day 27 &mdash; eight components, no state.
                </p>
            </footer>
        </div>
    );
}
