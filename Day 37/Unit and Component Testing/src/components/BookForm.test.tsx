/* Day 37 - testing a component through what a user can see and do.

   The rule I took from the Testing Library docs and then actually used:

       query the way a user finds the control, act the way a user acts,
       assert on what a user would see.

   So every query here is by role or by label, and none of them is by class
   name or test id. That is not purity for its own sake - a test that finds a
   button by `.button--danger` passes after I rename the class and the button
   has stopped working, and fails after I restyle it and nothing has. */

import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { BookForm } from "./BookForm";
import type { Book } from "../state/reducer";

const never = () => false;

function setup(props: Partial<Parameters<typeof BookForm>[0]> = {}) {
    const onSubmit = vi.fn();

    /* userEvent.setup() before render, which is what the docs ask for. It
       dispatches the full sequence a real interaction produces -
       pointerdown, mousedown, focus, keydown, keypress, input, keyup - where
       fireEvent dispatches one event.

       That matters here: a `change` alone would set the value without ever
       focusing the field, so a test could pass while the form was unusable by
       keyboard. */
    const user = userEvent.setup();

    render(
        <BookForm
            onSubmit={onSubmit}
            isDuplicate={never}
            submitLabel="Add to list"
            {...props}
        />
    );

    return { onSubmit, user };
}

/* Finding controls by their label, which is also an accessibility assertion:
   if `getByLabelText` cannot find it, a screen reader could not either. */
const titleField = () => screen.getByLabelText("Title");
const authorsField = () => screen.getByLabelText("Authors");
const yearField = () => screen.getByLabelText("Year");
const noteField = () => screen.getByLabelText("Note");
const statusField = () => screen.getByLabelText("Status");
const submitButton = (name = "Add to list") => screen.getByRole("button", { name });


describe("BookForm: validation", () => {
    it("reports a missing title and does not submit", async () => {
        const { onSubmit, user } = setup();

        await user.click(submitButton());

        expect(screen.getByText("A title is required.")).toBeInTheDocument();
        expect(onSubmit).not.toHaveBeenCalled();
    });

    it("shows no errors before the first submit", async () => {
        const { user } = setup();

        /* Typing into a required field and then clearing it must not light the
           form up red before it has been submitted once. */
        await user.type(titleField(), "a");
        await user.clear(titleField());

        expect(screen.queryByText("A title is required.")).not.toBeInTheDocument();
    });

    it("marks the invalid field for assistive technology", async () => {
        const { user } = setup();

        await user.click(submitButton());

        const title = titleField();
        expect(title).toBeInvalid();

        /* The error text is associated with the field, not merely nearby.
           `toHaveAccessibleDescription` resolves aria-describedby, so this
           asserts the wiring rather than the presence of a paragraph. */
        expect(title).toHaveAccessibleDescription("A title is required.");
    });

    it("clears a field's error as soon as it is edited", async () => {
        const { user } = setup();

        await user.click(submitButton());
        expect(screen.getByText("A title is required.")).toBeInTheDocument();

        await user.type(titleField(), "Dune");

        expect(screen.queryByText("A title is required.")).not.toBeInTheDocument();
        expect(titleField()).toBeValid();
    });

    it("rejects a year outside the allowed range", async () => {
        const { onSubmit, user } = setup();

        await user.type(titleField(), "Dune");
        await user.type(yearField(), "1200");
        await user.click(submitButton());

        expect(screen.getByText(/Use a year between 1450 and/)).toBeInTheDocument();
        expect(onSubmit).not.toHaveBeenCalled();
    });

    it("accepts an empty year, because it is optional", async () => {
        const { onSubmit, user } = setup();

        await user.type(titleField(), "Dune");
        await user.click(submitButton());

        expect(onSubmit).toHaveBeenCalledTimes(1);
    });

    it("rejects a duplicate title", async () => {
        const { onSubmit, user } = setup({ isDuplicate: (title) => title === "Dune" });

        await user.type(titleField(), "Dune");
        await user.click(submitButton());

        expect(screen.getByText("That title is already on your list.")).toBeInTheDocument();
        expect(onSubmit).not.toHaveBeenCalled();
    });
});


