/* Day 35 - the provider, with persistence.

   Day 32's two contexts, plus the one thing the week was missing: the list is
   written to storage when it changes and read back on load.

   The notice is the part I would have skipped. "Saved" and "could not be
   saved" and "one row was unreadable" are three different things to tell the
   user, and Week 4 told them none of it because every failure went to the
   console. */

import {
    createContext,
    useContext,
    useEffect,
    useMemo,
    useReducer,
    useRef,
    useState,
    type Dispatch,
    type ReactNode
} from "react";

import {
    reducer,
    selectAll,
    selectCounts,
    selectEditing,
    selectIsDuplicate,
    selectVisible,
    type Action,
    type AppState
} from "./reducer";

import { readStoredList, storageAvailable, writeStoredList } from "./persistence";

const StateContext = createContext<AppState | null>(null);
const DispatchContext = createContext<Dispatch<Action> | null>(null);
const NoticeContext = createContext<string | null>(null);

/* Three contexts now, and the third one is the reason to keep splitting them
   rather than bundling into `{ state, dispatch, notice }`:

     - `dispatch` never changes, so dispatch-only consumers never re-render.
     - `state` changes when the state changes.
     - `notice` changes almost never.

   Bundled, the header's notice line would re-render on every keystroke in the
   filter box. Split, it re-renders when the notice changes. */

interface ListProviderProps {
    readonly children: ReactNode;
}

export function ListProvider({ children }: ListProviderProps) {
    /* `useReducer`'s third argument is an init function, run once. The second
       argument is ignored when it is present, which is why it is `undefined`.

       This is where the stored list is read: once, before the first render, so
       there is no flash of an empty list and no second source of truth. Day
       34's lesson, in the reducer's own API rather than in a hook. */
    const [loaded] = useState(readStoredList);
    const [state, dispatch] = useReducer(reducer, undefined, () => loaded.state);

    const [notice, setNotice] = useState<string | null>(loaded.notice);

    /* The books in storage order. Derived from state, so the effect below has
       one thing to depend on. */
    const books = useMemo(() => selectAll(state), [state.list]);

    /* A ref to skip the write on the very first run.

       Without it, mounting writes the list straight back to storage - which is
       harmless in content but means a corrupt entry that was just skipped gets
       silently overwritten with the cleaned-up version before the user has
       seen the notice about it. Worse, under StrictMode's double mount it
       writes twice on load. */
    const hydrated = useRef(false);

    useEffect(() => {
        if (!hydrated.current) {
            hydrated.current = true;
            return;
        }

        const result = writeStoredList(books);
        if (!result.ok) setNotice(result.notice);
    }, [books]);

    return (
        <DispatchContext.Provider value={dispatch}>
            <NoticeContext.Provider value={notice}>
                <StateContext.Provider value={state}>{children}</StateContext.Provider>
            </NoticeContext.Provider>
        </DispatchContext.Provider>
    );
}


/* ---------------------------------------------------------------
   The public API: hooks only
   --------------------------------------------------------------- */

export function useListState(): AppState {
    const state = useContext(StateContext);
    if (state === null) throw new Error("useListState must be used inside a <ListProvider>.");
    return state;
}

export function useListDispatch(): Dispatch<Action> {
    const dispatch = useContext(DispatchContext);
    if (dispatch === null) throw new Error("useListDispatch must be used inside a <ListProvider>.");
    return dispatch;
}

export function useStorageNotice(): { readonly notice: string | null; readonly persistent: boolean } {
    return { notice: useContext(NoticeContext), persistent: storageAvailable };
}

/* Memoised on the four fields the selector reads, not on `state` - which would
   invalidate on every change and make the memo pointless. Day 32. */
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
        savedIds: useMemo(() => new Set(state.list.ids), [state.list.ids]),
        query: state.query,
        filter: state.filter,
        sort: state.sort,
        isDuplicate: (exceptId: string | null) => selectIsDuplicate(state, exceptId)
    };
}

/* `savedIds` is memoised and the rest is not, which looks inconsistent and is
   not: a Set is rebuilt from scratch and is passed down as a prop, so its
   identity matters. The other fields are either primitives or already
   memoised upstream. Memoise what is expensive or what is compared - not
   everything. */
