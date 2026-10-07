/// <reference types="vite/client" />

/* One line, and it is the answer to the first error I hit after writing
   `import "./styles.css"` in main.ts:

       Cannot find module './styles.css' or its corresponding type declarations.

   TypeScript is right. There is no such module as far as the language is
   concerned - a CSS file is not JavaScript and has no exports. The import only
   means anything because Vite handles it.

   This reference pulls in Vite's own ambient declarations, which declare
   `*.css`, `*.svg`, `*.png` and the rest as modules, plus `import.meta.env`.
   A `.d.ts` file is types only: it declares what exists without defining it,
   and it emits nothing. */
