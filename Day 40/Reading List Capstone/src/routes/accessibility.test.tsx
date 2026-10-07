/* Day 38 - tests for the accessibility work.

   These are here because every fix today is invisible to a mouse. A route
   announcement that stops working, or focus that stops moving, would not show
   up in any other test and would not show up in use either - until somebody
   who needs it tried the app.

   That makes these the tests most worth having and the ones I would have been
   least likely to write. */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";

import { ListProvider } from "../state/ListContext";
import { AppRoutes } from "./AppRoutes";

function renderAt(path: string) {
    const user = userEvent.setup();

    /* The real route table, imported rather than repeated.

       Day 37 duplicated it here because importing App would pull in
       BrowserRouter, which reads the actual URL and cannot be pointed at a
       path. Extracting AppRoutes on Day 40 fixed that: the tests get the
       routes the app actually uses, so a new route is covered without being
       copied into two files. */
    render(
        <MemoryRouter initialEntries={[path]}>
            <ListProvider>
                <AppRoutes />
            </ListProvider>
        </MemoryRouter>
    );

    return { user };
}

beforeEach(() => {
    window.localStorage.clear();
    vi.stubGlobal(
        "fetch",
        vi.fn(async () => ({
            ok: true,
            status: 200,
            statusText: "OK",
            json: async () => ({ numFound: 0, docs: [] })
        }))
    );
});

afterEach(() => {
    vi.unstubAllGlobals();
});


describe("landmarks and structure", () => {
    it("has one main landmark and a named nav", () => {
        renderAt("/");

        expect(screen.getByRole("main")).toBeInTheDocument();
        expect(screen.getByRole("navigation", { name: "Main" })).toBeInTheDocument();
    });

    it("puts the skip link first in the tab order", async () => {
        const { user } = renderAt("/");

        await user.tab();

        expect(screen.getByRole("link", { name: "Skip to the main content" })).toHaveFocus();
    });

    it("gives the skip link a target that exists", () => {
        renderAt("/");

        const skip = screen.getByRole("link", { name: "Skip to the main content" });
        const href = skip.getAttribute("href") ?? "";

        expect(href).toBe("#main");
        /* The thing worth asserting: the id is actually on the main element.
           A skip link pointing at a missing id is worse than none, because it
           looks like it works. */
        expect(screen.getByRole("main")).toHaveAttribute("id", "main");
    });

    it("has exactly one h1", () => {
        renderAt("/list");

        expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    });

    it("names every region by its heading", () => {
        renderAt("/list");

        /* The panel's <section> uses aria-labelledby, so it is announced as
           "Your list, region" rather than just "region". */
        expect(screen.getByRole("region", { name: "Your list" })).toBeInTheDocument();
    });

    it("gives the summary list an accessible name", () => {
        renderAt("/list");

        expect(screen.getByRole("list", { name: "Status summary" })).toBeInTheDocument();
    });
});


describe("route announcements", () => {
    it("says nothing on the first render", () => {
        renderAt("/");

        /* Announcing on arrival duplicates what the browser already said, and
           a live region that starts with content never announces it anyway.

           Queried by id rather than by role: the storage notice is also a
           role="status", so getByRole("status") finds two. A live region with
           no accessible name cannot be told apart by role alone, which is a
           fair argument for the id. */
        const announcer = document.getElementById("route-announcer");
        expect(announcer).not.toBeNull();
        expect(announcer).toHaveTextContent("");
    });

    it("announces the new page after a navigation", async () => {
        const { user } = renderAt("/");

        await user.click(screen.getByRole("link", { name: /Your list/ }));

        await waitFor(() => {
            expect(document.getElementById("route-announcer")).toHaveTextContent("Your list page");
        });
    });

    it("announces a polite, not assertive, live region", () => {
        renderAt("/");

        const announcer = document.getElementById("route-announcer");
        expect(announcer).toHaveAttribute("aria-live", "polite");
    });

    it("does not announce a route parameter as the page name", async () => {
        const { user } = renderAt("/add");

        await user.type(screen.getByLabelText("Title"), "Announced");
        await user.click(screen.getByRole("button", { name: "Add to list" }));
        await user.click(screen.getByRole("link", { name: "Announced" }));

        await waitFor(() => {
            /* "Book details page", not "book/4f2c-... page". */
            expect(document.getElementById("route-announcer")).toHaveTextContent("Book details page");
        });
    });
});


