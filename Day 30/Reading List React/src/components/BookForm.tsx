/* Day 30 - one form, for both adding and editing.

   Day 29 had `AddBookForm`. The obvious way to add editing was a second
   component, and I started writing it before noticing it was the same five
   fields, the same validation and the same error handling with a different
   heading and a different button.

   So this is that component generalised. The differences between add and edit
   turned out to be exactly three things:

     - what the fields start as          -> `initial`
     - what the button says              -> `submitLabel`
     - whether there is a way to back out -> `onCancel`

   Everything else is shared, which means a validation fix lands in both. */

import { type FormEvent, useId, useState } from "react";
import { type Book, type Status, STATUSES, STATUS_LABELS, isStatus } from "../data";
import { Button } from "./Button";

/* The shape the form reports. No `id`: the form does not invent identity.
   Adding generates one in App, editing keeps the existing one - and neither is
   the form's business. Day 23's rule about modelling what something actually
   is, applied to a form payload. */
export type BookDraft = Omit<Book, "id">;

interface BookFormProps {
    readonly onSubmit: (draft: BookDraft) => void;
    /* A function rather than the list: the form needs the answer to one
       question, not the data to work it out. Day 29. */
    readonly isDuplicate: (title: string) => boolean;
    readonly submitLabel: string;
    /* Absent when adding, present when editing. Its presence is what makes
       the Cancel button appear, so the two cases need no `mode` prop. */
    readonly onCancel?: () => void;
    readonly initial?: Book;
}

interface Fields {
    readonly title: string;
    readonly authors: string;
    readonly year: string;
    readonly status: Status;
    readonly note: string;
}

const BLANK: Fields = { title: "", authors: "", year: "", status: "unread", note: "" };

/* Book -> Fields. Everything becomes a string, because that is what an input
   holds; `year` and `note` are optional on a Book and always present (possibly
   empty) here. */
function toFields(book: Book | undefined): Fields {
    if (book === undefined) return BLANK;

    return {
        title: book.title,
        authors: book.authors.join(", "),
        year: book.year === undefined ? "" : String(book.year),
        status: book.status,
        note: book.note ?? ""
    };
}

type Errors = Partial<Record<keyof Fields, string>>;

const CURRENT_YEAR = new Date().getFullYear();

function validate(fields: Fields, isDuplicate: (title: string) => boolean): Errors {
    const errors: Errors = {};
    const title = fields.title.trim();

    if (title.length === 0) {
        errors.title = "A title is required.";
    } else if (title.length > 200) {
        errors.title = "That title is longer than 200 characters.";
    } else if (isDuplicate(title)) {
        errors.title = "That title is already on your list.";
    }

    if (fields.year.trim().length > 0) {
        const year = Number(fields.year);
        if (!Number.isInteger(year)) {
            errors.year = "Use a whole number, or leave it blank.";
        } else if (year < 1450 || year > CURRENT_YEAR) {
            errors.year = `Use a year between 1450 and ${CURRENT_YEAR}.`;
        }
    }

    if (fields.note.length > 300) {
        errors.note = "Keep the note under 300 characters.";
    }

    return errors;
}

