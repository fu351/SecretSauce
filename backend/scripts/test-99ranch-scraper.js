const { search99Ranch } = require('../workers/scraper-worker/stores/99ranch.js');

async function main() {
  const keyword = process.argv[2];
  const zipCode = process.argv[3];

  if (!keyword || !zipCode) {
    console.error('Usage: node backend/scripts/test-99ranch-scraper.js <keyword> <zipCode>');
    process.exit(1);
  }

  const results = await search99Ranch(keyword, zipCode);
  console.log(JSON.stringify(results, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
