const { createInstacartStoreScraper } = require('./_instacart-storefront');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env.local') });

const { search, batch, log } = createInstacartStoreScraper({
    slug: 'wegmans',
    providerName: "Wegmans",
    providerLocation: "Wegmans Food Markets",
    envPrefix: 'WEGMANS',
});

const searchWegmans = search;
const searchWegmansBatch = batch;

module.exports = { searchWegmans, searchWegmansBatch };

if (require.main === module) {
    const keyword = process.argv[2];
    const zipCode = process.argv[3];
    if (!keyword) {
        log.error('Usage: node wegmans.js <keyword> [zipCode]');
        process.exit(1);
    }
    searchWegmans(keyword, zipCode).then((results) => {
        console.log(JSON.stringify(results, null, 2));
    }).catch((err) => {
        log.error(err);
        process.exit(1);
    });
}
