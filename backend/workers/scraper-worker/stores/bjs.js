const { createInstacartStoreScraper } = require('./_instacart-storefront');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env.local') });

const { search, batch, log } = createInstacartStoreScraper({
    slug: 'bjs',
    providerName: "BJ's Wholesale Club",
    providerLocation: "BJ's Wholesale Club",
    envPrefix: 'BJS',
});

const searchBjs = search;
const searchBjsBatch = batch;

module.exports = { searchBjs, searchBjsBatch };

if (require.main === module) {
    const keyword = process.argv[2];
    const zipCode = process.argv[3];
    if (!keyword) {
        log.error('Usage: node bjs.js <keyword> [zipCode]');
        process.exit(1);
    }
    searchBjs(keyword, zipCode).then((results) => {
        console.log(JSON.stringify(results, null, 2));
    }).catch((err) => {
        log.error(err);
        process.exit(1);
    });
}
