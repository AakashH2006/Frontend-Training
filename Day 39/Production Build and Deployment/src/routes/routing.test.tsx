/* Day 37 - testing the routes.

   The third kind of test in the project: not a pure function and not one
   component, but several of them wired together through a router and a
   provider. This is where a bug that each unit test misses would live - a
   route that renders the right component with the wrong props, or a link
   pointing at a path no route matches.

   Two things make it manageable:

     `MemoryRouter`   a router with no browser. The history is an array, and
                      `initialEntries` is how a test starts on a given route -
                      which is the whole reason a deep link is testable at all.

     a stubbed fetch  so a search is deterministic and offline. */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";

import { ListProvider } from "../state/ListContext";
import { Layout } from "./Layout";
import { SearchRoute } from "./SearchRoute";
import { ListRoute } from "./ListRoute";
import { AddRoute } from "./AddRoute";
import { BookRoute } from "./BookRoute";
import { NotFound } from "./NotFound";

/* The route table, repeated here rather than imported from App.

   That is a real duplication and I thought about it: importing App would pull
   in BrowserRouter, which reads the actual URL and cannot be pointed at a
   route. The alternative is extracting the <Routes> into its own component and
   importing that - which is tidier and is what Day 40 does. For today the
   duplication is the smaller cost, and it is flagged rather than hidden. */
function renderAt(path: string) {
    const user = userEvent.setup();

    render(
        <MemoryRouter initialEntries={[path]}>
            <ListProvider>
                <Routes>
                    <Route element={<Layout />}>
                        <Route index element={<SearchRoute />} />
                        <Route path="list" element={<ListRoute />} />
                        <Route path="add" element={<AddRoute />} />
                        <Route path="book/:id" element={<BookRoute />} />
                        <Route path="*" element={<NotFound />} />
                    </Route>
                </Routes>
            </ListProvider>
        </MemoryRouter>
    );

    return { user };
}

const heading = (name: string | RegExp) => screen.getByRole("heading", { name });

beforeEach(() => {
    /* A fresh, empty store for every test. Without this, a book saved in one
       test is still on the list in the next one - and the failure appears in
       the innocent test. The same reasoning as `cleanup` in setup.ts. */
    window.localStorage.clear();

    vi.stubGlobal(
        "fetch",
        vi.fn(async (url: string | URL) => {
            const query = new URL(String(url)).searchParams.get("q") ?? "";

            return {
                ok: true,
                status: 200,
                statusText: "OK",
                json: async () => ({
                    numFound: 1,
                    docs: [
                        {
                            key: "/works/OLTEST",
                            title: `Result for ${query}`,
                            author_name: ["Test Author"],
                            first_publish_year: 1979
                        }
                    ]
                })
            };
        })
    );
});

afterEach(() => {
    vi.unstubAllGlobals();
});


describe("routing", () => {
    it("renders the search route at /", () => {
        renderAt("/");
        expect(heading("Search Open Library")).toBeInTheDocument();
    });

    it("renders the list route at /list", () => {
        renderAt("/list");
        expect(heading("Your list")).toBeInTheDocument();
    });

    it("renders the not-found route for an unknown path", () => {
        renderAt("/nonsense");

        expect(heading("Page not found")).toBeInTheDocument();
        /* And the shell is still there, which is the layout route working -
           a 404 inside the app rather than a blank page. */
        expect(screen.getByRole("navigation", { name: "Main" })).toBeInTheDocument();
    });

    it("marks the current route in the nav", () => {
        renderAt("/list");

        const nav = screen.getByRole("navigation", { name: "Main" });
        const current = within(nav).getByRole("link", { current: "page" });

        expect(current).toHaveTextContent("Your list");
    });

    it("reads the search query from the URL", async () => {
        renderAt("/?q=dune");

        /* `findBy*` waits. The fetch resolves on a microtask and the state
           updates after it, so a synchronous `getBy*` would run before the
           results exist - which is the whole reason these queries are async
           and the thing my hand-rolled jsdom probes were working around with
           setTimeout. */
        expect(await screen.findByText("Result for dune")).toBeInTheDocument();
        /* By role, not by label text. "Search Open Library" is both the
           panel's heading (which names the <section> through
           aria-labelledby) and the input's label, so getByLabelText finds
           two elements. Narrowing to the searchbox role is unambiguous and
           also closer to how a user finds the field. */
        expect(screen.getByRole("searchbox", { name: "Search Open Library" })).toHaveValue("dune");
    });

    it("shows the not-found panel for a book id that is not on the list", () => {
        renderAt("/book/MISSING");

        expect(heading("Book not found")).toBeInTheDocument();
        expect(screen.getByText(/Nothing on your list has the id "MISSING"/)).toBeInTheDocument();
    });
});


