/**
 * Test script for geocoding brand matching logic
 * Run with: node lib/scrapers/test-geocoding.js
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env.local') });

// Simulate the geocoding logic locally for testing
const MIN_SIGNATURE_LENGTH = 3;

const BRAND_FAMILY_MAP = {
  kroger: [
    "kroger", "ralphs", "fredmeyer", "fred meyer", "smiths", "frys", "fry's",
    "kingsoopers", "king soopers", "marianos", "mariano's", "picknsave", "pick n save",
    "food4less", "food 4 less", "food4-less", "food 4-less", "foodsco", "foods co", "food co", "foodco",
    "citymarket", "city market",
    "dillons", "harristeeter", "harris teeter", "bakers", "gerbes", "qfc", "metro market"
  ],
  safeway: [
    "safeway", "albertsons", "vons", "pavilions", "randalls", "tom thumb",
    "jewel", "jewelosco", "jewel-osco", "acme", "shaws", "star market", "andronicos"
  ],
  target: ["target"],
  walmart: ["walmart", "neighborhood market", "sams club", "sam's club"],
  aldi: ["aldi"],
  traderjoes: ["trader joe's", "trader joes", "traderjoes"],
  wholefoods: ["whole foods", "wholefoods"],
  costco: ["costco"],
  "99ranch": ["99 ranch", "99ranch", "ranch 99", "ranch99"],
  meijer: ["meijer"],
};

// Build reverse lookup
const SUBSIDIARY_TO_PARENT = new Map();
for (const [parent, subsidiaries] of Object.entries(BRAND_FAMILY_MAP)) {
  for (const sub of subsidiaries) {
    const normalized = sub.toLowerCase().replace(/[^a-z0-9]/g, "");
    SUBSIDIARY_TO_PARENT.set(normalized, parent);
  }
}

function canonicalizeStoreName(value) {
  return (value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\u2019\u2018]/g, "'")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function getBrandFamilyMembers(storeName) {
  const normalized = canonicalizeStoreName(storeName);

  const parent = SUBSIDIARY_TO_PARENT.get(normalized);
  if (parent && BRAND_FAMILY_MAP[parent]) {
    return BRAND_FAMILY_MAP[parent];
  }

  for (const [parentKey, subsidiaries] of Object.entries(BRAND_FAMILY_MAP)) {
    if (normalized.includes(parentKey) || parentKey.includes(normalized)) {
      return subsidiaries;
    }
  }

  return [];
}

function levenshteinDistance(a, b) {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  if (a === b) return 0;

  if (a.length > b.length) {
    const temp = a;
    a = b;
    b = temp;
  }

  const aLen = a.length;
  const bLen = b.length;
  const row = new Array(aLen + 1);

  for (let i = 0; i <= aLen; i++) {
    row[i] = i;
  }

  for (let i = 1; i <= bLen; i++) {
    let prev = i;
    for (let j = 1; j <= aLen; j++) {
      const val = b[i - 1] === a[j - 1] ? row[j - 1] : Math.min(row[j - 1], prev, row[j]) + 1;
      row[j - 1] = prev;
      prev = val;
    }
    row[aLen] = prev;
  }

  return row[aLen];
}

function isFuzzyMatch(a, b, maxDistance) {
  if (!a || !b) return false;

  const normA = a.toLowerCase().replace(/[^a-z0-9]/g, "");
  const normB = b.toLowerCase().replace(/[^a-z0-9]/g, "");

  if (normA === normB) return true;
  if (normA.length < 3 || normB.length < 3) return false;

  const threshold = maxDistance ?? Math.max(1, Math.floor(Math.min(normA.length, normB.length) * 0.2));
  const distance = levenshteinDistance(normA, normB);

  return distance <= threshold;
}

function normalizeTokens(value) {
  if (!value) return [];
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\u2019\u2018]/g, "'")
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .map(part => part.trim())
    .filter(part => part.length > 0);
}

function createBrandMatcher(storeName, aliasTokens) {
  const signatures = new Set();

  const addSignature = (value) => {
    const sig = canonicalizeStoreName(value || "");
    if (sig && sig.length >= MIN_SIGNATURE_LENGTH) {
      signatures.add(sig);
    }
  };

  addSignature(storeName);
  (aliasTokens || []).forEach(alias => addSignature(alias));

  const familyMembers = getBrandFamilyMembers(storeName);
  for (const member of familyMembers) {
    addSignature(member);
  }

  (aliasTokens || []).forEach(alias => {
    const aliasFamily = getBrandFamilyMembers(alias);
    for (const member of aliasFamily) {
      addSignature(member);
    }
  });

  if (signatures.size === 0) {
    return () => false;
  }

  const allFamilySignatures = new Set();
  for (const member of familyMembers) {
    const sig = canonicalizeStoreName(member);
    if (sig && sig.length >= MIN_SIGNATURE_LENGTH) {
      allFamilySignatures.add(sig);
    }
  }

  console.log(`\n[BrandMatcher] Created for "${storeName}"`);
  console.log(`  Signatures: ${Array.from(signatures).join(', ')}`);
  console.log(`  Family signatures for fuzzy: ${Array.from(allFamilySignatures).join(', ')}`);

  return (value) => {
    if (!value) return false;
    const tokens = normalizeTokens(value);
    if (!tokens.length) return false;

    const fullNormalized = canonicalizeStoreName(value);

    console.log(`\n  [Checking] "${value}"`);
    console.log(`    Full normalized: "${fullNormalized}"`);
    console.log(`    Tokens: ${tokens.join(', ')}`);

    for (const sig of signatures) {
      // Check full value first
      if (fullNormalized === sig) {
        console.log(`    ✓ MATCH: fullNormalized === sig ("${sig}")`);
        return true;
      }
      if (sig.length >= 5 && fullNormalized.includes(sig)) {
        console.log(`    ✓ MATCH: fullNormalized includes sig ("${sig}")`);
        return true;
      }
      if (fullNormalized.startsWith(sig) && fullNormalized.length - sig.length <= 4) {
        console.log(`    ✓ MATCH: fullNormalized starts with sig ("${sig}")`);
        return true;
      }

      for (const token of tokens) {
        if (token === sig) {
          console.log(`    ✓ MATCH: token "${token}" === sig "${sig}"`);
          return true;
        }
        if (token.endsWith(sig) && token.length - sig.length <= 4) {
          console.log(`    ✓ MATCH: token "${token}" ends with sig "${sig}"`);
          return true;
        }
        if (sig.endsWith(token) && sig.length - token.length <= 2) {
          console.log(`    ✓ MATCH: sig "${sig}" ends with token "${token}"`);
          return true;
        }
        if (token.startsWith(sig) && token.length - sig.length <= 4) {
          console.log(`    ✓ MATCH: token "${token}" starts with sig "${sig}"`);
          return true;
        }
        if (sig.length >= 5 && token.includes(sig)) {
          console.log(`    ✓ MATCH: token "${token}" includes sig "${sig}"`);
          return true;
        }
      }
    }

    // Fuzzy match against brand family members
    for (const familySig of allFamilySignatures) {
      if (familySig.length >= 4 && isFuzzyMatch(fullNormalized, familySig)) {
        const dist = levenshteinDistance(fullNormalized, familySig);
        console.log(`    ✓ FUZZY MATCH: fullNormalized "${fullNormalized}" ~ familySig "${familySig}" (distance: ${dist})`);
        return true;
      }
      for (const token of tokens) {
        if (familySig.length >= 4 && isFuzzyMatch(token, familySig)) {
          const dist = levenshteinDistance(token, familySig);
          console.log(`    ✓ FUZZY MATCH: token "${token}" ~ familySig "${familySig}" (distance: ${dist})`);
          return true;
        }
      }
    }

    console.log(`    ✗ NO MATCH`);
    return false;
  };
}

const axios = require('axios');

const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;

async function geocodePostalCode(postalCode) {
  try {
    const response = await axios.get('https://maps.googleapis.com/maps/api/geocode/json', {
      params: {
        address: postalCode,
        key: GOOGLE_MAPS_API_KEY
      }
    });

    if (response.data.status === 'OK' && response.data.results.length > 0) {
      const { lat, lng } = response.data.results[0].geometry.location;
      return { lat, lng };
    }
    console.error('Geocode failed with status:', response.data.status, response.data.error_message || '');
    return null;
  } catch (error) {
    console.error('Error geocoding postal code:', error.message);
    if (error.response) {
      console.error('Response data:', error.response.data);
    }
    return null;
  }
}

async function textSearch(query, location, radiusMeters) {
  try {
    const response = await axios.get('https://maps.googleapis.com/maps/api/place/textsearch/json', {
      params: {
        query,
        location: `${location.lat},${location.lng}`,
        radius: radiusMeters,
        key: GOOGLE_MAPS_API_KEY
      }
    });

    return response.data;
  } catch (error) {
    console.error('Error in text search:', error.message);
    return null;
  }
}

async function nearbySearch(keyword, location, radiusMeters) {
  try {
    const response = await axios.get('https://maps.googleapis.com/maps/api/place/nearbysearch/json', {
      params: {
        keyword,
        location: `${location.lat},${location.lng}`,
        radius: radiusMeters,
        type: 'grocery_or_supermarket',
        key: GOOGLE_MAPS_API_KEY
      }
    });

    return response.data;
  } catch (error) {
    console.error('Error in nearby search:', error.message);
    return null;
  }
}

function calculateDistance(lat1, lng1, lat2, lng2) {
  const R = 6371; // km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c * 0.621371; // Convert to miles
}

async function searchStores(storeName, zipCode) {
  console.log("=".repeat(80));
  console.log(`SEARCHING: "${storeName}" near ${zipCode}`);
  console.log("=".repeat(80));

  if (!GOOGLE_MAPS_API_KEY) {
    console.error("ERROR: GOOGLE_MAPS_API_KEY not set in environment");
    process.exit(1);
  }

  // Get coordinates for zip code
  const coords = await geocodePostalCode(zipCode);
  if (!coords) {
    console.error(`Could not geocode zip code: ${zipCode}`);
    process.exit(1);
  }
  console.log(`\nZip code ${zipCode} -> lat: ${coords.lat}, lng: ${coords.lng}`);

  const radiusMeters = 16093.4; // 10 miles
  const matcher = createBrandMatcher(storeName);

  // Get brand family for additional searches
  const familyMembers = getBrandFamilyMembers(storeName);
  const keywordsToTry = [`${storeName} store`];

  const normalizedStore = storeName.toLowerCase().replace(/[^a-z0-9]/g, "");
  for (const member of familyMembers) {
    const normalizedMember = member.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (normalizedMember !== normalizedStore) {
      keywordsToTry.push(`${member} store`);
    }
  }

  console.log(`\nKeywords to search: ${keywordsToTry.join(', ')}`);

  // Track all matched and the final selection
  const allMatched = [];
  let selectedStore = null;

  // Text Search
  console.log("\n" + "=".repeat(80));
  console.log("TEXT SEARCH RESULTS");
  console.log("=".repeat(80));

  for (const keyword of keywordsToTry) {
    const textQuery = `${keyword} near ${zipCode}`;
    console.log(`\n--- Query: "${textQuery}" ---`);

    const textResults = await textSearch(textQuery, coords, radiusMeters);

    if (textResults?.status === 'OK' && textResults.results?.length > 0) {
      console.log(`\nFound ${textResults.results.length} results:\n`);

      for (const place of textResults.results) {
        const lat = place.geometry?.location?.lat;
        const lng = place.geometry?.location?.lng;
        const distance = lat && lng ? calculateDistance(coords.lat, coords.lng, lat, lng) : null;
        const matches = matcher(place.name);

        console.log(`  ${matches ? '✓' : '✗'} ${place.name} - ${distance ? distance.toFixed(2) + ' mi' : ''} - Match: ${matches ? 'YES' : 'NO'} [text-search]`);

        if (matches) {
          allMatched.push({
            name: place.name,
            address: place.formatted_address || place.vicinity,
            lat,
            lng,
            distance,
            source: 'text-search'
          });
        }
      }
      break; // Found results, stop searching
    }
  }

  // Nearby Search
  console.log("\n" + "=".repeat(80));
  console.log("NEARBY SEARCH RESULTS");
  console.log("=".repeat(80));

  for (const keyword of keywordsToTry.slice(0, 3)) { // Limit to first 3 keywords
    console.log(`\n--- Keyword: "${keyword}" ---`);

    const nearbyResults = await nearbySearch(keyword, coords, radiusMeters);

    if (nearbyResults?.status === 'OK' && nearbyResults.results?.length > 0) {
      console.log(`\nFound ${nearbyResults.results.length} results:\n`);

      for (const place of nearbyResults.results) {
        const lat = place.geometry?.location?.lat;
        const lng = place.geometry?.location?.lng;
        const distance = lat && lng ? calculateDistance(coords.lat, coords.lng, lat, lng) : null;
        const matches = matcher(place.name);

        console.log(`  ${matches ? '✓' : '✗'} ${place.name} - ${distance ? distance.toFixed(2) + ' mi' : ''} - Match: ${matches ? 'YES' : 'NO'} [nearby-search]`);

        if (matches) {
          // Check if already in allMatched
          const exists = allMatched.find(m => m.name === place.name && m.lat === lat && m.lng === lng);
          if (!exists) {
            allMatched.push({
              name: place.name,
              address: place.vicinity,
              lat,
              lng,
              distance,
              source: 'nearby-search'
            });
          }
        }
      }
      break; // Found results, stop searching
    }
  }

  // Sort matched by distance
  allMatched.sort((a, b) => (a.distance || Infinity) - (b.distance || Infinity));

  // Select the closest one
  if (allMatched.length > 0) {
    selectedStore = allMatched[0];
  }

  // Summary
  console.log("\n" + "=".repeat(80));
  console.log("SUMMARY");
  console.log("=".repeat(80));

  console.log("\n--- ALL MATCHED STORES ---\n");
  if (allMatched.length === 0) {
    console.log("  No stores matched the brand filter.");
  } else {
    for (let i = 0; i < allMatched.length; i++) {
      const store = allMatched[i];
      console.log(`  ${i + 1}. ${store.name}`);
      console.log(`     Address: ${store.address}`);
      console.log(`     Lat/Lng: ${store.lat}, ${store.lng}`);
      console.log(`     Distance: ${store.distance ? store.distance.toFixed(2) + ' miles' : 'N/A'}`);
      console.log(`     Source: ${store.source}`);
      console.log('');
    }
  }

  console.log("--- SELECTED STORE (closest match) ---\n");
  if (selectedStore) {
    console.log(`  ★ ${selectedStore.name}`);
    console.log(`    Address: ${selectedStore.address}`);
    console.log(`    Lat/Lng: ${selectedStore.lat}, ${selectedStore.lng}`);
    console.log(`    Distance: ${selectedStore.distance ? selectedStore.distance.toFixed(2) + ' miles' : 'N/A'}`);
  } else {
    console.log("  No store selected - no matches found.");
  }

  console.log("\n" + "=".repeat(80));
  console.log("SEARCH COMPLETE");
  console.log("=".repeat(80));
}

// Main function - callable from terminal
async function main() {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.log("Usage:");
    console.log("  Brand match test:");
    console.log("    node test-geocoding.js match <storeName> <candidateName>");
    console.log("    Example: node test-geocoding.js match Kroger \"Berkeley Bowl\"");
    console.log("");
    console.log("  Search stores (requires GOOGLE_MAPS_API_KEY):");
    console.log("    node test-geocoding.js search <storeName> <zipCode>");
    console.log("    Example: node test-geocoding.js search Kroger 94704");
    console.log("    Example: node test-geocoding.js search \"Trader Joe's\" 94704");
    process.exit(1);
  }

  const command = args[0];

  if (command === 'match') {
    if (args.length < 3) {
      console.log("Usage: node test-geocoding.js match <storeName> <candidateName>");
      process.exit(1);
    }
    const storeName = args[1];
    const candidateName = args[2];

    console.log("=".repeat(80));
    console.log(`TESTING: Does "${candidateName}" match brand "${storeName}"?`);
    console.log("=".repeat(80));

    const matcher = createBrandMatcher(storeName);
    const result = matcher(candidateName);

    console.log("\n" + "=".repeat(80));
    console.log(`RESULT: ${result ? '✓ MATCH' : '✗ NO MATCH'}`);
    console.log("=".repeat(80));

  } else if (command === 'search') {
    if (args.length < 3) {
      console.log("Usage: node test-geocoding.js search <storeName> <zipCode>");
      process.exit(1);
    }
    const storeName = args[1];
    const zipCode = args[2];

    await searchStores(storeName, zipCode);

  } else {
    // Legacy format: node test-geocoding.js <storeName> <candidateName>
    const storeName = args[0];
    const candidateName = args[1];

    console.log("=".repeat(80));
    console.log(`TESTING: Does "${candidateName}" match brand "${storeName}"?`);
    console.log("=".repeat(80));

    const matcher = createBrandMatcher(storeName);
    const result = matcher(candidateName);

    console.log("\n" + "=".repeat(80));
    console.log(`RESULT: ${result ? '✓ MATCH' : '✗ NO MATCH'}`);
    console.log("=".repeat(80));
  }
}

main();
