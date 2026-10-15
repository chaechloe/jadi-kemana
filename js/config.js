// Settings for your copy of Jadi Kemana?. Change them after forking.
export const CONFIG = {
  // When a Google Maps link is pasted, look up an approximate street address on
  // OpenStreetMap Nominatim. Nominatim allows at most 1 request per second for the
  // whole app, across all its users (https://operations.osmfoundation.org/policies/nominatim/),
  // so set this to false if your copy gets busy. The form works fine without it.
  addressLookup: true,

  // Saved lists, the language choice and the like are kept in the browser under names starting
  // with this. Every copy on one GitHub account lives at the same address (https://<user>.github.io),
  // so give a second copy its own prefix (e.g. 'jk2'), or the two would share their saved lists.
  storagePrefix: 'jk',
};

/** This copy's browser-storage name for `name`: storageKey('v1.lists') → 'jk.v1.lists'. */
export const storageKey = (name) => `${CONFIG.storagePrefix}.${name}`;
