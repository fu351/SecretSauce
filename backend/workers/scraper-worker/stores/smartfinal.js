const { createInstacartStoreScraper } = require('./_instacart-storefront');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env.local') });

const { search, batch, log } = createInstacartStoreScraper({
    slug: 'smart-final',
    providerName: "Smart & Final",
    providerLocation: "Smart & Final",
    envPrefix: 'SMARTFINAL',
});

const searchSmartFinal = search;
const searchSmartFinalBatch = batch;

module.exports = { searchSmartFinal, searchSmartFinalBatch };

if (require.main === module) {
    const keyword = process.argv[2];
    const zipCode = process.argv[3];
    if (!keyword) {
        log.error('Usage: node smartfinal.js <keyword> [zipCode]');
        process.exit(1);
    }
    searchSmartFinal(keyword, zipCode).then((results) => {
        console.log(JSON.stringify(results, null, 2));
    }).catch((err) => {
        log.error(err);
        process.exit(1);
    });
}
