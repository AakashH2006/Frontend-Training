/* `vitest/config`, not `vite`. It re-exports defineConfig with the `test`
   property declared, so the block below typechecks. Importing from "vite"
   happens to work while vitest's types are in scope and is not the documented
   way round. */
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

/* Day 37 - the config now has a `test` block.

   Vitest reuses this file, which is the reason it was worth choosing over Jest
   here: the aliases, the plugins and the TypeScript handling are already
   configured for the app, so the tests compile exactly the same way the app
   does. A separate Jest config would be a second place for those to drift. */
export default defineConfig({
    plugins: [react()],
    test: {
        /* The tests run against jsdom rather than Node, because component
           tests need a document. It is the same jsdom I had been driving by
           hand all fortnight - Testing Library is the part that was missing,
           not the DOM. */
        environment: "jsdom",

        /* Run before each test file: registers the jest-dom matchers and
           clears the DOM between tests. */
        setupFiles: ["./src/test/setup.ts"],

        /* `globals: false` is the default and I kept it: `describe`, `it` and
           `expect` are imported in every test file.

           It is more typing and it means a test file has no hidden
           dependencies - which matters because the same file has to typecheck
           under the app's tsconfig. With globals on, tsc needs an extra
           `types` entry and the editor and the runner can disagree about what
           exists. */
        globals: false,

        /* Only files named *.test.ts(x). Without this, Vitest would also pick
           up anything matching its default spec patterns. */
        include: ["src/**/*.test.{ts,tsx}"],

        css: false
    }
});
