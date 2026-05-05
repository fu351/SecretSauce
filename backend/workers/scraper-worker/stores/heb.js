const { createInstacartStoreScraper } = require('./_instacart-storefront');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env.local') });

const { search, batch, log } = createInstacartStoreScraper({
    slug: 'h-e-b',
    providerName: "H-E-B",
    providerLocation: "H-E-B Grocery",
    envPrefix: 'HEB',
});

const searchHeb = search;
const searchHebBatch = batch;

module.exports = { searchHeb, searchHebBatch };

if (require.main === module) {
    const keyword = process.argv[2];
    const zipCode = process.argv[3];
    if (!keyword) {
        log.error('Usage: node heb.js <keyword> [zipCode]');
        process.exit(1);
    }
    searchHeb(keyword, zipCode).then((results) => {
        console.log(JSON.stringify(results, null, 2));
    }).catch((err) => {
        log.error(err);
        process.exit(1);
    });
}
