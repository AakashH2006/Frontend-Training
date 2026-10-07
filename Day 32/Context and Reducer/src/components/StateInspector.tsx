/* The state, on the page.

   This is here because normalising is the one change today that makes the
   state harder to picture. An array of books is obvious; `byId` plus `ids` is
   two things that have to agree, and I wanted to be able to see them agreeing
   rather than trust that they do.

   It also shows the thing that sold me on the reducer: the whole state is one
   serialisable object, so "what is the app's state right now" has a literal
   answer. Day 30's five useState calls had no such answer. */

import type { AppState } from "../state/reducer";

interface StateInspectorProps {
    readonly state: AppState;
}

export function StateInspector({ state }: StateInspectorProps) {
    const idsInById = Object.keys(state.list.byId);

    /* The invariant, checked on screen. If a reducer case ever updates `byId`
       without updating `ids`, this line says so immediately - which is the
       cost of normalising, made visible rather than left to be discovered. */
    const consistent =
        idsInById.length === state.list.ids.length &&
        state.list.ids.every((id) => state.list.byId[id] !== undefined);

    return (
        <>
            <dl className="notes-list">
                <dt>ids (the order)</dt>
                <dd>
                    <code>{state.list.ids.length === 0 ? "[]" : JSON.stringify(state.list.ids)}</code>
                </dd>

                <dt>byId (the data)</dt>
                <dd>
                    <code>
                        {idsInById.length === 0 ? "{}" : `{ ${idsInById.join(", ")} }`}
                    </code>
                </dd>

                <dt>query / filter / sort</dt>
                <dd>
                    <code>
                        {JSON.stringify(state.query)} / {state.filter} / {state.sort}
                    </code>
                </dd>

                <dt>editingId</dt>
                <dd>
                    <code>{state.editingId === null ? "null" : state.editingId}</code>
                </dd>
            </dl>

            <p
                className={`status${consistent ? "" : " status--error"}`}
                role="status"
                id="invariant"
            >
                {consistent
                    ? `ids and byId agree (${state.list.ids.length} ${state.list.ids.length === 1 ? "entry" : "entries"}).`
                    : "ids and byId disagree - a reducer case updated one and not the other."}
            </p>

            <details>
                <summary className="text-sm">The whole state object</summary>
                <pre>
                    <code>{JSON.stringify(state, null, 2)}</code>
                </pre>
            </details>
        </>
    );
}
