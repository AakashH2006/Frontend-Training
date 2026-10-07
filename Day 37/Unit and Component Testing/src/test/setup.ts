/* Day 37 - test setup, run before every test file.

   Three things, and the third one is the one I would have forgotten. */

import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

/* The Vitest-specific entry point. It calls `expect.extend` *and* declares the
   matchers on Vitest's Assertion interface, so `toBeInTheDocument()` both
   works at runtime and typechecks.

   My first version imported the matchers and called `expect.extend(matchers)`
   by hand. That works at runtime and `tsc` then rejects every matcher, because
   nothing had told TypeScript they exist. Importing from "/vitest" does both
   halves. */
import "@testing-library/jest-dom/vitest";

/* The matchers above are what make a failure message say "expected the element
   to be disabled" rather than "expected false to be true". */

/* 1. Unmount anything rendered, after every test.

      Without this, each render appends another copy of the component to the
      same document, and `getByRole("button", { name: "Save" })` then fails
      with "found multiple elements" in the *second* test - which looks like a
      bug in the second test and is caused by the first. */
afterEach(() => {
    cleanup();
});

/* 2. jsdom does not implement everything the app touches.

      `matchMedia` is the one the stylesheet's prefers-reduced-motion query
      would need if anything read it from JavaScript, and it is absent in
      jsdom. Stubbing it here rather than in each test keeps the tests about
      behaviour rather than about the environment. */
if (typeof window !== "undefined" && window.matchMedia === undefined) {
    Object.defineProperty(window, "matchMedia", {
        writable: true,
        value: (query: string) => ({
            matches: false,
            media: query,
            onchange: null,
            addListener: () => {},
            removeListener: () => {},
            addEventListener: () => {},
            removeEventListener: () => {},
            dispatchEvent: () => false
        })
    });
}
