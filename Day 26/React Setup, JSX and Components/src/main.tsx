/* Day 26 - the entry point.

   Three lines of actual work, and each one is different from Week 4.

   `createRoot(...)` is the React 18+ API. The old `ReactDOM.render` is gone.
   A root is created once and `.render` is called on it, rather than rendering
   into a node each time.

   `<StrictMode>` is development-only and it is the thing that surprised me:
   it deliberately renders every component *twice*. Not a bug and not a
   performance problem in production, where it does nothing at all - it is
   there to make impure components obvious, because a component that
   accumulates into an outside variable or mutates its props produces visibly
   different output when run twice. Today's components are pure, so the double
   render changes nothing, which is the point of checking.

   `mustFind` from Day 25 is back, in spirit: getElementById returns
   `HTMLElement | null`, and `createRoot` will not take a null. Throwing here
   with the id in the message beats a `!` that fails later. */

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./App";
import "./styles.css";

const container = document.getElementById("root");

if (container === null) {
    throw new Error('Expected an element with id "root" in index.html and found none.');
}

createRoot(container).render(
    <StrictMode>
        <App />
    </StrictMode>
);
