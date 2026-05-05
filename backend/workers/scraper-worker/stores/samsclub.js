const { createInstacartStoreScraper } = require('./_instacart-storefront');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env.local') });

const { search, batch, log } = createInstacartStoreScraper({
    slug: 'sams-club',
    providerName: "Sam's Club",
    providerLocation: "Sam's Club",
    envPrefix: 'SAMSCLUB',
});

const searchSamsClub = search;
const searchSamsClubBatch = batch;

module.exports = { searchSamsClub, searchSamsClubBatch };

if (require.main === module) {
    const keyword = process.argv[2];
    const zipCode = process.argv[3];
    if (!keyword) {
        log.error('Usage: node samsclub.js <keyword> [zipCode]');
        process.exit(1);
    }
    searchSamsClub(keyword, zipCode).then((results) => {
        console.log(JSON.stringify(results, null, 2));
    }).catch((err) => {
        log.error(err);
        process.exit(1);
    });
}
