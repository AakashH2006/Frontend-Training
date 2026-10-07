/* Day 25 - DOM helpers.

   This file did not exist in Day 20, and writing it was most of the migration.

   The problem: every DOM lookup returns something-or-null.

       document.getElementById(id)        HTMLElement | null
       element.querySelector(".thing")    Element | null
       template.content.cloneNode(true)   Node

   Day 20's render.js looked up nine elements at module load and then used them
   freely. Under strictNullChecks every one of those nine became an error, and
   there were three ways out:

     1. `!` on each of them. Nine assertions, each a silent promise, and the
        error if one is wrong arrives much later as "cannot set properties of
        null" on whichever line happened to touch it first.

     2. `if (el === null) return;` in every render function. Correct and
        unreadable - the real work would be three levels deep in guards that
        can never fire.

     3. One function that looks the element up, throws immediately if it is
        missing, and returns a non-null type. Which is this file.

   The third one is the only one where a renamed id produces an error that names
   the id, at startup, before anything has rendered. */


/* The generic is what makes the return type useful. `mustFind<HTMLInputElement>`
   gives an HTMLInputElement, so `.value` is available without a cast - and the
   runtime check makes the claim real rather than asserted.

   `T extends HTMLElement = HTMLElement` is a constrained parameter with a
   default: callers who do not care get an HTMLElement, callers who do name the
   type they need. */
export function mustFind<T extends HTMLElement = HTMLElement>(id: string): T {
    const element = document.getElementById(id);

    if (element === null) {
        /* Failing loudly at startup. This is the whole argument for the
           helper: the message names the id, and it happens before any render,
           so a typo in index.html cannot turn into a mystery later. */
        throw new Error(`Expected an element with id "${id}" and found none.`);
    }

    return element as T;
}

/* That `as T` is the one assertion in the file, and it is a real claim: nothing
   checks that #query is an input rather than a div. The alternative is
   `instanceof` with the constructor passed in:

       mustFind("query", HTMLInputElement)

   ...which is genuinely safer and which I did not do, because the constructors
   do not exist under Node and the week ends with these files being imported by
   a test runner. Noting it rather than pretending the cast is free. */


/* querySelector inside a node, with the same treatment. Used on cloned template
   content, where a missing element means the template and the code disagree. */
export function queryIn<T extends Element>(root: ParentNode, selector: string): T {
    const found = root.querySelector<T>(selector);

    if (found === null) {
        throw new Error(`Expected "${selector}" inside the template and found none.`);
    }

    return found;
}


/* `cloneNode` is declared as returning `Node`, which has no querySelector - so
   every clone in Day 20's render.js needed narrowing before it could be used.

   `template.content` is a DocumentFragment and cloning it deeply gives another
   one, so the instanceof is a check that always passes. It passes *as a check*
   rather than as an assertion, which is the difference worth having. */
export function cloneTemplate(template: HTMLTemplateElement): DocumentFragment {
    const clone = template.content.cloneNode(true);

    if (!(clone instanceof DocumentFragment)) {
        throw new Error("Cloning a template did not produce a DocumentFragment.");
    }

    return clone;
}


/* Event targets have the same shape of problem. `event.target` is
   `EventTarget | null`, and EventTarget has no `closest`, no `dataset` and no
   `value` - so Day 20's `event.target.closest(...)` is an error in every
   delegated handler.

   An instanceof narrowing is the fix, and it is a real check: `event.target`
   genuinely can be a text node or the document. */
export function elementFrom(event: Event): HTMLElement | null {
    return event.target instanceof HTMLElement ? event.target : null;
}


/* The delegated-handler helper. Day 20 wrote this four times:

       const button = event.target.closest('[data-action="save"]');
       if (!button) return;
       const id = button.closest(".expense").dataset.id;

   Three nullable results in three lines, and the last one is `string |
   undefined` because `dataset` entries always are. */
export function closestAction(
    event: Event,
    actionSelector: string,
    rowSelector: string
): { readonly element: HTMLElement; readonly id: string } | null {
    const target = elementFrom(event);
    if (target === null) return null;

    const element = target.closest(actionSelector);
    if (!(element instanceof HTMLElement)) return null;

    const row = element.closest(rowSelector);
    if (!(row instanceof HTMLElement)) return null;

    const id = row.dataset["id"];
    if (id === undefined) return null;

    return { element, id };
}
