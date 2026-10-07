/* Controlled against uncontrolled, side by side, because the difference is
   easiest to see when both are on the page.

   This is the only component this week that reaches for a ref, and it is here
   to show what is given up rather than as a recommendation. */

import { useRef, useState } from "react";
import { Button } from "./Button";

export function ControlledNotes() {
    const [controlled, setControlled] = useState("");

    /* An uncontrolled input: the DOM holds the value and React does not know
       it until something asks. `defaultValue`, not `value` - passing `value`
       without `onChange` is the frozen-field mistake.

       `HTMLInputElement | null` because the ref is null until the element
       mounts, which is why the read below is guarded. */
    const uncontrolledRef = useRef<HTMLInputElement | null>(null);
    const [readValue, setReadValue] = useState<string | null>(null);

    return (
        <>
            <div className="field">
                <label htmlFor="controlled-demo">Controlled</label>
                <input
                    id="controlled-demo"
                    value={controlled}
                    onChange={(event) => setControlled(event.target.value.toUpperCase())}
                    autoComplete="off"
                />
                {/* Three things that are only possible because the value is in
                    state: a live count, a live transform (typing lowercase
                    produces uppercase), and a derived validation message. All
                    of them are render-time reads of something already here. */}
                <p className="text-sm text-muted">
                    {controlled.length} characters, forced to uppercase as you type
                </p>
                {controlled.length > 0 && controlled.length < 3 && (
                    <p className="field-error">Three characters or more.</p>
                )}
            </div>

            <div className="field">
                <label htmlFor="uncontrolled-demo">Uncontrolled</label>
                <input
                    id="uncontrolled-demo"
                    ref={uncontrolledRef}
                    defaultValue=""
                    autoComplete="off"
                />
                <div className="form-actions">
                    <Button
                        small
                        variant="quiet"
                        onClick={() => setReadValue(uncontrolledRef.current?.value ?? "")}
                    >
                        Read it
                    </Button>
                </div>
                <p className="text-sm text-muted">
                    {readValue === null
                        ? "React does not know what is in this one until asked."
                        : `Read on demand: "${readValue}"`}
                </p>
            </div>

            <p className="text-sm text-muted">
                The uncontrolled field cannot show a live count or transform what
                is typed, because nothing re-renders when it changes. It does not
                re-render on every keystroke either, which is the trade.
            </p>
        </>
    );
}
