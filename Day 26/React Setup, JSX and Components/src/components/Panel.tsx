/* A section with a heading, and whatever is put inside it.

   The first component here that takes `children`, and it is the one that
   taught me what composition means in React. Week 4's render.js built a panel
   by concatenating strings; this takes the content as an argument and never
   knows what it is. */

import type { ReactNode } from "react";

interface PanelProps {
    readonly title: string;
    readonly children: ReactNode;
    /* Optional, and the whole reason the heading needs an id: the <section>
       points at it with aria-labelledby, so a screen reader announces the
       region by its heading. Day 5's accessibility work, as a prop. */
    readonly id?: string;
}

/* `ReactNode` is the right type for children. It covers an element, a string, a
   number, an array of those, null, undefined and false - which matters, because
   `{condition && <Thing />}` evaluates to `false` when the condition is false,
   and that has to be a legal child.

   `ReactElement` would be wrong here. It only covers a single element, so
   `<Panel>text</Panel>` and two children side by side would both fail. */
export function Panel({ title, children, id }: PanelProps) {
    const headingId = id === undefined ? undefined : `${id}-heading`;

    return (
        <section className="panel" aria-labelledby={headingId}>
            <h2 id={headingId}>{title}</h2>
            {children}
        </section>
    );
}
