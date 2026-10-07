/* Day 31 - the form, unchanged from Day 30 except for where Book comes from.

   Worth noting that it did not need changing. The form reports a draft and
   knows nothing about how the list is stored, so normalising the list and
   moving to a reducer did not reach it. That is the boundary from Day 29
   paying off.

   Day 30 - one form, for both adding and editing.

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

import { type FormEvent, useEffect, useId, useRef, useState } from "react";
import { type Status, STATUSES, STATUS_LABELS, isStatus } from "../data";
import type { Book, BookDraft } from "../state/reducer";
import { Button } from "./Button";

/* `BookDraft` now comes from the reducer, which owns the shape of a book and
   therefore the shape of a change to one. Day 30 declared it here as
   `Omit<Book, "id">`; the reducer's version also omits `addedAt`, because the
   reducer sets that too.

   The compiler caught the difference the moment I repointed the import, which
   is the sort of thing a comment would not have. */

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

    /* Day 38. A failed submit previously changed a line of text near the
       bottom of the form and left focus on the submit button. A sighted user
       sees the red; a screen reader user hears nothing and has no idea why
       nothing happened.

       The summary is a focusable region listing every problem, with a link to
       each field. Focus moves to it after a failed submit - which is the
       pattern the GOV.UK Design System uses and the one thing that makes a
       long form usable without sight. */
    const summaryRef = useRef<HTMLDivElement | null>(null);
    const [submitCount, setSubmitCount] = useState(0);

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

        if (Object.keys(found).length > 0) {
            /* Bumped so the effect below runs even when the same fields fail
               twice in a row - the errors object is new but equal, and
               depending on it alone would not re-fire. */
            setSubmitCount((n) => n + 1);
            return;
        }

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

    /* An effect, because it synchronises with something outside React - the
       document's focus. Day 33's definition, and one of the few places focus
       management is genuinely an effect rather than an event: the element has
       to exist before it can be focused, and it does not exist until this
       render has committed. */
    useEffect(() => {
        if (submitCount > 0 && hasErrors) summaryRef.current?.focus();
    }, [submitCount, hasErrors]);

    /* Ordered the way the fields are, so the summary reads in the same order
       as the form rather than in whatever order the keys happen to be in. */
    const ORDER: readonly (keyof Fields)[] = ["title", "authors", "year", "status", "note"];
    const listedErrors = ORDER.flatMap((name) => {
        const message = errors[name];
        return message === undefined ? [] : [{ name, message }];
    });

    return (
        <form onSubmit={handleSubmit} noValidate>
            {/* Rendered only when there is something to say. tabIndex={-1} so
                it can be focused by script and is not in the tab order. */}
            {submitted && hasErrors && (
                <div
                    className="error-summary"
                    ref={summaryRef}
                    tabIndex={-1}
                    role="alert"
                    aria-labelledby={`${formId}-summary-heading`}
                >
                    <h3 className="error-summary__title" id={`${formId}-summary-heading`}>
                        There {listedErrors.length === 1 ? "is 1 problem" : `are ${listedErrors.length} problems`} with this form
                    </h3>
                    <ul className="error-summary__list">
                        {listedErrors.map(({ name, message }) => (
                            <li key={name}>
                                {/* A real anchor to the field's id, so clicking
                                    or activating it moves focus there. */}
                                <a href={`#${fieldId(name)}`}>{message}</a>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
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
