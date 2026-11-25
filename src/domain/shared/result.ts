/**
 * Result type for expected, business-level failures.
 *
 * Domain and application code returns `Result` for failures the caller is
 * supposed to handle (e.g. "ticket not found", "SLA already expired") and
 * reserves exceptions for programmer errors and infrastructure faults.
 */
export type Ok<T> = { readonly ok: true; readonly value: T };
export type Err<E> = { readonly ok: false; readonly error: E };
export type Result<T, E> = Ok<T> | Err<E>;

export const ok = <T>(value: T): Ok<T> => ({ ok: true, value });
export const err = <E>(error: E): Err<E> => ({ ok: false, error });
