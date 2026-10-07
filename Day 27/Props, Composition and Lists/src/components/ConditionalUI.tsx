/* The four ways to render something conditionally, side by side, because
   picking the wrong one is how a 0 ends up on the page.

   This component takes a deliberately awkward set of props - a count that may
   be zero, a string that may be empty, a value that may be null - because
   those are exactly the cases where the four forms stop being interchangeable. */

import type { ReactNode } from "react";
import { EmptyState } from "./EmptyState";

interface ConditionalUIProps {
    readonly count: number;
    readonly note: string;
    readonly year: number | null;
    readonly children?: ReactNode;
}

export function ConditionalUI({ count, note, year, children }: ConditionalUIProps) {
    /* 1. Early return. Best when the whole component has nothing to draw -
          the alternative is wrapping the entire body in a ternary. */
    if (count < 0) {
        return <EmptyState message="A negative count is not a state this can render." />;
    }

    return (
        <dl className="notes-list">
            <dt>1. Early return</dt>
            <dd>Used above, for the case where there is nothing to draw at all.</dd>

            {/* 2. A ternary: something to show either way. */}
            <dt>2. Ternary &mdash; something either way</dt>
            <dd>{year === null ? "Publication year unknown" : `First published ${year}`}</dd>

            {/* 3. && for "this or nothing" - with an explicit comparison, not
                   truthiness. Both of these are shown so the difference is on
                   the page rather than in a comment. */}
            <dt>3. <code>&amp;&amp;</code> &mdash; this or nothing</dt>
            <dd>
                {count > 0 && <span>{count} on the list.</span>}
                {count === 0 && <span>Nothing on the list.</span>}
            </dd>

            <dt>4. The trap</dt>
            <dd>
                {/* `{count && ...}` with count === 0 renders a literal 0,
                    because 0 is falsy *and* a valid React child. Written here
                    with the count forced to 0 so the output shows it. */}
                <span>
                    Truthy test with a zero count renders: [{0 && <span>never seen</span>}]
                </span>
                <br />
                <span>
                    Explicit test renders: [{0 > 0 ? <span>never seen</span> : null}]
                </span>
            </dd>

            <dt>5. null renders nothing</dt>
            <dd>
                {/* Returning null from a branch is the explicit "render
                    nothing". undefined and false work the same way; only
                    numbers and strings are rendered. */}
                {note.length > 0 ? <span>{note}</span> : null}
                {note.length === 0 && <span className="text-muted">(no note)</span>}
            </dd>

            {children !== undefined && (
                <>
                    <dt>6. An optional children slot</dt>
                    <dd>{children}</dd>
                </>
            )}
        </dl>
    );
}
