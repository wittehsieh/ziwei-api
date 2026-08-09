const LOCATION_DATA = require('./location-data');

function normalize(str) {
  return String(str || '').trim().toLowerCase();
}

/**
 * Finds a location row by city name (English or zh-TW), optionally
 * disambiguated by country. Falls back to a substring match if no exact
 * match is found. Returns null if nothing matches.
 */
function findLocation({ city, country }) {
  if (!city) return null;
  const cityNorm = normalize(city);
  const countryNorm = country ? normalize(country) : null;

  const countryFilter = (row) => {
    if (!countryNorm) return true;
    return normalize(row.country) === countryNorm || normalize(row.countryZh) === countryNorm;
  };

  const exact = LOCATION_DATA.filter(
    (row) => (normalize(row.city) === cityNorm || normalize(row.cityZh) === cityNorm) && countryFilter(row)
  );
  if (exact.length > 0) return exact[0];

  const partial = LOCATION_DATA.filter(
    (row) => (normalize(row.city).includes(cityNorm) || normalize(row.cityZh).includes(cityNorm)) && countryFilter(row)
  );
  if (partial.length > 0) return partial[0];

  return null;
}

module.exports = { findLocation, LOCATION_DATA };
