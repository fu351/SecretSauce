const { createInstacartStoreScraper } = require('./_instacart-storefront');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env.local') });

const { search, batch, log } = createInstacartStoreScraper({
    slug: 'winn-dixie',
    providerName: "Winn-Dixie",
    providerLocation: "Winn-Dixie",
    envPrefix: 'WINNDIXIE',
});

const searchWinnDixie = search;
const searchWinnDixieBatch = batch;

module.exports = { searchWinnDixie, searchWinnDixieBatch };

if (require.main === module) {
    const keyword = process.argv[2];
    const zipCode = process.argv[3];
    if (!keyword) {
        log.error('Usage: node winndixie.js <keyword> [zipCode]');
        process.exit(1);
    }
    searchWinnDixie(keyword, zipCode).then((results) => {
        console.log(JSON.stringify(results, null, 2));
    }).catch((err) => {
        log.error(err);
        process.exit(1);
    });
}
