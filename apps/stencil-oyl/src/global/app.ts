/**
 * Stencil global script: runs once when the bundle loads, before any component. Importing
 * the client layer here puts ONE copy of the reactive core in the shared chunk that every
 * component entry imports — rather than a copy per entry, which would mean screens silently
 * stop updating. `src/index.ts` re-exports the same instance for specs.
 */
import '@oyl/all-of-oyl/client'

export default function () {}
