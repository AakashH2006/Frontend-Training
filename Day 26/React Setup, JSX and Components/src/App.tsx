/* Day 26 - the component tree.

   App composes and nothing else. It holds no state (there is none today),
   fetches nothing, and contains no markup beyond the layout wrapper - so the
   shape of the page is readable in one screen:

       App
       ├── Header
       ├── Panel "Your list"
       │   ├── SummaryBar
       │   └── BookList
       │       └── BookCard  (one per book)
       └── Panel "What JSX compiles to"
           └── JsxNotes

   That tree is the thing I was trying to see today. Week 4's render.js had the
   same structure and it was implicit in the order the functions called each
   other; here it is the file. */

import { BOOKS } from "./data";
import { Header } from "./components/Header";
import { Panel } from "./components/Panel";
import { BookList } from "./components/BookList";
import { SummaryBar } from "./components/SummaryBar";
import { JsxNotes } from "./components/JsxNotes";

export function App() {
    return (
        <div className="page">
            <Header />

            <main id="main">
                <Panel id="list" title="Your list">
                    <SummaryBar books={BOOKS} />
                    <BookList books={BOOKS} />
                </Panel>

                <Panel id="jsx" title="What JSX compiles to">
                    <JsxNotes />
                </Panel>
            </main>

            <footer className="app-footer">
                <p className="text-sm text-muted">
                    Week 6, Day 26 &mdash; React + TypeScript with Vite. Static
                    data; state starts on Day 28.
                </p>
            </footer>
        </div>
    );
}

/* Two things about <Panel id="list" title="Your list"> that are worth writing
   down because they are the whole of "props":

   1. `title="Your list"` is a string attribute; `books={BOOKS}` is an
      expression in braces. Braces mean "this is TypeScript, evaluate it".
      `books="BOOKS"` would pass the literal string and fail to typecheck,
      which is a mistake the types catch and plain JSX would not.

   2. The children between the tags arrive as the `children` prop. So
      <Panel><SummaryBar/><BookList/></Panel> passes an array of two elements -
      and Panel renders them without knowing what either one is. */
