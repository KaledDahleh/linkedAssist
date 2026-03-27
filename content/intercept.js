// Runs in the MAIN world to intercept LinkedIn's API calls
(function () {
  console.log('[EasyReach intercept.js] Loaded');

  // Helper: recursively find profile elements in a nested response
  function extractProfiles(obj, results) {
    if (!obj || typeof obj !== 'object') return;
    // Check if this object looks like a profile
    if (obj.firstName && obj.lastName && typeof obj.firstName === 'string') {
      results.push({
        name: `${obj.firstName} ${obj.lastName}`,
        publicIdentifier: obj.publicIdentifier || '',
        occupation: obj.headline || obj.occupation || '',
        picture: obj.profilePicture?.displayImageReference?.vectorImage || null,
      });
      return; // Don't recurse into profile children
    }
    // Recurse into arrays and objects
    if (Array.isArray(obj)) {
      for (const item of obj) extractProfiles(item, results);
    } else {
      for (const key of Object.keys(obj)) {
        if (key === 'picture' || key === 'profilePicture') continue; // Skip image data
        extractProfiles(obj[key], results);
      }
    }
  }

  const origFetch = window.fetch;
  window.fetch = async function (...args) {
    const url = (typeof args[0] === 'string') ? args[0] : args[0]?.url || '';

    // Intercept profile identity responses on messaging pages
    if (window.location.pathname.includes('/messaging/') &&
        (url.includes('IdentityDashProfiles') || url.includes('identityDashProfiles') || url.includes('identity/dash/profiles'))) {
      try {
        const response = await origFetch.apply(this, args);
        const clone = response.clone();
        clone.json().then(data => {
          try {
            const profiles = [];
            extractProfiles(data, profiles);
            if (profiles.length > 0) {
              console.log('[EasyReach intercept] Captured profiles:', profiles.map(p => p.name));
              window.postMessage({ type: 'EASYREACH_MESSAGING_PROFILES', profiles }, '*');
            }
          } catch (e) {}
        }).catch(() => {});
        return response;
      } catch (e) {
        return origFetch.apply(this, args);
      }
    }

    return origFetch.apply(this, args);
  };

  // Also intercept XHR for the same endpoints
  const origOpen = XMLHttpRequest.prototype.open;
  const origSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    this._easyreachUrl = String(url);
    return origOpen.call(this, method, url, ...rest);
  };

  XMLHttpRequest.prototype.send = function (...args) {
    const url = this._easyreachUrl || '';
    if (window.location.pathname.includes('/messaging/') &&
        (url.includes('IdentityDashProfiles') || url.includes('identityDashProfiles') || url.includes('identity/dash/profiles'))) {
      this.addEventListener('load', function () {
        try {
          const data = JSON.parse(this.responseText);
          const profiles = [];
          extractProfiles(data, profiles);
          if (profiles.length > 0) {
            console.log('[EasyReach intercept] Captured profiles from XHR:', profiles.map(p => p.name));
            window.postMessage({ type: 'EASYREACH_MESSAGING_PROFILES', profiles }, '*');
          }
        } catch (e) {}
      });
    }
    return origSend.apply(this, args);
  };
})();