export function BookForm({
    onSubmit,
    isDuplicate,
    submitLabel,
    onCancel,
    initial
}: BookFormProps) {
    /* `useState(toFields(initial))` runs the initialiser on the first render
       only. On every later render the argument is computed and thrown away,
       which is why state does *not* follow a changing `initial` prop.

       That is the right default and it is a trap. The fix App uses is a
       `key` on this component - see the note at the bottom of the file. */
    const [fields, setFields] = useState<Fields>(() => toFields(initial));
    const [errors, setErrors] = useState<Errors>({});
    const [submitted, setSubmitted] = useState(false);

    const formId = useId();
    const fieldId = (name: keyof Fields): string => `${formId}-${name}`;
    const errorId = (name: keyof Fields): string => `${formId}-${name}-error`;

    function update<K extends keyof Fields>(name: K, value: Fields[K]): void {
        setFields((previous) => ({ ...previous, [name]: value }));

        setErrors((previous) => {
            if (previous[name] === undefined) return previous;
            const next = { ...previous };
            delete next[name];
            return next;
        });
    }

    function handleSubmit(event: FormEvent<HTMLFormElement>): void {
        event.preventDefault();
        setSubmitted(true);

        const found = validate(fields, isDuplicate);
        setErrors(found);
        if (Object.keys(found).length > 0) return;

        const year = fields.year.trim();
        const note = fields.note.trim();

        onSubmit({
            title: fields.title.trim(),
            authors: fields.authors
                .split(",")
                .map((name) => name.trim())
                .filter((name) => name.length > 0),
            status: fields.status,
            ...(year.length === 0 ? {} : { year: Number(year) }),
            ...(note.length === 0 ? {} : { note })
        });

        /* Only reset when adding. After an edit the form unmounts, so
           clearing it would be a pointless state update on the way out. */
        if (initial === undefined) {
            setFields(BLANK);
            setErrors({});
            setSubmitted(false);
        }
    }

    const hasErrors = Object.keys(errors).length > 0;

    return (
        <form onSubmit={handleSubmit} noValidate>
            <div className="field">
                <label htmlFor={fieldId("title")}>Title</label>
                <input
                    id={fieldId("title")}
                    value={fields.title}
                    onChange={(event) => update("title", event.target.value)}
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
                        value={fields.authors}
                        onChange={(event) => update("authors", event.target.value)}
                        placeholder="Comma separated"
                        autoComplete="off"
                    />
                </div>

                <div className="field">
                    <label htmlFor={fieldId("year")}>Year</label>
                    <input
                        id={fieldId("year")}
                        type="number"
                        inputMode="numeric"
                        value={fields.year}
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
                        value={fields.status}
                        onChange={(event) => {
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
                    value={fields.note}
                    onChange={(event) => update("note", event.target.value)}
                    aria-invalid={errors.note !== undefined}
                    aria-describedby={errors.note === undefined ? undefined : errorId("note")}
                />
                <p className="text-sm text-muted">{fields.note.length} / 300</p>
                {errors.note !== undefined && (
                    <p className="field-error" id={errorId("note")}>
                        {errors.note}
                    </p>
                )}
            </div>

            <div className="form-actions">
                <Button type="submit">{submitLabel}</Button>

                {/* The presence of onCancel is the only thing that
                    distinguishes edit from add in this component. */}
                {onCancel !== undefined && (
                    <Button variant="quiet" onClick={onCancel}>
                        Cancel
                    </Button>
                )}
            </div>

            <p className={`status${hasErrors ? " status--error" : ""}`} role="status">
                {submitted && hasErrors
                    ? `${Object.keys(errors).length} field(s) need attention.`
                    : "Title is required. Everything else is optional."}
            </p>
        </form>
    );
}

/* The `key` trick, which is the thing I actually learned today.

   `useState(() => toFields(initial))` only reads `initial` once. So clicking
   Edit on one book and then Edit on another would reuse the same component
   instance and keep the first book's values in the fields - the component is
   in the same position in the tree, so React keeps its state.

   Three ways out:

     1. An effect that resets state when `initial` changes. This is the one the
        React docs specifically warn about, and it renders once with the wrong
        values before correcting itself.
     2. Derive the fields from props and keep no state. Impossible - the fields
        have to hold what is typed, which is not in the props.
     3. Give the component a `key` of the book's id. A different key means a
        different component as far as React is concerned, so it unmounts the
        old one and mounts a fresh one with fresh state.

   App uses option 3:

       <BookForm key={editing.id} initial={editing} ... />

   One attribute, no effect, and no render with stale values. `key` is not only
   for lists - it is how to tell React that something is a different thing. */
