/* Day 39 - the build config.

   Everything here is about the difference between `npm run dev` and a real
   deployment, and most of it is the base path. */

import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

/* GitHub Pages serves a project site from a subdirectory:

       https://<user>.github.io/<repo>/

   ...so every asset URL has to start with "/<repo>/". Vite writes absolute
   paths into index.html at build time, so this has to be known when the build
   runs, not at runtime.

   Getting it wrong is the classic first-deploy failure: index.html loads, asks
   for /assets/index-abc.js, GitHub Pages looks at the domain root, and the
   page is blank with a 404 in the console and no error anywhere visible.

   It is read from an environment variable so the same source deploys to a
   subdirectory, to a domain root (Netlify, Vercel) and to the dev server,
   without editing a file. */
const base = process.env["VITE_BASE"] ?? "/";

/* `process` needs @types/node, which is now a devDependency purely for this
   one line. Worth noting that it is a *build-time* type: nothing in src/ may
   touch `process`, because none of it runs in Node. */

export default defineConfig({
    base,

    plugins: [react()],

    build: {
        /* Source maps in production. They cost build time and a few hundred KB
           of files nobody downloads unless they open DevTools - and without
           them a production stack trace is a list of single-letter names from
           a minified bundle.

           "hidden" would emit the maps without the `//# sourceMappingURL`
           comment, so only an error reporter that uploads them can use them.
           This is a public learning project, so plain `true`. */
        sourcemap: true,

        /* The default is 500kB and this build is nowhere near it. Left
           explicit so that the day a dependency pushes it over, the warning is
           a decision rather than a surprise. */
        chunkSizeWarningLimit: 500,

        rollupOptions: {
            output: {
                /* Dependencies change far less often than my code, so giving
                   them their own chunk means a deploy invalidates only the app
                   chunk. Everything is content-hashed by default, so the
                   vendor chunk keeps its filename and stays in cache.

                   The function form rather than a map of names: my first
                   version was
                   `{ vendor: ["react", "react-dom", "react-router"] }`, which
                   built fine and produced a 51kB vendor chunk next to a 235kB
                   app chunk - so most of React was still in the app chunk.
                   Naming an entry point only pulls in what is reachable from
                   *that* entry, and `react-dom/client` is a different one.

                   Splitting on the path is blunt and it is correct: anything
                   from node_modules is a dependency, and dependencies change
                   on a different schedule from my code. */
                manualChunks(id) {
                    if (id.includes("node_modules")) return "vendor";
                    return undefined;
                }
            }
        }
    },

    test: {
        environment: "jsdom",
        setupFiles: ["./src/test/setup.ts"],
        globals: false,
        include: ["src/**/*.test.{ts,tsx}"],
        css: false
    }
});
