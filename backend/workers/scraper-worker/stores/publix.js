const { createInstacartStoreScraper } = require('./_instacart-storefront');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env.local') });

const { search, batch, log } = createInstacartStoreScraper({
    slug: 'publix',
    providerName: "Publix",
    providerLocation: "Publix Super Markets",
    envPrefix: 'PUBLIX',
});

const searchPublix = search;
const searchPublixBatch = batch;

module.exports = { searchPublix, searchPublixBatch };

if (require.main === module) {
    const keyword = process.argv[2];
    const zipCode = process.argv[3];
    if (!keyword) {
        log.error('Usage: node publix.js <keyword> [zipCode]');
        process.exit(1);
    }
    searchPublix(keyword, zipCode).then((results) => {
        console.log(JSON.stringify(results, null, 2));
    }).catch((err) => {
        log.error(err);
        process.exit(1);
    });
}
