/* Day 21 - the entry point.

   Vite serves this file as a module, so the browser gets compiled JavaScript
   and the console output is the actual work.

   Two things here are Vite's doing rather than TypeScript's:

   `import "./styles.css"` - the dev server rewrites it to a style injection,
   and the production build pulls it out into a real stylesheet. A browser
   cannot import CSS; the bundler is what makes the line mean anything.

   `from "./everyday-types"` with no extension - this is the opposite of the
   Day 19 rule, and it took a second to accept. In a plain browser module the
   extension is required, because an import specifier is a URL and nothing
   resolves it. Here Vite resolves it, and `moduleResolution: "bundler"` in
   tsconfig.json is me telling the compiler to assume exactly that. Writing
   `./everyday-types.js` would also work, but it would name a file that does
   not exist, which I would rather not do on purpose. */

import "./styles.css";
import { run } from "./everyday-types";

console.log("=== Day 21 - TypeScript setup and everyday types ===");
console.log("Nothing below is checked at runtime. It was all checked before it ran.");

run();

/* Proof that the types are gone. Every alias, union, `readonly` and annotation
   in everyday-types.ts is erased by the compiler. What the browser receives is
   JavaScript with the type syntax stripped out - which is why none of it costs
   anything at runtime, and why none of it protects anything at runtime either. */
const output = document.getElementById("output");

if (output) {
    output.textContent =
        "Ran. Open the console (F12) - that is where the ten sections are.";
}
