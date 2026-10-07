/* Day 24 - Result<T, E>.

   A generic discriminated union. Day 22 built the pattern with four concrete
   members; this is the same idea with the payload types left as parameters, so
   one declaration covers every operation that can fail.

   The reason it exists: Week 4's storage.js returned
   `{ ok: false, reason: "quota" }` and `{ ok: true }` from the same function,
   as a plain object with no type. Nothing stopped a caller reading `.value` on
   a failure, and nothing reminded them to check `.ok` at all. */

export type Result<T, E = Error> =
    | { readonly ok: true; readonly value: T }
    | { readonly ok: false; readonly error: E };


/* Two constructors, so no caller ever writes the object shape by hand. Both
   infer their type parameter from the argument. */

export function ok<T>(value: T): Result<T, never> {
    return { ok: true, value };
}

export function err<E>(error: E): Result<never, E> {
    return { ok: false, error };
}

/* `Result<T, never>` is the interesting part of those two signatures. `never`
   has no values, so the failure member of the union is uninhabitable and
   TypeScript collapses it away. The result is that `ok(1)` is assignable to
   `Result<number, string>`, `Result<number, Error>` and anything else - the
   error type stays free until the context pins it down. */


/* ---------------------------------------------------------------
   Working with a Result without unwrapping it
   --------------------------------------------------------------- */

/* Two type parameters on the function and one more on the callback, and the
   relationship between them is the whole signature: map turns the success type
   from T into U and leaves the error type alone. */
export function map<T, U, E>(result: Result<T, E>, transform: (value: T) => U): Result<U, E> {
    return result.ok ? ok(transform(result.value)) : result;
}

/* Note the `return result` on the failure path rather than `err(result.error)`.
   Narrowing has already proved it is the failure member, and that member of
   `Result<T, E>` is identical to the failure member of `Result<U, E>` - the
   success type is not mentioned in it. Rebuilding it would allocate a new
   object to no purpose. */

export function unwrapOr<T, E>(result: Result<T, E>, fallback: T): T {
    return result.ok ? result.value : fallback;
}


/* A typed wrapper for the one function in the standard library that returns
   `any`. Everything that comes out of here is a Result over `unknown`, so the
   caller has to narrow before using it - which is the behaviour JSON.parse
   should have had. */
export function safeJsonParse(text: string): Result<unknown, SyntaxError> {
    try {
        return ok(JSON.parse(text) as unknown);
    } catch (error) {
        // JSON.parse only ever throws SyntaxError, but `catch` gives unknown
        // and the narrowing has to be done rather than asserted.
        return err(error instanceof SyntaxError ? error : new SyntaxError(String(error)));
    }
}
