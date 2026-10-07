/* Day 33 - effects and data fetching.

   The catalogue constant is gone: the search panel talks to Open Library.

   App holds the saved list with plain useState, because today is about effects
   and bringing the reducer and the context along would have made the diff
   about three things at once. Day 35 puts them back together. */

import { useState } from "react";

import type { SearchHit } from "./lib/api";
import { Panel } from "./components/Panel";
import { EmptyState } from "./components/EmptyState";
import { Button } from "./components/Button";
import { SearchPanel } from "./components/SearchPanel";
import { EffectDemos } from "./components/EffectDemos";

interface SavedBook extends SearchHit {
    readonly addedAt: string;
}

export function App() {
    const [saved, setSaved] = useState<readonly SavedBook[]>([]);

    /* Derived, not stored. Day 20, and ReadonlySet so the lookup in each card
       is one hash rather than a scan. Day 27. */
    const savedIds: ReadonlySet<string> = new Set(saved.map((book) => book.id));

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
                    Day 33 &mdash; the catalogue is a real API now. One effect
                    that fetches, with cleanup and an abort, and four
                    demonstrations of what an effect is actually for.
                </p>
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
                            <Button small variant="quiet" onClick={() => setSaved([])}>
                                Clear
                            </Button>
                        ) : undefined
                    }
                >
                    {saved.length === 0 ? (
                        <EmptyState message="Nothing saved yet.">
                            <p className="text-sm">Search above and save a result.</p>
                        </EmptyState>
                    ) : (
                        <ul className="book-grid" id="saved-list">
                            {saved.map((book) => (
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

                <Panel id="effects" title="What an effect is for">
                    <EffectDemos />
                </Panel>
            </main>

            <footer className="app-footer">
                <p className="text-sm text-muted">
                    Week 7, Day 33 &mdash; <code>useEffect</code>, cleanup,
                    <code>AbortController</code> and the four request states.
                    Book data from Open Library.
                </p>
            </footer>
        </div>
    );
}
