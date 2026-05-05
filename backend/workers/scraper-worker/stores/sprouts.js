const { createInstacartStoreScraper } = require('./_instacart-storefront');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env.local') });

const { search, batch, log } = createInstacartStoreScraper({
    slug: 'sprouts',
    providerName: "Sprouts",
    providerLocation: "Sprouts Farmers Market",
    envPrefix: 'SPROUTS',
});

const searchSprouts = search;
const searchSproutsBatch = batch;

module.exports = { searchSprouts, searchSproutsBatch };

if (require.main === module) {
    const keyword = process.argv[2];
    const zipCode = process.argv[3];
    if (!keyword) {
        log.error('Usage: node sprouts.js <keyword> [zipCode]');
        process.exit(1);
    }
    searchSprouts(keyword, zipCode).then((results) => {
        console.log(JSON.stringify(results, null, 2));
    }).catch((err) => {
        log.error(err);
        process.exit(1);
    });
}
