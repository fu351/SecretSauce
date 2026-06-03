/**
 * Safeway scraper — Instacart-backed.
 *
 * Safeway sells through Instacart, so the previous Playwright-on-Instacart
 * approach kept hitting login/zip walls and was disabled. This now delegates to
 * the shared ScrapeGraphAI scraper (see instacart-scrapegraph.js), which uses
 * the ScrapeGraphAI cloud API to extract structured product data. Requires
 * SCRAPEGRAPH_API_KEY; returns [] when unset so the grocery search degrades
 * gracefully rather than failing.
 */
const path = require('path');
const { createScraperLogger } = require('../utils/logger');
const { searchInstacartStore } = require('./instacart-scrapegraph');

require('dotenv').config({ path: path.join(__dirname, '../../.env.local') });

const log = createScraperLogger('safeway');

// Main Safeway search function — delegates to the Instacart ScrapeGraphAI scraper.
async function searchSafeway(keyword, zipCode) {
  return searchInstacartStore(keyword, zipCode, { store: 'Safeway' });
}

// Main execution
async function main() {
  const keyword = process.argv[2];
  const zipCode = process.argv[3];

  if (!keyword || !zipCode) {
    log.error('Usage: node safeway.js <keyword> <zipCode>');
    log.error('Requires SCRAPEGRAPH_API_KEY environment variable');
    process.exit(1);
  }

  try {
    log.debug(`🔍 Safeway (ScrapeGraphAI) search for "${keyword}" in ${zipCode}...`);
    const results = await searchSafeway(keyword, zipCode);
    console.log(JSON.stringify(results, null, 2));
  } catch (err) {
    log.error('Error in main:', err);
    console.log(JSON.stringify([], null, 2));
  }
}

module.exports = {
  searchSafeway,
};

// Run if called directly
if (require.main === module) {
  main();
}
