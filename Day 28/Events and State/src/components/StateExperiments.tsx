/* Day 28 - the experiments.

   Four buttons that each demonstrate one thing about how state actually
   behaves. I wrote these because reading "state is a snapshot" did not mean
   anything to me until I could make the wrong version print the wrong number. */

import { useState } from "react";
import { Button } from "./Button";

export function StateExperiments() {
    const [count, setCount] = useState(0);
    const [log, setLog] = useState<readonly string[]>([]);

    function note(message: string): void {
        /* A functional update, because this appends to the previous value.
           Writing `setLog([...log, message])` would read the `log` from the
           render this handler was created in - which is the bug below, in the
           one place it is not wanted. */
        setLog((previous) => [...previous, message]);
    }

    /* ---- 1. Three increments, written the wrong way ---- */
    function tripleWrong(): void {
        /* All three read `count` from the current render's closure. `count` is
           a const captured when this render ran, so all three calls compute
           the same value and the result goes up by one, not three.

           This is the single most important thing today, and it is not a
           React quirk - it is just what a closure over a const does. */
        setCount(count + 1);
        setCount(count + 1);
        setCount(count + 1);
        note(`tripleWrong: called setCount(count + 1) three times with count = ${count}`);
    }

    /* ---- 2. The same thing, written correctly ---- */
    function tripleRight(): void {
        /* Each updater receives the value after the previous updater, so these
           compose and the count goes up by three. */
        setCount((previous) => previous + 1);
        setCount((previous) => previous + 1);
        setCount((previous) => previous + 1);
        note("tripleRight: called setCount(previous => previous + 1) three times");
    }

    /* ---- 3. State is a snapshot ---- */
    function readAfterSetting(): void {
        setCount(count + 100);

        /* `count` here is still the old value. Setting state does not change
           the variable - it schedules a re-render, and the new value appears
           in the *next* render's `count`.

           So this logs the stale number, which is correct and was not what I
           expected the first time. */
        note(`readAfterSetting: right after setCount, count is still ${count}`);
    }

    /* ---- 4. Batching ---- */
    function batched(): void {
        /* Two different pieces of state, set in one handler. React batches
           them into a single re-render rather than rendering twice - which is
           why the render counter below goes up by one per click no matter how
           many setters a handler calls.

           Since React 18 this happens inside promises and timeouts too, not
           only in event handlers. */
        setCount((previous) => previous + 1);
        note("batched: set two pieces of state, and got one re-render");
    }

    return (
        <>
            <p className="status">
                count is <strong>{count}</strong>
            </p>

            <div className="form-actions">
                <Button small onClick={tripleWrong}>
                    +3 the wrong way
                </Button>
                <Button small onClick={tripleRight}>
                    +3 the right way
                </Button>
                <Button small variant="quiet" onClick={readAfterSetting}>
                    +100 and read it
                </Button>
                <Button small variant="quiet" onClick={batched}>
                    Two setters, one render
                </Button>
                <Button
                    small
                    variant="danger"
                    onClick={() => {
                        /* Resetting two pieces of state. Both go through
                           setters; neither is assigned to. */
                        setCount(0);
                        setLog([]);
                    }}
                >
                    Reset
                </Button>
            </div>

            {log.length === 0 ? (
                <p className="text-sm text-muted">
                    Press a button. The first two differ by two, which is the whole lesson.
                </p>
            ) : (
                <ol className="notes-list">
                    {/* The index is the key here, and it is the one case where
                        that is correct: this log is append-only, so an entry's
                        position never changes and nothing is reordered or
                        removed from the middle. */}
                    {log.map((line, index) => (
                        <li key={index} className="text-sm">
                            {line}
                        </li>
                    ))}
                </ol>
            )}
        </>
    );
}
