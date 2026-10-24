'use strict';
// Only split the wire format here. Validation, sentinel handling and UI labels
// belong to their respective consumers.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.VrcLocationModel = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function splitLocation(location) {
    const raw = String(location ?? '');
    if (!raw) return { worldId: null, instanceId: null };
    const index = raw.indexOf(':');
    return index < 0 ? { worldId: raw, instanceId: null }
      : { worldId: raw.slice(0, index) || null, instanceId: raw.slice(index + 1) || null };
  }
  function locationOf(worldId, instanceId) {
    return worldId ? (instanceId ? `${worldId}:${instanceId}` : worldId) : null;
  }
  return { splitLocation, locationOf };
});
