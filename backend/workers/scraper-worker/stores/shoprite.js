const { createInstacartStoreScraper } = require('./_instacart-storefront');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env.local') });

const { search, batch, log } = createInstacartStoreScraper({
    slug: 'shoprite',
    providerName: "ShopRite",
    providerLocation: "ShopRite Supermarkets",
    envPrefix: 'SHOPRITE',
});

const searchShopRite = search;
const searchShopRiteBatch = batch;

module.exports = { searchShopRite, searchShopRiteBatch };

if (require.main === module) {
    const keyword = process.argv[2];
    const zipCode = process.argv[3];
    if (!keyword) {
        log.error('Usage: node shoprite.js <keyword> [zipCode]');
        process.exit(1);
    }
    searchShopRite(keyword, zipCode).then((results) => {
        console.log(JSON.stringify(results, null, 2));
    }).catch((err) => {
        log.error(err);
        process.exit(1);
    });
}
