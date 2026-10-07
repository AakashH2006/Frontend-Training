/* The empty case, as a component, because there are now three of them and they
   were three different paragraphs with three different classes.

   `children` is optional here: a hint is sometimes worth showing and usually
   not. Day 18's point was that empty is a state of its own and deserves the
   same care as the success state - this is that, made reusable. */

import type { ReactNode } from "react";

interface EmptyStateProps {
    readonly message: string;
    readonly children?: ReactNode;
}

export function EmptyState({ message, children }: EmptyStateProps) {
    return (
        <div className="empty-state">
            <p>{message}</p>
            {/* `children` is ReactNode, which includes undefined, so this
                renders nothing when nothing was passed. No guard needed. */}
            {children}
        </div>
    );
}
