// Ticket 4.2 — detection of possible duplicates between draft batch rows and
// the household's ACTIVE inventory. Purely advisory and read-only: results
// are warnings shown while entering a batch; they never block confirmation,
// never modify anything, and never merge anything. Quantities, units,
// locations, and expiration dates deliberately play NO role in matching —
// they are carried through only so the user can judge the warning. Saving
// keeps both entries side by side (confirmation semantics unchanged).
//
// Matching philosophy is CONSERVATIVE (precision over recall): warn only when
// two spellings almost certainly denote the same product, stay silent on
// lookalike-but-distinct products (e.g. Milk vs Buttermilk — substring
// similarity deliberately does NOT fire). Both calibrations are pinned by
// docs/fixtures/duplicate-detection/*.json so future tuning cannot silently
// regress false positives or false negatives.
const { normalizeName } = require('./name-suggestion-service');

// Warning reasons, ordered most-confident first. rank doubles as sort key so
// identical inputs always produce identical output ordering.
const DUPLICATE_RULES = [
  {
    rule: 'same_name',
    rank: 1,
    detail: 'Identical name (case and spacing ignored)'
  },
  {
    rule: 'plural_form',
    rank: 2,
    detail: 'Same name apart from singular/plural wording'
  },
  {
    rule: 'likely_typo',
    rank: 3,
    detail: 'Name differs by a single character — possible typo'
  }
];
const RULE_BY_NAME = new Map(DUPLICATE_RULES.map((entry) => [entry.rule, entry]));

// Conservative plural folding: besides the literal spelling accept the
// spelling minus ONE trailing -s/-es (never below 3 characters). Only a whole
// trailing plurality ending is collapsed; nothing else changes.
function pluralVariants(normalizedName) {
  const variants = new Set([normalizedName]);
  const strippedEs = normalizedName.replace(/es$/, '');
  if (strippedEs !== normalizedName && strippedEs.length >= 3) {
    variants.add(strippedEs);
  }
  const strippedS = normalizedName.replace(/s$/, '');
  if (strippedS !== normalizedName && strippedS.length >= 3) {
    variants.add(strippedS);
  }
  return variants;
}

// Only whole trailing plurality endings are collapsed above; this key adds
// whitespace folding so names differing purely in spacing ("Oat  Milk" vs
// "Oat Milk") compare equal without touching the displayed spelling.
function comparisonKey(name) {
  return String(name).replace(/\s+/g, ' ').trim();
}

/**
 * Restricted Damerau-Levenshtein distance (insertions, deletions,
 * substitutions, adjacent transpositions). Product names are short, so the
 * full dynamic-programming table costs nothing; three rolling rows are kept
 * because the transposition case reaches back to row i-2.
 */
function damerauLevenshtein(a, b) {
  const lenA = a.length;
  const lenB = b.length;
  if (lenA === 0) return lenB;
  if (lenB === 0) return lenA;

  let rowMinus2 = null;
  let rowMinus1 = new Array(lenB + 1);
  for (let j = 0; j <= lenB; j += 1) {
    rowMinus1[j] = j;
  }

  for (let i = 1; i <= lenA; i += 1) {
    const current = new Array(lenB + 1);
    current[0] = i;
    for (let j = 1; j <= lenB; j += 1) {
      const substitutionCost = a[i - 1] === b[j - 1] ? 0 : 1;
      let value = Math.min(
        rowMinus1[j] + 1,
        current[j - 1] + 1,
        rowMinus1[j - 1] + substitutionCost
      );
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        value = Math.min(value, rowMinus2[j - 2] + 1);
      }
      current[j] = value;
    }
    rowMinus2 = rowMinus1;
    rowMinus1 = current;
  }
  return rowMinus1[lenB];
}

/**
 * All active inventory entries plausibly denoting the same product as the
 * given draft row (row may be a bare name string or a row-like object).
 *
 * Deterministic order: more confident rules first (same_name -> plural_form
 * -> likely_typo), then the stored item id ascending. Quantity, unit,
 * location, and expiration date NEVER influence whether something matches.
 */
function findRowDuplicateMatches(row, activeItems) {
  const rawName = typeof row === 'string' ? row : (row?.name ?? '');
  const normalized = normalizeName(rawName);
  if (!normalized) {
    return [];
  }
  const rowKey = comparisonKey(normalized);

  const items = Array.isArray(activeItems) ? activeItems : [];
  const matches = [];
  for (const item of items) {
    const itemName = String(item?.name ?? '').trim();
    const itemNormalized = normalizeName(itemName);
    if (!itemNormalized) {
      continue;
    }
    const itemKey = comparisonKey(itemNormalized);

    let matchedRule = null;
    if (itemKey === rowKey) {
      matchedRule = 'same_name';
    } else {
      const rowVariants = pluralVariants(rowKey);
      const itemVariants = pluralVariants(itemKey);
      const intersects = rowVariants.has(itemKey) || itemVariants.has(rowKey);
      if (intersects) {
        matchedRule = 'plural_form';
      } else if (
        rowKey.length >= 4 &&
        itemKey.length >= 4 &&
        Math.abs(rowKey.length - itemKey.length) <= 1 &&
        damerauLevenshtein(rowKey, itemKey) <= 1
      ) {
        matchedRule = 'likely_typo';
      }
    }

    if (!matchedRule) {
      continue;
    }

    const descriptor = RULE_BY_NAME.get(matchedRule);
    // Database drivers can hand numeric columns back as strings; expose
    // stable JSON types (numbers where the schema says number).
    const asNumber = (value) => {
      if (value == null || value === '') return null;
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : value;
    };
    matches.push({
      rule: matchedRule,
      ruleRank: descriptor.rank,
      ruleDetail: descriptor.detail,
      matchedItem: {
        id: asNumber(item.id),
        name: itemName,
        quantity: asNumber(item.quantity),
        unit: item.unit == null ? '' : String(item.unit),
        location: item.location == null ? '' : String(item.location),
        expirationDate: item.expirationDate == null ? '' : String(item.expirationDate),
        dateType: item.dateType == null ? '' : String(item.dateType)
      }
    });
  }

  matches.sort((a, b) => {
    if (a.ruleRank !== b.ruleRank) {
      return a.ruleRank - b.ruleRank;
    }
    return Number(a.matchedItem.id ?? 0) - Number(b.matchedItem.id ?? 0);
  });
  return matches;
}

/**
 * Compare every draft row against the active inventory. Returns one array of
 * matches per input row (aligned by index). Rows without a usable name yield
 * an empty array.
 */
function findDraftRowDuplicates(draftRows, activeItems) {
  const rows = Array.isArray(draftRows) ? draftRows : [];
  return rows.map((row) => findRowDuplicateMatches(row, activeItems));
}

module.exports = {
  DUPLICATE_RULES,
  damerauLevenshtein,
  findRowDuplicateMatches,
  findDraftRowDuplicates
};
