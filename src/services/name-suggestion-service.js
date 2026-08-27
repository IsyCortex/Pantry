// Ticket 4.1 — item-name suggestions derived from the household's existing or
// prior entries. Purely a read-side calculation over stored entries: a
// suggestion is only a candidate value for the entry form and can never
// create or modify inventory. Prefill happens solely through explicit user
// selection in the UI; nothing here writes or silently merges anything.

function normalizeName(value) {
  return String(value ?? '').trim().toLowerCase();
}

/**
 * Build ranked suggestions from stored name/location entry pairs.
 *
 * Ranking rules (deterministic):
 *   1. names starting with the query rank above names merely containing it
 *   2. higher total usage frequency ranks first within each group
 *   3. lexicographic name order breaks remaining ties
 *
 * Each suggestion carries the most frequently used location for that exact
 * name (ties resolved lexicographically) so selecting it can prefill a common
 * location. Distinct-but-similar names stay distinct suggestions; only
 * spellings that are identical ignoring case/whitespace collapse into one
 * candidate, which is deduplication of the same product rather than merging.
 */
function buildNameSuggestions(entries, rawQuery, { limit = 5 } = {}) {
  const query = normalizeName(rawQuery);
  if (!query || !(limit > 0)) {
    return [];
  }

  const byName = new Map();
  for (const entry of Array.isArray(entries) ? entries : []) {
    const displayName = String(entry?.name ?? '').trim();
    const location = String(entry?.location ?? '').trim();
    const key = normalizeName(displayName);
    if (!key) {
      continue;
    }

    let bucket = byName.get(key);
    if (!bucket) {
      bucket = { name: displayName, total: 0, locations: new Map() };
      byName.set(key, bucket);
    }
    // Deterministic representative spelling for one deduplicated candidate:
    // prefer a naturally cased spelling over an ALL-CAPS shout, then the
    // shortest, then lexicographic order.
    const currentIsAllUpper = bucket.name.length > 0 && bucket.name === bucket.name.toUpperCase();
    const candidateIsAllUpper = displayName.length > 0 && displayName === displayName.toUpperCase();
    const isBetter =
      (currentIsAllUpper && !candidateIsAllUpper) ||
      (currentIsAllUpper === candidateIsAllUpper &&
        (displayName.length < bucket.name.length ||
          (displayName.length === bucket.name.length && displayName < bucket.name)));
    if (isBetter) {
      bucket.name = displayName;
    }
    if (!location) {
      continue;
    }
    bucket.total += 1;
    bucket.locations.set(location, (bucket.locations.get(location) || 0) + 1);
  }

  const matches = [];
  for (const bucket of byName.values()) {
    if (!bucket.name.toLowerCase().includes(query)) {
      continue;
    }

    let bestLocation = '';
    let bestCount = -1;
    for (const [location, count] of bucket.locations) {
      if (count > bestCount || (count === bestCount && location < bestLocation)) {
        bestLocation = location;
        bestCount = count;
      }
    }

    matches.push({
      suggestion: { name: bucket.name, location: bestLocation },
      startsWith: bucket.name.toLowerCase().startsWith(query),
      total: bucket.total
    });
  }

  matches.sort((a, b) => {
    if (a.startsWith !== b.startsWith) {
      return a.startsWith ? -1 : 1;
    }
    if (b.total !== a.total) {
      return b.total - a.total;
    }
    return a.suggestion.name.localeCompare(b.suggestion.name);
  });

  return matches.slice(0, limit).map((match) => match.suggestion);
}

module.exports = {
  buildNameSuggestions,
  normalizeName
};