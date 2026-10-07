/* Day 22 - the entry point.

   Same shape as Day 21: Vite serves this, the console is where the work is. */

import "./styles.css";
import { run } from "./narrowing";

console.log("=== Day 22 - functions and narrowing ===");

run();

const output = document.getElementById("output");

if (output) {
    output.textContent =
        "Ran. Open the console (F12) - twelve sections, from typing a parameter to asserting a type.";
}
