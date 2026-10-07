/* The things about JSX that are not obvious from looking at it, rendered onto
   the page so the day has something to read as well as something to inspect.

   Written as a component rather than as markup in index.html because it is
   part of the tree - and because it exercises the one JSX rule that catches
   everybody: a component returns one node, so a list of paragraphs needs
   something to wrap it. This uses a fragment. */

export function JsxNotes() {
    return (
        /* <>...</> is a fragment: a wrapper that groups children and renders no
           element at all. The alternative is a <div> that exists only to
           satisfy the one-root rule and then has to be styled around.

           The long form is <Fragment>, and it is needed when a key is
           required - a fragment in a `.map` cannot take a key in the short
           syntax. */
        <>
            <p>
                JSX is not HTML and it is not a template language. It is
                syntax that compiles to function calls, so everything that
                looks like an attribute is really an argument.
            </p>

            <dl className="notes-list">
                <dt>
                    <code>className</code>, not <code>class</code>
                </dt>
                <dd>
                    The props map to DOM properties rather than HTML
                    attributes, and <code>class</code> is a reserved word in
                    JavaScript. Same reason <code>for</code> on a label is{" "}
                    <code>htmlFor</code>.
                </dd>

                <dt>
                    <code>{"{expression}"}</code> is TypeScript
                </dt>
                <dd>
                    Anything in braces is evaluated at render time and the
                    result is escaped before it reaches the DOM. There is no{" "}
                    <code>textContent</code> against <code>innerHTML</code>
                    decision to get wrong, which was a real risk in Week 4 with
                    titles coming from a public API.
                </dd>

                <dt>One root node</dt>
                <dd>
                    A component returns a single node, because the compiled
                    form is a single function call. A fragment groups siblings
                    without adding an element.
                </dd>

                <dt>
                    <code>key</code> on a list
                </dt>
                <dd>
                    Not a prop the component receives. It is how React matches
                    an element across renders, which is why it has to be stable
                    and unique and why an array index is the wrong answer.
                </dd>

                <dt>Capitalisation decides everything</dt>
                <dd>
                    <code>&lt;Panel /&gt;</code> compiles to a reference to the{" "}
                    <code>Panel</code> variable; <code>&lt;panel /&gt;</code>{" "}
                    compiles to the string <code>"panel"</code> and renders an
                    unknown element. Lowercase means a DOM tag, uppercase means
                    a component.
                </dd>

                <dt>Comments</dt>
                <dd>
                    Inside JSX they go in braces, because a <code>//</code>
                    would be rendered as text. That is why every comment in
                    these files is either above the <code>return</code> or
                    wrapped in braces.
                </dd>
            </dl>

            <p className="text-sm text-muted">
                The <code>{'{" "}'}</code> above is a deliberate space. JSX
                collapses whitespace that contains a newline, so a line break
                between an element and the next word removes the space
                entirely &mdash; which is the first JSX bug I hit today, and it
                looked like a CSS problem.
            </p>
        </>
    );
}
