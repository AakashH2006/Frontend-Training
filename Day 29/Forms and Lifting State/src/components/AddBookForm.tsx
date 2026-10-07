/* Day 29 - a controlled form.

   Five fields of four different kinds, validated on submit and reported per
   field. The form owns its own draft state and nothing else: it reports a
   finished book upwards and clears itself.

   That split is the decision this file is about. The draft - what is currently
   typed, including the half-finished and invalid states - is nobody else's
   business, so it stays here. The finished book is everybody's business, so it
   goes up. Lifting *everything* to App would mean App re-rendering on every
   keystroke in a field it does not care about. */

import { type FormEvent, useId, useState } from "react";
import { type Book, type Status, STATUSES, STATUS_LABELS, isStatus } from "../data";
import { Button } from "./Button";

interface AddBookFormProps {
    readonly onAdd: (book: Book) => void;
    /* So the form can reject a duplicate before reporting it upwards. Passed
       as a function rather than as the list itself: the form needs the
       answer to one question, not the data to work it out. */
    readonly isDuplicate: (title: string) => boolean;
}

/* One object for the whole draft rather than five useState calls. The fields
   change together, are submitted together and are cleared together, so they
   are one thing. Five separate pieces of state would mean five setters in
   `reset` and five chances to forget one.

   Everything is a string, including the year, because that is what an input
   gives back - even `<input type="number">`. Storing it as a number would mean
   converting on every keystroke and deciding what "" converts to. */
interface Draft {
    readonly title: string;
    readonly authors: string;
    readonly year: string;
    readonly status: Status;
    readonly note: string;
}

const EMPTY: Draft = { title: "", authors: "", year: "", status: "unread", note: "" };

/* Field name -> message. `Partial<Record<...>>` because most fields are valid
   most of the time, and this is the one place Day 23's "Partial belongs on a
   patch, not in a store" cuts the other way: a map of *current problems* is
   genuinely partial. */
type Errors = Partial<Record<keyof Draft, string>>;

const CURRENT_YEAR = new Date().getFullYear();

function validate(draft: Draft, isDuplicate: (title: string) => boolean): Errors {
    const errors: Errors = {};

    const title = draft.title.trim();
    if (title.length === 0) {
        errors.title = "A title is required.";
    } else if (title.length > 200) {
        errors.title = "That title is longer than 200 characters.";
    } else if (isDuplicate(title)) {
        errors.title = "That title is already on your list.";
    }

    /* The year is optional, so an empty string is valid. Only a non-empty
       value is checked - which is the Day 22 lesson about asking the right
       question: the test is "was something typed", not "is it truthy". */
    if (draft.year.trim().length > 0) {
        const year = Number(draft.year);

        if (!Number.isInteger(year)) {
            errors.year = "Use a whole number, or leave it blank.";
        } else if (year < 1450 || year > CURRENT_YEAR) {
            errors.year = `Use a year between 1450 and ${CURRENT_YEAR}.`;
        }
    }

    if (draft.note.length > 300) {
        errors.note = "Keep the note under 300 characters.";
    }

    return errors;
}

