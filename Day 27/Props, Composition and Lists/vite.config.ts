import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/* The first config file in this repo that is not just there to exist.

   The React plugin does two things: it runs the JSX transform, and in dev it
   wires up Fast Refresh, so editing a component replaces it in place and keeps
   the state of everything around it. That is the whole reason the dev loop
   feels different from Week 4's "save, alt-tab, reload, re-do the search". */
export default defineConfig({
    plugins: [react()]
});
