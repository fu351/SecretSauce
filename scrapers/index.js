// Export all scraper functions
const { searchMeijer, Meijers, getLocations } = require('./stores/meijer.js');
const { searchKroger, Krogers } = require('./stores/kroger.js');
const { searchTarget, getTargetProducts } = require('./stores/target.js');
const { search99Ranch } = require('./stores/99ranch.js');
const { searchWalmartAPI } = require('./stores/walmart.js');
const { searchAndronicos } = require('./stores/andronicos.js');
const { searchTraderJoes, searchTraderJoesBatch } = require('./stores/traderjoes.js');
const { searchWholeFoods } = require('./stores/wholefoods.js');
const { searchAldi } = require('./stores/aldi.js');
const { searchSafeway } = require('./stores/safeway.js');

module.exports = {
  searchMeijer,
  Meijers,
  getLocations,
  searchKroger,
  Krogers,
  searchTarget,
  getTargetProducts,
  search99Ranch,
  searchWalmartAPI,
  searchAndronicos,
  searchTraderJoes,
  searchTraderJoesBatch,
  searchWholeFoods,
  searchAldi,
  searchSafeway
};
