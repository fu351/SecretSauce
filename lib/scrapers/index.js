// Export all scraper functions
const { Meijers, getLocations } = require('./meijer.js');
const { Krogers } = require('./kroger.js');
const { getTargetProducts } = require('./target.js');
const { search99Ranch } = require('./99ranch.js');
const { searchWalmartAPI } = require('./walmart.js');
const { searchAndronicos } = require('./andronicos.js');
const { searchTraderJoes } = require('./traderjoes.js');
const { searchWholeFoods } = require('./wholefoods.js');

module.exports = {
  Meijers,
  getLocations,
  Krogers,
  getTargetProducts,
  search99Ranch,
  searchWalmartAPI,
  searchAndronicos,
  searchTraderJoes,
  searchWholeFoods
};
