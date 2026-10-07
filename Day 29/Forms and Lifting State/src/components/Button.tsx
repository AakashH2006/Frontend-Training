/* A button that is still a button.

   The pattern I was looking for: a component that adds a variant and keeps
   everything a native <button> can do - type, disabled, aria-pressed,
   onClick, formAction, anything. */

import type { ComponentProps } from "react";

type Variant = "primary" | "quiet" | "danger";

/* `ComponentProps<"button">` is every prop React accepts on a <button>,
   including the whole DOM event set and all the aria-* attributes. Extending
   it means this component inherits them rather than re-declaring the four I
   happen to need today and discovering the fifth is missing on Day 30.

   `Omit<..., "className">` is deliberate: className is computed here from the
   variant, so letting a caller also pass one would mean two sources deciding
   the same thing. Taking it out of the type makes that a compile error rather
   than a surprise. */
interface ButtonProps extends Omit<ComponentProps<"button">, "className"> {
    readonly variant?: Variant;
    readonly small?: boolean;
}

/* A closed Record, so adding a variant is a compile error here until it has a
   class. Day 23's lesson, and the reason this is not a string template. */
const VARIANT_CLASS: Record<Variant, string> = {
    primary: "",
    quiet: "button--quiet",
    danger: "button--danger"
};

export function Button({
    variant = "primary",
    small = false,
    type = "button",
    ...rest
}: ButtonProps) {
    const className = ["button", VARIANT_CLASS[variant], small ? "button--small" : ""]
        .filter((part) => part.length > 0)
        .join(" ");

    /* `type = "button"` as a default is the bug-prevention that matters most
       in this file. A <button> inside a <form> defaults to type="submit", so
       a "Remove" button in a form submits the form. Week 4's markup wrote
       type="button" on every single one by hand; here it is the default and
       a caller has to ask for "submit" explicitly. */
    return <button type={type} className={className} {...rest} />;
}

/* `{...rest}` spread last, on purpose. Props are applied left to right, so
   anything in `rest` would override `type` and `className` if it came after -
   and here `className` is not in `rest` at all because the type removed it.

   Spreading is worth being careful with: it is convenient exactly because it
   hides what is being passed. It is right here, where the whole point is to
   forward the native props, and wrong on a domain component where it turns
   a typo into a silently-ignored attribute. */
