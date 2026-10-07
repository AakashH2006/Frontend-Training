/* Day 34 - custom hooks.

   Four hooks, and the saved list finally survives a reload - which was the
   first item on Week 6's list of known limitations.

       useBookSearch      the Day 33 effect, extracted
       useLocalStorage    persistence, with all four failure modes
       useDebouncedValue  generic, used for the local filter box
       useOnlineStatus    useSyncExternalStore over the online/offline events

   What a custom hook is: a function whose name begins with `use` and which
   calls other hooks. There is no registration and nothing special about it.
   The naming convention is what React's rules-of-hooks checking relies on.

   What it is not: shared state. Each call gets its own state, because the
   `useState` inside belongs to the calling component. That is the difference
   from Day 32's context, and it is the thing I had backwards. */

import { useState } from "react";

import type { SearchHit } from "./lib/api";
import { useLocalStorage } from "./hooks/useLocalStorage";
import { useDebouncedValue } from "./hooks/useDebouncedValue";
import { useOnlineStatus } from "./hooks/useOnlineStatus";

import { Panel } from "./components/Panel";
import { EmptyState } from "./components/EmptyState";
import { Button } from "./components/Button";
import { SearchPanel } from "./components/SearchPanel";
import { NotEffects } from "./components/NotEffects";

interface SavedBook extends SearchHit {
    readonly addedAt: string;
}

/* The validator for whatever is already on disk. Week 5's storage boundary:
   that data was written by an older version of this code and is untrusted, so
   it is checked rather than cast. */
function isSavedBookArray(value: unknown): value is readonly SavedBook[] {
    return (
        Array.isArray(value) &&
        value.every((entry) => {
            if (typeof entry !== "object" || entry === null) return false;
            const candidate = entry as Record<string, unknown>;
            return (
                typeof candidate["id"] === "string" &&
                typeof candidate["title"] === "string" &&
                Array.isArray(candidate["authors"]) &&
                candidate["authors"].every((name) => typeof name === "string") &&
                typeof candidate["addedAt"] === "string"
            );
        })
    );
}

const EMPTY: readonly SavedBook[] = [];

export function App() {
    const {
        value: saved,
        setValue: setSaved,
        persistent,
        problem
    } = useLocalStorage<readonly SavedBook[]>("day34.readingList", EMPTY, isSavedBookArray);

    const online = useOnlineStatus();

    /* The local filter box. `filterText` updates on every keystroke so the
       input stays responsive; `debouncedFilter` is what the list actually
       filters by.

       This is the opposite decision from the search box, and deliberately so:
       filtering an array in memory is cheap but re-rendering a long list on
       every keystroke is not, while a network request per keystroke is
       unacceptable at any length. Same hook, different reason. */
    const [filterText, setFilterText] = useState("");
    const debouncedFilter = useDebouncedValue(filterText, 300);

    const savedIds: ReadonlySet<string> = new Set(saved.map((book) => book.id));

    const needle = debouncedFilter.trim().toLowerCase();
    const visible =
        needle.length === 0
            ? saved
            : saved.filter(
                  (book) =>
                      book.title.toLowerCase().includes(needle) ||
                      book.authors.some((name) => name.toLowerCase().includes(needle))
              );

    function save(hit: SearchHit): void {
        setSaved((previous) =>
            previous.some((book) => book.id === hit.id)
                ? previous
                : [{ ...hit, addedAt: new Date().toISOString() }, ...previous]
        );
    }

    return (
        <div className="page">
            <header className="app-header">
                <h1>Reading List</h1>
                <p className="text-muted">
                    Day 34 &mdash; four custom hooks. The list is kept in this
                    browser now, so it survives a reload.
                </p>

                {/* Three different pieces of status, each from a different
                    hook, and none of them stored twice. */}
                <p className="status" id="storage-note" role="status">
                    {problem ??
                        (persistent
                            ? "Saved in this browser. The list will still be here after a reload."
                            : "This browser is blocking local storage, so the list will be lost on reload.")}
                </p>

                {/* Rendered only when offline. `&&` is right here, because
                    there is nothing to say when everything is fine. */}
                {!online && (
                    <p className="status status--error" id="offline-note" role="status">
                        You are offline. Searching will not work until the
                        connection comes back; the saved list still will.
                    </p>
                )}
            </header>

            <main id="main">
                <Panel id="search" title="Search">
                    <SearchPanel savedIds={savedIds} onSave={save} />
                </Panel>

                <Panel
                    id="saved"
                    title="Your list"
                    actions={
                        saved.length > 0 ? (
                            <Button small variant="quiet" onClick={() => setSaved(EMPTY)}>
                                Clear
                            </Button>
                        ) : undefined
                    }
                >
                    {saved.length > 0 && (
                        <div className="toolbar">
                            <div className="field">
                                <label htmlFor="saved-filter">Filter your list</label>
                                <input
                                    id="saved-filter"
                                    type="search"
                                    value={filterText}
                                    onChange={(event) => setFilterText(event.target.value)}
                                    placeholder="title or author"
                                    autoComplete="off"
                                />
                            </div>
                        </div>
                    )}

                    <p className="text-sm text-muted" id="shown-count">
                        Showing {visible.length} of {saved.length}.
                        {filterText !== debouncedFilter && " Filtering…"}
                    </p>

                    {saved.length === 0 ? (
                        <EmptyState message="Nothing saved yet.">
                            <p className="text-sm">Search above and save a result.</p>
                        </EmptyState>
                    ) : visible.length === 0 ? (
                        <EmptyState message="No saved book matches that filter." />
                    ) : (
                        <ul className="book-grid" id="saved-list">
                            {visible.map((book) => (
                                <li className="book-card" key={book.id}>
                                    <h3 className="book-card__title">{book.title}</h3>
                                    <p className="book-card__meta">
                                        {book.authors.length === 0
                                            ? "Author unknown"
                                            : book.authors.join(", ")}
                                    </p>
                                    <p className="book-card__actions">
                                        <Button
                                            small
                                            variant="danger"
                                            onClick={() =>
                                                setSaved((previous) =>
                                                    previous.filter((entry) => entry.id !== book.id)
                                                )
                                            }
                                        >
                                            Remove
                                        </Button>
                                    </p>
                                </li>
                            ))}
                        </ul>
                    )}
                </Panel>

                <Panel id="noteffects" title="Four effects I removed">
                    <NotEffects items={saved.map((book) => ({ id: book.id, title: book.title }))} />
                </Panel>
            </main>

            <footer className="app-footer">
                <p className="text-sm text-muted">
                    Week 7, Day 34 &mdash; custom hooks, and the effects that
                    should not have been effects.
                </p>
            </footer>
        </div>
    );
}

/* `filterText !== debouncedFilter && " Filtering…"` is a small thing I like:
   it is a derived value that exists only because the two are separate, and it
   tells the user the list is one keystroke behind rather than leaving them to
   wonder. No extra state for it. */
