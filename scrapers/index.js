// Export all scraper functions
const { Meijers, getLocations } = require('./stores/meijer.js');
const { Krogers } = require('./stores/kroger.js');
const { getTargetProducts } = require('./stores/target.js');
const { search99Ranch } = require('./stores/99ranch.js');
const { searchWalmartAPI } = require('./stores/walmart.js');
const { searchAndronicos } = require('./stores/andronicos.js');
const { searchTraderJoes, searchTraderJoesBatch } = require('./stores/traderjoes.js');
const { searchWholeFoods } = require('./stores/wholefoods.js');
const { searchAldi } = require('./stores/aldi.js');
const { searchSafeway } = require('./stores/safeway.js');

module.exports = {
  Meijers,
  getLocations,
  Krogers,
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