export function AddBookForm({ onAdd, isDuplicate }: AddBookFormProps) {
    const [draft, setDraft] = useState<Draft>(EMPTY);
    const [errors, setErrors] = useState<Errors>({});
    /* Errors appear after the first submit attempt, not while someone is still
       typing the first character of a required field. Validating from the
       start means the form is red before it has been used. */
    const [submitted, setSubmitted] = useState(false);

    /* useId gives a unique, stable id per component instance. Hand-rolling
       `id="title"` breaks the moment there are two of these forms on a page -
       two elements with the same id, and every label pointing at the first.
       It is also stable across renders, which a counter or a random number
       would not be. */
    const formId = useId();
    const fieldId = (name: keyof Draft): string => `${formId}-${name}`;
    const errorId = (name: keyof Draft): string => `${formId}-${name}-error`;

    /* One updater for every text field, keyed by the field name. The
       alternative is five near-identical handlers.

       `K extends keyof Draft` with `value: Draft[K]` is Day 24's keyof
       constraint: the key and the value type are related, so
       `update("status", "nonsense")` does not compile. A plain
       `(name: string, value: string)` would have allowed it. */
    function update<K extends keyof Draft>(name: K, value: Draft[K]): void {
        setDraft((previous) => ({ ...previous, [name]: value }));

        /* Clear this field's error as soon as it is edited. Leaving it until
           the next submit means the message stays on screen while the person
           is fixing exactly the thing it complains about. */
        setErrors((previous) => {
            if (previous[name] === undefined) return previous;
            const next = { ...previous };
            delete next[name];
            return next;
        });
    }

    function handleSubmit(event: FormEvent<HTMLFormElement>): void {
        /* The form is a real <form>, so Enter submits it and the browser does
           the keyboard work. preventDefault stops the navigation - same as
           Week 4, and still the first line of every submit handler. */
        event.preventDefault();
        setSubmitted(true);

        const found = validate(draft, isDuplicate);
        setErrors(found);

        if (Object.keys(found).length > 0) return;

        const authors = draft.authors
            .split(",")
            .map((name) => name.trim())
            .filter((name) => name.length > 0);

        const year = draft.year.trim();
        const note = draft.note.trim();

        /* The conditional spreads again - `exactOptionalPropertyTypes` means
           `year: undefined` is not the same as no `year`. Week 5, Day 23. */
        onAdd({
            id: `local-${Date.now()}`,
            title: draft.title.trim(),
            authors,
            status: draft.status,
            ...(year.length === 0 ? {} : { year: Number(year) }),
            ...(note.length === 0 ? {} : { note })
        });

        setDraft(EMPTY);
        setErrors({});
        setSubmitted(false);
    }

    /* Derived, not stored. A `canSubmit` piece of state would need updating
       from every field's handler, and the first one that forgot would leave
       the button wrong. */
    const hasErrors = Object.keys(errors).length > 0;

    return (
        /* noValidate turns off the browser's own bubbles, because this form
           reports errors inline and next to the field. Two validation systems
           disagreeing is worse than either alone. */
        <form onSubmit={handleSubmit} noValidate>
            <div className="field">
                <label htmlFor={fieldId("title")}>Title</label>
                <input
                    id={fieldId("title")}
                    /* The two halves of a controlled input. `value` makes the
                       state the source of truth; `onChange` is how the state
                       learns about typing. With `value` and no `onChange` the
                       field looks frozen and React warns - because every
                       keystroke is immediately overwritten by the prop. */
                    value={draft.title}
                    onChange={(event) => update("title", event.target.value)}
                    /* aria-invalid is the state a screen reader hears;
                       aria-describedby points at the message so it is read
                       with the field rather than being orphaned text. */
                    aria-invalid={errors.title !== undefined}
                    aria-describedby={errors.title === undefined ? undefined : errorId("title")}
                    autoComplete="off"
                />
                {errors.title !== undefined && (
                    <p className="field-error" id={errorId("title")}>
                        {errors.title}
                    </p>
                )}
            </div>

            <div className="toolbar">
                <div className="field">
                    <label htmlFor={fieldId("authors")}>Authors</label>
                    <input
                        id={fieldId("authors")}
                        value={draft.authors}
                        onChange={(event) => update("authors", event.target.value)}
                        placeholder="Comma separated"
                        autoComplete="off"
                    />
                </div>

                <div className="field">
                    <label htmlFor={fieldId("year")}>Year</label>
                    <input
                        id={fieldId("year")}
                        /* type="number" still gives a string from
                           `event.target.value`, and it accepts "1e5" and "--"
                           in some browsers. So the input type is a keyboard
                           hint, and `validate` is the actual check. */
                        type="number"
                        inputMode="numeric"
                        value={draft.year}
                        onChange={(event) => update("year", event.target.value)}
                        aria-invalid={errors.year !== undefined}
                        aria-describedby={errors.year === undefined ? undefined : errorId("year")}
                    />
                    {errors.year !== undefined && (
                        <p className="field-error" id={errorId("year")}>
                            {errors.year}
                        </p>
                    )}
                </div>

                <div className="field">
                    <label htmlFor={fieldId("status")}>Status</label>
                    <select
                        id={fieldId("status")}
                        value={draft.status}
                        onChange={(event) => {
                            /* The guard again: a select gives a string, and
                               Draft["status"] is a Status. */
                            if (isStatus(event.target.value)) update("status", event.target.value);
                        }}
                    >
                        {STATUSES.map((status) => (
                            <option key={status} value={status}>
                                {STATUS_LABELS[status]}
                            </option>
                        ))}
                    </select>
                </div>
            </div>

            <div className="field">
                <label htmlFor={fieldId("note")}>Note</label>
                <textarea
                    id={fieldId("note")}
                    rows={2}
                    value={draft.note}
                    onChange={(event) => update("note", event.target.value)}
                    aria-invalid={errors.note !== undefined}
                    aria-describedby={errors.note === undefined ? undefined : errorId("note")}
                />
                {/* A live character count, which is the clearest argument for a
                    controlled input: the state is already here, so this is a
                    derived value and not a second listener. */}
                <p className="text-sm text-muted">{draft.note.length} / 300</p>
                {errors.note !== undefined && (
                    <p className="field-error" id={errorId("note")}>
                        {errors.note}
                    </p>
                )}
            </div>

            <div className="form-actions">
                <Button type="submit">Add to list</Button>
                <Button
                    variant="quiet"
                    onClick={() => {
                        setDraft(EMPTY);
                        setErrors({});
                        setSubmitted(false);
                    }}
                >
                    Clear
                </Button>
            </div>

            {/* role="status" is an aria-live region, so the summary is
                announced without moving focus. Day 20's status line, again. */}
            <p className={`status${hasErrors ? " status--error" : ""}`} role="status">
                {submitted && hasErrors
                    ? `${Object.keys(errors).length} field(s) need attention.`
                    : "Title is required. Everything else is optional."}
            </p>
        </form>
    );
}
