const { createInstacartStoreScraper } = require('./_instacart-storefront');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env.local') });

const { search, batch, log } = createInstacartStoreScraper({
    slug: 'food-lion',
    providerName: "Food Lion",
    providerLocation: "Food Lion",
    envPrefix: 'FOODLION',
});

const searchFoodLion = search;
const searchFoodLionBatch = batch;

module.exports = { searchFoodLion, searchFoodLionBatch };

if (require.main === module) {
    const keyword = process.argv[2];
    const zipCode = process.argv[3];
    if (!keyword) {
        log.error('Usage: node foodlion.js <keyword> [zipCode]');
        process.exit(1);
    }
    searchFoodLion(keyword, zipCode).then((results) => {
        console.log(JSON.stringify(results, null, 2));
    }).catch((err) => {
        log.error(err);
        process.exit(1);
    });
}
