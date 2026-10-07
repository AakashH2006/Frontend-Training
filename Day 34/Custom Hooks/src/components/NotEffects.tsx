/* Day 34 - four effects I removed, and why.

   "You Might Not Need an Effect" is the day's reading, and these are the four
   patterns from it that I had actually written at some point this fortnight. */

import { useMemo, useState } from "react";
import { Button } from "./Button";

interface Item {
    readonly id: string;
    readonly title: string;
}

interface NotEffectsProps {
    readonly items: readonly Item[];
}

export function NotEffects({ items }: NotEffectsProps) {
    return (
        <>
            <DerivedNotStored items={items} />
            <ExpensiveButStillDerived items={items} />
            <ResetByKey />
            <EventNotEffect />
        </>
    );
}


/* ---- 1. Derived state ---- */

function DerivedNotStored({ items }: NotEffectsProps) {
    const [query, setQuery] = useState("");

    /* What I would have written a fortnight ago:

           const [filtered, setFiltered] = useState(items);
           useEffect(() => {
               setFiltered(items.filter((i) => i.title.includes(query)));
           }, [items, query]);

       Three problems: it renders twice per keystroke, `filtered` is one render
       out of date in between, and it is a second copy of a fact already known. */
    const filtered = items.filter((item) =>
        item.title.toLowerCase().includes(query.trim().toLowerCase())
    );

    return (
        <div className="demo">
            <h3>1. Derived state needs no effect</h3>
            <div className="field">
                <label htmlFor="derived-query">Filter</label>
                <input
                    id="derived-query"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    autoComplete="off"
                />
            </div>
            <p className="text-sm" id="derived-count">
                {filtered.length} of {items.length} match.
            </p>
            <p className="text-sm text-muted">
                One source of truth, calculated during the render. No effect and
                no second piece of state.
            </p>
        </div>
    );
}


/* ---- 2. Expensive, and still not an effect ---- */

function ExpensiveButStillDerived({ items }: NotEffectsProps) {
    const [query, setQuery] = useState("");
    const [renders, setRenders] = useState(0);
    /* The factory logs rather than incrementing a counter I render.

       My first version kept a module-level count and displayed it, which is a
       mutable read during render - impure, and exactly what every other file
       this fortnight avoids. Counting it in state is worse: setting state from
       inside a memo factory is not allowed. A log is the honest way to make
       "this did not re-run" observable without pretending the render is pure
       when it is not. */
    const sorted = useMemo(() => {
        console.log("[useMemo] sorting - dependencies changed");
        return items
            .filter((item) => item.title.toLowerCase().includes(query.toLowerCase()))
            .toSorted((a, b) => a.title.localeCompare(b.title));
    }, [items, query]);

    return (
        <div className="demo">
            <h3>2. Expensive derivation: useMemo, not an effect</h3>
            <div className="field">
                <label htmlFor="memo-query">Filter and sort</label>
                <input
                    id="memo-query"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    autoComplete="off"
                />
            </div>
            <p className="text-sm" id="memo-first">
                First alphabetically: {sorted[0]?.title ?? "(none)"}
            </p>
            <div className="form-actions">
                <Button small variant="quiet" onClick={() => setRenders((n) => n + 1)}>
                    Force a re-render ({renders})
                </Button>
            </div>
            <p className="text-sm text-muted">
                Forcing a re-render does not redo the sort &mdash; the console
                stays quiet &mdash; because neither dependency changed. An
                effect would have redone it and then rendered again.
            </p>
            <p className="text-sm text-muted">
                The honest caveat: this derivation is not actually expensive.
                Wrapping a cheap filter in <code>useMemo</code> costs a
                dependency comparison to save nothing.
            </p>
        </div>
    );
}


/* ---- 3. Resetting state when a prop changes ---- */

function ResetByKey() {
    const [selected, setSelected] = useState("ada");

    return (
        <div className="demo">
            <h3>3. Resetting state: key, not an effect</h3>
            <div className="form-actions">
                {["ada", "grace", "katherine"].map((name) => (
                    <Button
                        key={name}
                        small
                        variant={name === selected ? "primary" : "quiet"}
                        onClick={() => setSelected(name)}
                    >
                        {name}
                    </Button>
                ))}
            </div>

            {/* Day 30's trick. The effect version -
                `useEffect(() => setDraft(""), [selected])` - renders once with
                the previous person's draft still in the box and then clears
                it. With a key there is no such render, because it is a
                different component. */}
            <NoteDraft key={selected} person={selected} />

            <p className="text-sm text-muted">
                Type a note, then switch person. The draft is empty, and it was
                never briefly wrong.
            </p>
        </div>
    );
}

function NoteDraft({ person }: { readonly person: string }) {
    const [draft, setDraft] = useState("");

    return (
        <div className="field">
            <label htmlFor="note-draft">Note about {person}</label>
            <input
                id="note-draft"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder="Type something, then switch person"
                autoComplete="off"
            />
            <p className="text-sm" id="draft-value">
                draft: {draft.length === 0 ? "(empty)" : draft}
            </p>
        </div>
    );
}


/* ---- 4. An event is not an effect ---- */

function EventNotEffect() {
    const [count, setCount] = useState(0);
    const [log, setLog] = useState<readonly string[]>([]);

    /* What I would have written:

           useEffect(() => {
               if (count > 0) setLog((l) => [...l, `count became ${count}`]);
           }, [count]);

       It works, and it is the wrong place. The log entry belongs to the
       *click*, not to the count having changed - and the difference shows the
       moment something else changes the count, or the component remounts with
       a non-zero count and logs an event that never happened.

       StrictMode makes the second case visible: an effect like that fires
       again on the remount, so the log gains an entry nobody caused. */
    function handleClick(): void {
        const next = count + 1;
        setCount(next);
        setLog((previous) => [...previous, `clicked, count is now ${next}`]);
    }

    return (
        <div className="demo">
            <h3>4. An event is not an effect</h3>
            <div className="form-actions">
                <Button small onClick={handleClick}>
                    Click ({count})
                </Button>
                <Button small variant="quiet" onClick={() => setLog([])}>
                    Clear log
                </Button>
            </div>
            <p className="text-sm" id="event-log">
                {log.length === 0 ? "Nothing logged." : `${log.length} logged: ${log.at(-1)}`}
            </p>
            <p className="text-sm text-muted">
                Both state changes happen in the handler, because both are
                caused by the click. Two setters, one render &mdash; React
                batches them.
            </p>
        </div>
    );
}
