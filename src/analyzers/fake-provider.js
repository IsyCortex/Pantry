'use strict';

const { assertAnalyzerInput, assertAnalyzerProposal } = require('../validation/analyzer-contract');

const NUMBER_WORDS = { one: 1, two: 2, three: 3, four: 4, five: 5 };
const LOCATION_PATTERN = /\b(pantry|fridge|freezer)\b/i;
const DATE_PATTERN = /\b(best before|use by)\s+(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December)\b/i;
const MONTHS = { january: 0, february: 1, march: 2, april: 3, may: 4, june: 5, july: 6, august: 7, september: 8, october: 9, november: 10, december: 11 };
const KNOWN_FOODS = new Set(['milk', 'rice', 'frozen peas', 'peas', 'eggs', 'flour', 'apples', 'pears']);

function numberValue(value) { return NUMBER_WORDS[value.toLowerCase()] || Number(value); }

function emptyItem(name, location = null) {
  return { name, quantity: null, unit: null, location, expirationDate: null, dateType: null };
}

function parseDate(text, referenceDate) {
  const match = text.match(DATE_PATTERN);
  if (!match) return { expirationDate: null, dateType: null };
  const month = MONTHS[match[3].toLowerCase()];
  const day = Number(match[2]);
  const reference = new Date(`${referenceDate}T00:00:00Z`);
  let year = reference.getUTCFullYear();
  if (month < reference.getUTCMonth() || (month === reference.getUTCMonth() && day < reference.getUTCDate())) year += 1;
  return { expirationDate: `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`, dateType: match[1].toLowerCase() === 'use by' ? 'use_by' : 'best_before' };
}

function parseSegment(segment, inheritedLocation, referenceDate) {
  const locationMatch = segment.match(LOCATION_PATTERN);
  const location = locationMatch ? locationMatch[1].toLowerCase() : inheritedLocation;
  const date = parseDate(segment, referenceDate);
  const cleaned = segment.replace(LOCATION_PATTERN, '').replace(DATE_PATTERN, '').replace(/[.!]/g, '').trim();
  const itemPattern = /(?:(one|two|three|four|five|\d+(?:\.\d+)?)\s+)?(?:(cartons?|bags?|boxes?|bottles?|packages?|packs?)\s+of\s+)?([a-z][a-z -]*?)(?=\s+and\s+|,|$)/gi;
  const items = [];
  let match;
  while ((match = itemPattern.exec(cleaned))) {
    let name = match[3].trim().replace(/\s+$/, '').replace(/^(?:and\s+)?(?:maybe some|a bit of|some)\s+/i, '');
    if (!name || /^(?:things?|items?)$/i.test(name) || !KNOWN_FOODS.has(name.toLowerCase())) continue;
    const item = emptyItem(name.toLowerCase(), location);
    if (match[1] && !/^(?:maybe some|a bit of|some)/i.test(match[0])) {
      item.quantity = numberValue(match[1]);
      item.unit = match[2] ? 'package' : null;
    }
    if (/^(?:maybe some|a bit of)/i.test(match[0])) { item.quantity = null; item.unit = null; }
    if (items.length === 0 && date.expirationDate) Object.assign(item, date);
    items.push(item);
  }
  return items;
}

function parseRawText(input) {
  const segments = input.rawText.split(/\.(?=\s|$)/).map((part) => part.trim()).filter(Boolean);
  let location = null;
  return segments.flatMap((segment) => {
    const locationMatch = segment.match(LOCATION_PATTERN);
    if (locationMatch) location = locationMatch[1].toLowerCase();
    return parseSegment(segment, location, input.referenceDate);
  });
}

function createFakeAnalyzerProvider() {
  return {
    name: 'fake',
    async analyze(input) {
      assertAnalyzerInput(input);
      const output = { items: parseRawText(input) };
      assertAnalyzerProposal(output);
      return JSON.parse(JSON.stringify(output));
    }
  };
}

module.exports = { createFakeAnalyzerProvider, parseRawText };