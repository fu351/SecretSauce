// Export all scraper functions
const { searchMeijer, Meijers, getLocations, searchMeijerBatch } = require('./stores/meijer.js');
const { searchKroger, Krogers, searchKrogerBatch } = require('./stores/kroger.js');
const { searchTarget, getTargetProducts, getNearestStore: getTargetNearestStore } = require('./stores/target.js');
const { search99Ranch, search99RanchBatch } = require('./stores/99ranch.js');
const { searchWalmartAPI } = require('./stores/walmart.js');
const { searchAndronicos } = require('./stores/andronicos.js');
const { searchTraderJoes, searchTraderJoesBatch } = require('./stores/traderjoes.js');
const { searchWholeFoods } = require('./stores/wholefoods.js');
const { searchAldi } = require('./stores/aldi.js');
const { searchSafeway } = require('./stores/safeway.js');
const {
  getUniversalScraperControlsFromEnv,
  mergeUniversalScraperControls,
  runWithUniversalScraperControls,
} = require('./universal-controls.js');

module.exports = {
  searchMeijer,
  Meijers,
  getLocations,
  searchMeijerBatch,
  searchKroger,
  Krogers,
  searchKrogerBatch,
  searchTarget,
  getTargetProducts,
  getNearestStore: getTargetNearestStore,
  search99Ranch,
  search99RanchBatch,
  searchWalmartAPI,
  searchAndronicos,
  searchTraderJoes,
  searchTraderJoesBatch,
  searchWholeFoods,
  searchAldi,
  searchSafeway,
  getUniversalScraperControlsFromEnv,
  mergeUniversalScraperControls,
  runWithUniversalScraperControls
};