describe("focus management", () => {
    it("moves focus to the main region after a navigation", async () => {
        /* This is the test that found the bug. My first implementation called
           the hook inside each route component, which is unmounted and
           remounted on navigation - so its "skip the first render" ref was a
           fresh `true` every time and focus never moved at all.

           The hook now lives in the layout, which survives the change. */
        const { user } = renderAt("/");

        await user.click(screen.getByRole("link", { name: /Your list/ }));

        await waitFor(() => {
            expect(screen.getByRole("main")).toHaveFocus();
        });
    });

    it("does not steal focus on the first render", () => {
        renderAt("/list");

        /* Arriving on a page and having focus pulled out of the address bar is
           worse than the problem being solved. */
        expect(screen.getByRole("main")).not.toHaveFocus();
        expect(document.body).toHaveFocus();
    });

    it("keeps the main region out of the tab order", () => {
        renderAt("/list");

        /* tabIndex={-1} - focusable by script, not by Tab. A zero or positive
           tabindex would add a stop on every route for no reason. */
        expect(screen.getByRole("main")).toHaveAttribute("tabindex", "-1");
    });
});


describe("the form's error summary", () => {
    it("appears only after a failed submit", async () => {
        const { user } = renderAt("/add");

        expect(screen.queryByRole("alert")).not.toBeInTheDocument();

        await user.click(screen.getByRole("button", { name: "Add to list" }));

        expect(screen.getByRole("alert")).toBeInTheDocument();
    });

    it("counts the problems and lists them", async () => {
        const { user } = renderAt("/add");

        await user.type(screen.getByLabelText("Year"), "1200");
        await user.click(screen.getByRole("button", { name: "Add to list" }));

        const summary = screen.getByRole("alert");

        expect(within(summary).getByRole("heading")).toHaveTextContent("2 problems");
        expect(within(summary).getAllByRole("link")).toHaveLength(2);
    });

    it("uses the singular for one problem", async () => {
        const { user } = renderAt("/add");

        await user.click(screen.getByRole("button", { name: "Add to list" }));

        expect(within(screen.getByRole("alert")).getByRole("heading")).toHaveTextContent(
            "is 1 problem"
        );
    });

    it("takes focus so a screen reader lands on it", async () => {
        const { user } = renderAt("/add");

        await user.click(screen.getByRole("button", { name: "Add to list" }));

        await waitFor(() => {
            expect(screen.getByRole("alert")).toHaveFocus();
        });
    });

    it("links each problem to its field", async () => {
        const { user } = renderAt("/add");

        await user.click(screen.getByRole("button", { name: "Add to list" }));

        const link = within(screen.getByRole("alert")).getByRole("link", {
            name: "A title is required."
        });
        const href = link.getAttribute("href") ?? "";

        expect(href.startsWith("#")).toBe(true);
        /* The target exists and is the title field - a summary linking to a
           missing id is the same trap as a broken skip link. */
        expect(document.getElementById(href.slice(1))).toBe(screen.getByLabelText("Title"));
    });

    it("lists the problems in field order, not key order", async () => {
        const { user } = renderAt("/add");

        await user.type(screen.getByLabelText("Year"), "1200");
        await user.type(screen.getByLabelText("Note"), "x".repeat(301));
        await user.click(screen.getByRole("button", { name: "Add to list" }));

        const messages = within(screen.getByRole("alert"))
            .getAllByRole("link")
            .map((link) => link.textContent ?? "");

        expect(messages).toEqual([
            "A title is required.",
            "Use a year between 1450 and " + new Date().getFullYear() + ".",
            "Keep the note under 300 characters."
        ]);
    });

    it("disappears once the form is valid", async () => {
        const { user } = renderAt("/add");

        await user.click(screen.getByRole("button", { name: "Add to list" }));
        expect(screen.getByRole("alert")).toBeInTheDocument();

        await user.type(screen.getByLabelText("Title"), "Fixed");
        await user.click(screen.getByRole("button", { name: "Add to list" }));

        expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });
});


describe("keyboard operation", () => {
    it("can reach and operate the status select with the keyboard", async () => {
        const { user } = renderAt("/add");

        await user.type(screen.getByLabelText("Title"), "Keyboard");
        await user.selectOptions(screen.getByLabelText("Status"), "finished");
        await user.click(screen.getByRole("button", { name: "Add to list" }));

        const summary = screen.getByRole("list", { name: "Status summary" });
        expect(within(summary).getByText("Finished").closest("li")).toHaveTextContent("1");
    });

    it("exposes the filters as buttons with a pressed state", async () => {
        const { user } = renderAt("/add");

        await user.type(screen.getByLabelText("Title"), "One");
        await user.click(screen.getByRole("button", { name: "Add to list" }));

        /* aria-pressed, so the state is announced and not only coloured. A
           styled div would be invisible here. */
        expect(screen.getByRole("button", { name: "All", pressed: true })).toBeInTheDocument();

        await user.click(screen.getByRole("button", { name: "Reading", pressed: false }));

        expect(screen.getByRole("button", { name: "Reading", pressed: true })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "All", pressed: false })).toBeInTheDocument();
    });

    it("labels every form control", () => {
        renderAt("/add");

        /* If getByLabelText finds it, a screen reader can too. Five fields,
           five labels, no placeholders standing in for one. */
        for (const label of ["Title", "Authors", "Year", "Status", "Note"]) {
            expect(screen.getByLabelText(label)).toBeInTheDocument();
        }
    });
});
