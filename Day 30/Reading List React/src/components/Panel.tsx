/* Day 26's Panel, with one addition: an `actions` slot.

   This is the bit of composition I wanted to understand. A panel sometimes has
   controls beside its heading. Three ways to allow that:

     1. A pile of props - `showClearButton`, `onClear`, `clearLabel` - and the
        panel ends up knowing about every button any caller might want. Every
        new control is a new prop and a new branch.

     2. One `actions` prop typed as ReactNode. The panel places it and knows
        nothing about it.

     3. Two sets of children, which JSX cannot express - there is only one
        `children`.

   Option 2. A prop can hold an element, because elements are just values, and
   that is the whole trick: `actions` is a second children slot with a name. */

import type { ReactNode } from "react";

interface PanelProps {
    readonly title: string;
    readonly children: ReactNode;
    readonly id?: string;
    /* Optional, because most panels have no controls. */
    readonly actions?: ReactNode;
}

export function Panel({ title, children, id, actions }: PanelProps) {
    const headingId = id === undefined ? undefined : `${id}-heading`;

    return (
        <section className="panel" aria-labelledby={headingId}>
            <div className="panel__head">
                <h2 id={headingId}>{title}</h2>
                {/* `!== undefined` rather than `{actions && ...}`. An empty
                    string or 0 passed as actions would be falsy and would
                    skip the wrapper, which is the Day 26 trap. */}
                {actions !== undefined && <div className="panel__actions">{actions}</div>}
            </div>
            {children}
        </section>
    );
}
