/* Day 32 - the reducer behind a context.

   Day 31 passed `dispatch` down through props. That was fine with a tree three
   levels deep, and it was already showing the shape of the problem: `App`
   built ten inline arrows and handed them to components that only forwarded
   them.

   Context fixes the plumbing. What it is *not* is a state manager - it holds
   no state of its own and has no update logic. It is a way for a value to skip
   the levels of the tree that do not care about it. The state still lives in a
   `useReducer`; the context only decides who can reach it. */

import {
    createContext,
    useContext,
    useMemo,
    useReducer,
    type Dispatch,
    type ReactNode
} from "react";

import {
    INITIAL_STATE,
    reducer,
    selectCounts,
    selectEditing,
    selectIsDuplicate,
    selectVisible,
    type Action,
    type AppState
} from "./reducer";

/* ---------------------------------------------------------------
   Two contexts, not one
   --------------------------------------------------------------- */

/* This is the decision the day turns on.

   The obvious version is one context holding `{ state, dispatch }`. It works,
   and it means every consumer re-renders whenever *either* changes - so a
   component that only dispatches (a Remove button) re-renders on every
   keystroke in the filter box, because the state object is new.

   Splitting them fixes it for free, because `dispatch` is referentially stable
   for the lifetime of the provider. A dispatch-only consumer subscribes to a
   value that never changes, so it never re-renders from the context.

   `null` as the default rather than a fake state. A missing provider is a
   programming error, and the hooks below turn it into a loud one instead of a
   component silently reading an empty list. */
const StateContext = createContext<AppState | null>(null);
const DispatchContext = createContext<Dispatch<Action> | null>(null);


/* ---------------------------------------------------------------
   The provider
   --------------------------------------------------------------- */

interface ListProviderProps {
    readonly children: ReactNode;
    /* Only for tests and for the inspector panel, which mounts a second,
       independent provider to show that the state is per-provider and not
       global. Optional, so normal use is just <ListProvider>. */
    readonly initialState?: AppState;
}

export function ListProvider({ children, initialState = INITIAL_STATE }: ListProviderProps) {
    const [state, dispatch] = useReducer(reducer, initialState);

    return (
        /* Nested providers, one value each. The nesting order does not matter
           and neither value depends on the other. */
        <DispatchContext.Provider value={dispatch}>
            <StateContext.Provider value={state}>{children}</StateContext.Provider>
        </DispatchContext.Provider>
    );
}

/* No `useMemo` on either value, deliberately:

     - `dispatch` is already stable. Wrapping it would do nothing.
     - `state` is a new object exactly when the state has changed, which is
       exactly when consumers should re-render. Memoising it would be
       memoising on itself.

   `useMemo` would be needed if the value were an object literal built here -
   `value={{ state, dispatch }}` is a new object on every render even when
   nothing changed, which is the usual reason context examples reach for it.
   Splitting the contexts removes the need instead of working around it. */


/* ---------------------------------------------------------------
   The hooks - the whole public API
   --------------------------------------------------------------- */

/* Consumers never touch `useContext` or the context objects, which is why
   neither is exported. That is the "keep the provider API small" part: this
   module exports a provider and four hooks, and the shape of the state behind
   them is nobody else's business.

   The throw is the point. Without it, `useContext` returns null outside a
   provider and the error arrives later as "cannot read properties of null"
   somewhere in a component that is not the problem. This is Day 25's
   `mustFind` reasoning applied to context. */
export function useListState(): AppState {
    const state = useContext(StateContext);

    if (state === null) {
        throw new Error("useListState must be used inside a <ListProvider>.");
    }

    return state;
}

export function useListDispatch(): Dispatch<Action> {
    const dispatch = useContext(DispatchContext);

    if (dispatch === null) {
        throw new Error("useListDispatch must be used inside a <ListProvider>.");
    }

    return dispatch;
}


/* A selector hook, so a component asks for what it needs rather than for the
   whole state. `useMemo` here is real: `selectVisible` filters and sorts, and
   without it that work happens on every render of every consumer rather than
   when its inputs change.

   The dependency array is the four fields the selector actually reads, not
   `[state]` - which would be the whole object and would invalidate on any
   change at all, making the memo pointless. */
export function useVisibleBooks() {
    const state = useListState();

    return useMemo(
        () => selectVisible(state),
        [state.list, state.query, state.filter, state.sort]
    );
}

export function useListView() {
    const state = useListState();

    return {
        editing: selectEditing(state),
        counts: selectCounts(state),
        total: state.list.ids.length,
        query: state.query,
        filter: state.filter,
        sort: state.sort,
        isDuplicate: (exceptId: string | null) => selectIsDuplicate(state, exceptId)
    };
}

/* `useListView` returns a fresh object every render and is not memoised, which
   is fine because nothing depends on its identity - it is destructured
   immediately at every call site. Memoising it would cost a comparison and
   save nothing.

   That is the distinction I kept getting wrong: memoise expensive *work*
   (`selectVisible`), not cheap object creation. */
