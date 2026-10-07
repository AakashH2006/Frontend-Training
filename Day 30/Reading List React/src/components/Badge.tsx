/* A status pill. Three lines of markup, and it exists so that the mapping from
   a Status to a colour is written once.

   Before this component, that mapping lived in BookCard as a template string:
   `badge badge--${book.status}`. That works and it is invisible to the
   compiler - a typo in the status would produce a class that matches no rule
   and a pill with no colour, which is Week 4's missing-badge bug exactly. */

import { type Status, STATUS_LABELS } from "../data";

interface BadgeProps {
    readonly status: Status;
}

const BADGE_CLASS: Record<Status, string> = {
    unread: "badge",
    reading: "badge badge--reading",
    finished: "badge badge--finished"
};

export function Badge({ status }: BadgeProps) {
    return <span className={BADGE_CLASS[status]}>{STATUS_LABELS[status]}</span>;
}
