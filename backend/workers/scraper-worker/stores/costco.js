const { createInstacartStoreScraper } = require('./_instacart-storefront');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env.local') });

const { search, batch, log } = createInstacartStoreScraper({
    slug: 'costco',
    providerName: "Costco",
    providerLocation: "Costco Wholesale",
    envPrefix: 'COSTCO',
});

const searchCostco = search;
const searchCostcoBatch = batch;

module.exports = { searchCostco, searchCostcoBatch };

if (require.main === module) {
    const keyword = process.argv[2];
    const zipCode = process.argv[3];
    if (!keyword) {
        log.error('Usage: node costco.js <keyword> [zipCode]');
        process.exit(1);
    }
    searchCostco(keyword, zipCode).then((results) => {
        console.log(JSON.stringify(results, null, 2));
    }).catch((err) => {
        log.error(err);
        process.exit(1);
    });
}
