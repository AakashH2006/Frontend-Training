/* Day 37 - the entry point. Unchanged.

   Unchanged from Day 26 apart from this comment. The root, StrictMode and the
   null check are all still the same three decisions, and none of them depend
   on what App contains. */

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
