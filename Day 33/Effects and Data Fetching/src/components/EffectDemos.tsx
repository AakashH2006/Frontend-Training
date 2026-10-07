/* Day 33 - three effects that are not fetches, and one that should not be an
   effect at all.

   These exist because "an effect synchronises with something outside React" is
   a sentence I could repeat without being able to apply. Each of these is a
   different outside thing. */

import { useEffect, useState } from "react";
import { Button } from "./Button";

export function EffectDemos() {
    return (
        <>
            <DependencyLog />
            <WindowWidth />
            <DocumentTitle />
            <NotAnEffect />
        </>
    );
}

/* ---- 1. What the dependency array actually controls ---- */

function DependencyLog() {
    const [a, setA] = useState(0);
    const [b, setB] = useState(0);

    /* Counted in state, not in a ref.

       My first version used a ref, because writing to a ref from an effect
       does not cause a render and that felt like the careful choice. It was
       wrong, and the probe caught it: the numbers on screen never moved.

       A ref write does not re-render, so the displayed value was always the
       count as of the *previous* render - the effect had run, the ref had been
       incremented, and nothing asked React to show it. The demo looked broken
       while the effects were working perfectly.

       State is correct here, and it is safe for these two effects because
       each one's dependencies do not include the state it sets:
       the [a] effect re-runs only when `a` changes, and the [] effect never
       re-runs at all. */
    const [onARuns, setOnARuns] = useState(0);
    const [onceRuns, setOnceRuns] = useState(0);

    // [a]: runs on mount, and whenever `a` changes.
    useEffect(() => {
        setOnARuns((n) => n + 1);
    }, [a]);

    // []: runs once on mount - twice in development, because StrictMode
    // mounts, unmounts and remounts to check the cleanup.
    useEffect(() => {
        setOnceRuns((n) => n + 1);
    }, []);

    /* The third case - an effect with *no* dependency array, which runs after
       every render - is deliberately not counted on screen.

       It cannot be. Counting it in state would set state after every render,
       which causes a render, which runs the effect, which sets state. That is
       an infinite loop, and it is the commonest way to write one:

           useEffect(() => { setCount(count + 1); });   // never do this

       So it logs to the console instead, where the repeated line is the
       evidence. */
    useEffect(() => {
        console.log("[no dependency array] ran after a render");
    });

    return (
        <div className="demo">
            <h3>1. The dependency array</h3>
            <p className="text-sm text-muted">
                a = {a}, b = {b}
            </p>
            <div className="form-actions">
                <Button small onClick={() => setA((n) => n + 1)}>
                    Change a
                </Button>
                <Button small variant="quiet" onClick={() => setB((n) => n + 1)}>
                    Change b
                </Button>
            </div>
            <p className="text-sm" id="dep-counts">
                [a] effect ran: {onARuns} &middot; [] effect ran: {onceRuns}
            </p>
            <p className="text-sm text-muted">
                Changing <strong>b</strong> leaves both numbers alone. Changing{" "}
                <strong>a</strong> moves only the first. The <code>[]</code>{" "}
                count is 2 in development and 1 in a production build, because
                StrictMode remounts the component once.
            </p>
            <p className="text-sm text-muted">
                An effect with no array at all runs after every render. It is
                not counted here, because counting it in state would set state
                after every render and loop for ever &mdash; it logs to the
                console instead.
            </p>
        </div>
    );
}

/* ---- 2. Subscribing to something outside React ---- */

function WindowWidth() {
    /* This is the textbook case for an effect. The window's size is not React
       state and nothing in React knows when it changes, so the only way to
       follow it is to subscribe - and the only way to subscribe safely is to
       unsubscribe in the cleanup. */
    const [width, setWidth] = useState(() => window.innerWidth);

    useEffect(() => {
        function handleResize(): void {
            setWidth(window.innerWidth);
        }

        window.addEventListener("resize", handleResize);

        /* Without this, every mount adds another listener and none are ever
           removed. StrictMode's remount makes that two listeners immediately,
           which is how a missing cleanup becomes visible on the first run
           rather than after an hour of navigation. */
        return () => window.removeEventListener("resize", handleResize);
    }, []);

    return (
        <div className="demo">
            <h3>2. Subscribing to the outside</h3>
            <p className="text-sm" id="window-width">
                window.innerWidth is {width}px
            </p>
            <p className="text-sm text-muted">
                The window is not React state. An effect subscribes, the cleanup
                unsubscribes, and the empty dependency array is correct because
                the subscription does not depend on anything.
            </p>
        </div>
    );
}

/* ---- 3. Writing to something outside React ---- */

function DocumentTitle() {
    const [count, setCount] = useState(0);

    useEffect(() => {
        /* The document title lives outside React's tree, so keeping it in step
           with state is synchronisation and belongs in an effect.

           The cleanup restores it, which matters as soon as this component is
           one route among several - otherwise the title is left behind on the
           next page. */
        const previous = document.title;
        document.title = count === 0 ? "Day 33 | Effects" : `(${count}) Day 33 | Effects`;

        return () => {
            document.title = previous;
        };
    }, [count]);

    return (
        <div className="demo">
            <h3>3. Writing to the outside</h3>
            <div className="form-actions">
                <Button small onClick={() => setCount((n) => n + 1)}>
                    Bump the tab title ({count})
                </Button>
            </div>
            <p className="text-sm text-muted">
                The tab title is outside React, so an effect is right. The
                cleanup puts it back.
            </p>
        </div>
    );
}

/* ---- 4. The one that should not be an effect ---- */

function NotAnEffect() {
    const [first, setFirst] = useState("Ursula");
    const [last, setLast] = useState("Le Guin");

    /* What I would have written a week ago:

           const [full, setFull] = useState("");
           useEffect(() => { setFull(`${first} ${last}`); }, [first, last]);

       It works, and it is wrong three ways:

         - It renders twice per keystroke. The first render has the stale
           `full`, then the effect sets state and it renders again.
         - `full` can disagree with `first` and `last` for one render, so
           anything reading it mid-render sees the old value.
         - It is a second copy of a fact that is already known.

       The right version has no effect and no state. Day 20's rule, and
       tomorrow's whole subject. */
    const full = `${first} ${last}`.trim();

    return (
        <div className="demo">
            <h3>4. Not an effect</h3>
            <div className="toolbar">
                <div className="field">
                    <label htmlFor="first-name">First name</label>
                    <input
                        id="first-name"
                        value={first}
                        onChange={(event) => setFirst(event.target.value)}
                    />
                </div>
                <div className="field">
                    <label htmlFor="last-name">Last name</label>
                    <input
                        id="last-name"
                        value={last}
                        onChange={(event) => setLast(event.target.value)}
                    />
                </div>
            </div>
            <p className="text-sm" id="full-name">
                Derived in the render: <strong>{full}</strong>
            </p>
            <p className="text-sm text-muted">
                No effect and no state. An effect here would render twice per
                keystroke and could be one render out of date.
            </p>
        </div>
    );
}
