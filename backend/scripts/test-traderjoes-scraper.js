const { searchTraderJoes } = require('../workers/scraper-worker/stores/traderjoes.js');

async function main() {
  const keyword = process.argv[2];
  const zipCode = process.argv[3];

  if (!keyword || !zipCode) {
    console.error('Usage: node backend/scripts/test-traderjoes-scraper.js <keyword> <zipCode>');
    process.exit(1);
  }

  const results = await searchTraderJoes(keyword, zipCode);
  console.log(JSON.stringify(results, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