describe("search to list, end to end", () => {
    it("saves a result and shows it on the list route", async () => {
        const { user } = renderAt("/?q=dune");

        await user.click(await screen.findByRole("button", { name: "Save" }));

        /* The Save button becomes a disabled "On your list", which is the
           derived savedIds set doing its job. */
        expect(await screen.findByRole("button", { name: "On your list" })).toBeDisabled();

        /* Navigate the way a user would - by clicking the nav link. */
        await user.click(screen.getByRole("link", { name: /Your list/ }));

        expect(heading("Your list")).toBeInTheDocument();
        expect(screen.getByRole("link", { name: "Result for dune" })).toBeInTheDocument();
    });

    it("counts the saved book in the nav", async () => {
        const { user } = renderAt("/?q=dune");

        expect(screen.getByRole("link", { name: "Your list (0)" })).toBeInTheDocument();

        await user.click(await screen.findByRole("button", { name: "Save" }));

        await waitFor(() => {
            expect(screen.getByRole("link", { name: "Your list (1)" })).toBeInTheDocument();
        });
    });

    it("opens a saved book's detail route from the list", async () => {
        const { user } = renderAt("/?q=dune");
        await user.click(await screen.findByRole("button", { name: "Save" }));
        await user.click(screen.getByRole("link", { name: /Your list/ }));

        await user.click(screen.getByRole("link", { name: "Result for dune" }));

        expect(heading("Result for dune")).toBeInTheDocument();
        expect(screen.getByText("Test Author")).toBeInTheDocument();
        expect(screen.getByLabelText("Status")).toHaveValue("unread");
    });

    it("changes a status from the detail route and reflects it on the list", async () => {
        const { user } = renderAt("/?q=dune");
        await user.click(await screen.findByRole("button", { name: "Save" }));
        await user.click(screen.getByRole("link", { name: /Your list/ }));
        await user.click(screen.getByRole("link", { name: "Result for dune" }));

        await user.selectOptions(screen.getByLabelText("Status"), "finished");

        await user.click(screen.getByRole("link", { name: "Back to your list" }));

        /* The counts are selectors over the reducer, so this asserts the whole
           chain: select -> dispatch -> reducer -> selector -> render. */
        /* Scoped to the summary list, because "Finished" also appears as a
           filter button and as the badge on the card. `within` is the answer
           to "found multiple elements" far more often than a test id is. */
        const summary = screen.getByRole("list", { name: "Status summary" });
        const finished = within(summary).getByText("Finished").closest("li");
        expect(finished).toHaveTextContent("1");
    });

    it("removing from the detail route returns to the list", async () => {
        const { user } = renderAt("/?q=dune");
        await user.click(await screen.findByRole("button", { name: "Save" }));
        await user.click(screen.getByRole("link", { name: /Your list/ }));
        await user.click(screen.getByRole("link", { name: "Result for dune" }));

        await user.click(screen.getByRole("button", { name: "Remove" }));

        expect(heading("Your list")).toBeInTheDocument();
        expect(screen.getByText("Nothing saved yet.")).toBeInTheDocument();
    });
});


describe("adding by hand", () => {
    it("adds a book and navigates to the list", async () => {
        const { user } = renderAt("/add");

        await user.type(screen.getByLabelText("Title"), "By Hand");
        await user.type(screen.getByLabelText("Authors"), "Someone");
        await user.click(screen.getByRole("button", { name: "Add to list" }));

        expect(heading("Your list")).toBeInTheDocument();
        expect(screen.getByRole("link", { name: "By Hand" })).toBeInTheDocument();
    });

    it("stays on the form when validation fails", async () => {
        const { user } = renderAt("/add");

        await user.click(screen.getByRole("button", { name: "Add to list" }));

        /* Scoped to the summary, because Day 38 made the message appear
           twice - at the top and beside the field. */
        expect(
            within(screen.getByRole("alert")).getByText("A title is required.")
        ).toBeInTheDocument();
        expect(heading("Add a book by hand")).toBeInTheDocument();
    });
});


describe("filtering the list", () => {
    it("filters by status and reports the count", async () => {
        const { user } = renderAt("/add");

        await user.type(screen.getByLabelText("Title"), "Unread One");
        await user.click(screen.getByRole("button", { name: "Add to list" }));

        await user.click(screen.getByRole("link", { name: "Add by hand" }));
        await user.type(screen.getByLabelText("Title"), "Reading One");
        await user.selectOptions(screen.getByLabelText("Status"), "reading");
        await user.click(screen.getByRole("button", { name: "Add to list" }));

        expect(screen.getByText("Showing 2 of 2.")).toBeInTheDocument();

        /* The filters are real buttons carrying aria-pressed, so a test can
           find them by role and assert the pressed state - which a styled div
           would not allow. */
        await user.click(screen.getByRole("button", { name: "Reading", pressed: false }));

        expect(screen.getByText("Showing 1 of 2.")).toBeInTheDocument();
        expect(screen.getByRole("link", { name: "Reading One" })).toBeInTheDocument();
        expect(screen.queryByRole("link", { name: "Unread One" })).not.toBeInTheDocument();
    });

    it("searches the list by author", async () => {
        const { user } = renderAt("/add");

        await user.type(screen.getByLabelText("Title"), "Findable");
        await user.type(screen.getByLabelText("Authors"), "Ursula Le Guin");
        await user.click(screen.getByRole("button", { name: "Add to list" }));

        await user.type(screen.getByLabelText("Filter your list"), "le guin");

        expect(screen.getByText("Showing 1 of 1.")).toBeInTheDocument();
        expect(screen.getByRole("link", { name: "Findable" })).toBeInTheDocument();
    });
});
