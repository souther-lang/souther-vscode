// How much of what the `example` rows cover the server is asked to measure.
//
// The server reads this once, out of `initializationOptions`, and answers the coverage lens and the
// offer to write the missing rows only where it was asked. A level it does not know is off, which is
// what a jar older than the setting does with it too.

'use strict';

/** What `souther.adequacy` may be, cheapest first. */
const LEVELS = ['off', 'witness', 'all'];

/**
 * The `initializationOptions` for a client asking for this much.
 *
 * `off` is sent rather than left out. The server treats an absent option and an unknown one alike,
 * so saying so costs nothing and keeps the message readable against the setting it came from.
 */
function initializationOptions(adequacy) {
  return { souther: { adequacy: LEVELS.includes(adequacy) ? adequacy : 'off' } };
}

module.exports = { LEVELS, initializationOptions };
