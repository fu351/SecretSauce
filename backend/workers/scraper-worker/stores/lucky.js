const { createInstacartStoreScraper } = require('./_instacart-storefront');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env.local') });

const { search, batch, log } = createInstacartStoreScraper({
    slug: 'lucky',
    providerName: "Lucky",
    providerLocation: "Lucky Supermarkets",
    envPrefix: 'LUCKY',
});

const searchLucky = search;
const searchLuckyBatch = batch;

module.exports = { searchLucky, searchLuckyBatch };

if (require.main === module) {
    const keyword = process.argv[2];
    const zipCode = process.argv[3];
    if (!keyword) {
        log.error('Usage: node lucky.js <keyword> [zipCode]');
        process.exit(1);
    }
    searchLucky(keyword, zipCode).then((results) => {
        console.log(JSON.stringify(results, null, 2));
    }).catch((err) => {
        log.error(err);
        process.exit(1);
    });
}
