/* The page header. No props, no state, no logic - and it is still worth being
   a component, because App stays readable when the markup it composes is
   named rather than inlined. */

export function Header() {
    return (
        <header className="app-header">
            <h1>Reading List</h1>
            <p className="text-muted">
                Day 26 &mdash; the Week 4 page as a React component tree. Static
                data, no state and no fetching: today is about where the
                boundaries between components go.
            </p>
        </header>
    );
}
