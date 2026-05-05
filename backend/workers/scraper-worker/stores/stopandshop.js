const { createInstacartStoreScraper } = require('./_instacart-storefront');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env.local') });

const { search, batch, log } = createInstacartStoreScraper({
    slug: 'stop-shop',
    providerName: "Stop & Shop",
    providerLocation: "Stop & Shop",
    envPrefix: 'STOPANDSHOP',
});

const searchStopAndShop = search;
const searchStopAndShopBatch = batch;

module.exports = { searchStopAndShop, searchStopAndShopBatch };

if (require.main === module) {
    const keyword = process.argv[2];
    const zipCode = process.argv[3];
    if (!keyword) {
        log.error('Usage: node stopandshop.js <keyword> [zipCode]');
        process.exit(1);
    }
    searchStopAndShop(keyword, zipCode).then((results) => {
        console.log(JSON.stringify(results, null, 2));
    }).catch((err) => {
        log.error(err);
        process.exit(1);
    });
}
