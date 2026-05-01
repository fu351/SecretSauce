const { createInstacartStoreScraper } = require('./_instacart-storefront');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env.local') });

const { search, batch, log } = createInstacartStoreScraper({
    slug: 'raleys',
    providerName: "Raley's",
    providerLocation: "Raley's Supermarkets",
    envPrefix: 'RALEYS',
});

const searchRaleys = search;
const searchRaleysBatch = batch;

module.exports = { searchRaleys, searchRaleysBatch };

if (require.main === module) {
    const keyword = process.argv[2];
    const zipCode = process.argv[3];
    if (!keyword) {
        log.error('Usage: node raleys.js <keyword> [zipCode]');
        process.exit(1);
    }
    searchRaleys(keyword, zipCode).then((results) => {
        console.log(JSON.stringify(results, null, 2));
    }).catch((err) => {
        log.error(err);
        process.exit(1);
    });
}