describe("BookForm: submitting", () => {
    it("reports the typed values, trimmed and split", async () => {
        const { onSubmit, user } = setup();

        await user.type(titleField(), "  Dune  ");
        await user.type(authorsField(), "Frank Herbert, Someone Else");
        await user.type(yearField(), "1965");
        await user.selectOptions(statusField(), "reading");
        await user.type(noteField(), "  Lent from the library.  ");

        await user.click(submitButton());

        expect(onSubmit).toHaveBeenCalledTimes(1);
        expect(onSubmit).toHaveBeenCalledWith({
            title: "Dune",
            authors: ["Frank Herbert", "Someone Else"],
            year: 1965,
            status: "reading",
            note: "Lent from the library."
        });
    });

    it("omits an empty year and note rather than sending empty values", async () => {
        const { onSubmit, user } = setup();

        await user.type(titleField(), "Minimal");
        await user.click(submitButton());

        /* Asserting on the exact object, so an extra `year: undefined` would
           fail. That is the `exactOptionalPropertyTypes` decision from Week 5,
           tested rather than assumed. */
        expect(onSubmit).toHaveBeenCalledWith({
            title: "Minimal",
            authors: [],
            status: "unread"
        });
    });

    it("drops empty entries from a trailing comma in the authors field", async () => {
        const { onSubmit, user } = setup();

        await user.type(titleField(), "Trailing");
        await user.type(authorsField(), "One, , Two,");
        await user.click(submitButton());

        expect(onSubmit).toHaveBeenCalledWith(
            expect.objectContaining({ authors: ["One", "Two"] })
        );
    });

    it("clears the form after adding", async () => {
        const { user } = setup();

        await user.type(titleField(), "Dune");
        await user.click(submitButton());

        expect(titleField()).toHaveValue("");
    });

    it("submits on Enter from a text field", async () => {
        /* The form is a real <form>, so the browser does this - and that is
           worth a test, because switching the submit button to a plain
           onClick handler would break it silently. */
        const { onSubmit, user } = setup();

        await user.type(titleField(), "Dune{Enter}");

        expect(onSubmit).toHaveBeenCalledTimes(1);
    });
});


describe("BookForm: editing", () => {
    const existing: Book = {
        id: "b1",
        title: "Dune",
        authors: ["Frank Herbert"],
        year: 1965,
        status: "reading",
        note: "A note.",
        addedAt: "2026-01-01T00:00:00.000Z"
    };

    it("fills the fields from the book being edited", () => {
        setup({ initial: existing, submitLabel: "Save changes", onCancel: vi.fn() });

        expect(titleField()).toHaveValue("Dune");
        expect(authorsField()).toHaveValue("Frank Herbert");
        expect(yearField()).toHaveValue(1965);
        expect(statusField()).toHaveValue("reading");
        expect(noteField()).toHaveValue("A note.");
    });

    it("shows Cancel only when it can be cancelled", () => {
        const { unmount } = render(
            <BookForm onSubmit={vi.fn()} isDuplicate={never} submitLabel="Add to list" />
        );
        expect(screen.queryByRole("button", { name: "Cancel" })).not.toBeInTheDocument();
        unmount();

        render(
            <BookForm
                onSubmit={vi.fn()}
                isDuplicate={never}
                submitLabel="Save changes"
                initial={existing}
                onCancel={vi.fn()}
            />
        );
        expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
    });

    it("calls onCancel without submitting", async () => {
        const onCancel = vi.fn();
        const { onSubmit, user } = setup({
            initial: existing,
            submitLabel: "Save changes",
            onCancel
        });

        await user.click(screen.getByRole("button", { name: "Cancel" }));

        expect(onCancel).toHaveBeenCalledTimes(1);
        expect(onSubmit).not.toHaveBeenCalled();
    });

    it("does not clear the fields after saving an edit", async () => {
        /* The form unmounts after an edit, so clearing would be a pointless
           state update on the way out - and if the parent keeps it mounted,
           blanking the fields would look like the save had failed. */
        const { user } = setup({
            initial: existing,
            submitLabel: "Save changes",
            onCancel: vi.fn()
        });

        await user.clear(titleField());
        await user.type(titleField(), "Dune Messiah");
        await user.click(submitButton("Save changes"));

        expect(titleField()).toHaveValue("Dune Messiah");
    });

    it("counts the note's characters as they are typed", async () => {
        const { user } = setup();

        expect(screen.getByText("0 / 300")).toBeInTheDocument();
        await user.type(noteField(), "abcde");
        expect(screen.getByText("5 / 300")).toBeInTheDocument();
    });
});
