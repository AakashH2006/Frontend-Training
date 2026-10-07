/* One figure with a label. The smallest useful component in the project, and
   the one that made the case for small components: SummaryBar had this markup
   twice, once inline and once inside a map, and the two had drifted. */

interface StatProps {
    readonly label: string;
    /* `string | number` rather than `string`, so callers do not have to
       String() a count at every call site. JSX renders both. */
    readonly value: string | number;
}

export function Stat({ label, value }: StatProps) {
    return (
        <li className="summary__tile">
            <span className="summary__label">{label}</span>
            <span className="summary__value">{value}</span>
        </li>
    );
}
