// EasyReach Content Script
// Runs on LinkedIn messaging pages

(function () {
  'use strict';

  // --- Load font ---
  const fontLink = document.createElement('link');
  fontLink.href = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap';
  fontLink.rel = 'stylesheet';
  document.head.appendChild(fontLink);

  // --- Sidebar HTML ---
  function createSidebar() {
    const sidebar = document.createElement('div');
    sidebar.id = 'easyreach-sidebar';
    sidebar.innerHTML = `
      <div class="la-accent-bar"></div>
      <div class="la-header-row">
        <span class="la-brand">EasyReach</span>
        <button class="la-close-btn" id="la-close" title="Close">&times;</button>
      </div>
      <div class="la-tabs">
        <button class="la-tab active" data-tab="draft">Draft</button>
        <button class="la-tab" data-tab="about">Context</button>
      </div>
      <div class="la-tab-content la-tab-draft active" id="la-tab-draft">
        <div class="la-context">
          <div class="la-context-row">
            <img class="la-context-photo" id="la-recipient-photo" src="" alt="" style="display:none;" />
            <div class="la-context-initials" id="la-recipient-initials" style="display:none;"></div>
            <div class="la-context-info">
              <div class="la-context-label">Recipient</div>
              <div class="la-context-name" id="la-recipient-name">Detecting...</div>
              <div class="la-context-headline" id="la-recipient-headline"></div>
            </div>
          </div>
        </div>
        <div class="la-options-row">
          <div class="la-field la-field-half">
            <label for="la-tone">Tone</label>
            <select id="la-tone">
              <option value="">Auto</option>
              <option value="professional">Professional</option>
              <option value="friendly">Friendly</option>
              <option value="casual">Casual</option>
              <option value="formal">Formal</option>
            </select>
          </div>
          <div class="la-field la-field-half">
            <label for="la-length">Length: <span id="la-length-label">Auto</span></label>
            <input type="range" id="la-length" min="0" max="5" value="0" step="1" />
          </div>
        </div>

        <div class="la-field">
          <textarea id="la-prompt" placeholder="e.g. Ask about their work and if they're open to a coffee chat"></textarea>
        </div>

        <button class="la-generate-btn" id="la-generate">Generate Draft</button>
        <div class="la-error" id="la-error"></div>

        <div class="la-draft-section" id="la-draft-section">
          <div class="la-field">
            <label>Draft</label>
            <div class="la-draft-output" id="la-draft-output"></div>
          </div>
          <div class="la-draft-actions">
            <button class="la-copy-btn" id="la-copy">Copy</button>
          </div>
        </div>
      </div>
      <div class="la-tab-content la-tab-about" id="la-tab-about">
        <div class="la-field">
          <label for="la-about-me">Your background</label>
          <textarea id="la-about-me" class="la-about-me" rows="4" placeholder="e.g. CS student at MIT, looking for SWE internships — or — Tech recruiter at Google, hiring for backend roles. This helps EasyReach write messages as you."></textarea>
        </div>
        <hr class="la-divider" />
        <div class="la-field">
          <label>Your resume</label>
          <div class="la-resume-row">
            <input type="file" id="la-resume-input" accept=".pdf,.txt" style="display:none;" />
            <button class="la-resume-btn" id="la-resume-btn">Attach resume</button>
            <span class="la-resume-name" id="la-resume-name"></span>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(sidebar);
    return sidebar;
  }

  function createToggleButton() {
    const btn = document.createElement('button');
    btn.id = 'easyreach-toggle';
    btn.textContent = 'EasyReach';
    btn.title = 'Open EasyReach';
    document.body.appendChild(btn);
    return btn;
  }

  // --- Auto-detect the logged-in user's name ---
  let cachedMyName = '';
  function getMyName() {
    if (cachedMyName) return cachedMyName;

    // The nav "Me" button has an alt text with the user's name
    const meImg = document.querySelector('.global-nav__me-photo, img.nav-item__profile-member-photo');
    if (meImg && meImg.alt) {
      cachedMyName = meImg.alt.trim();
      return cachedMyName;
    }
    // Fallback: look for the profile nav link text
    const meLink = document.querySelector('.global-nav__primary-link--me .t-14');
    if (meLink) {
      cachedMyName = meLink.textContent.trim();
      return cachedMyName;
    }
    // Fallback: find any img in the nav with alt text that looks like a name
    const navImgs = document.querySelectorAll('nav img[alt], header img[alt]');
    for (const img of navImgs) {
      const alt = img.alt.trim();
      if (alt && /^[A-Z][a-z]+ [A-Z]/.test(alt) && alt.length < 40) {
        cachedMyName = alt;
        return cachedMyName;
      }
    }
    // Fallback: use stored name from chrome.storage
    return '';
  }

  // Try to detect and store the user's name via the Voyager API
  let myNamePromise = null;
  async function detectAndCacheMyName() {
    if (cachedMyName) return;
    try {
      const csrfToken = document.cookie.match(/JSESSIONID="?([^";]+)"?/)?.[1] || '';
      const resp = await fetch('https://www.linkedin.com/voyager/api/me', {
        credentials: 'include',
        headers: { 'csrf-token': csrfToken, 'x-restli-protocol-version': '2.0.0' },
      });
      if (resp.ok) {
        const data = await resp.json();
        console.log('[EasyReach] /api/me response keys:', Object.keys(data));
        // Try multiple possible response structures
        const firstName = data.miniProfile?.firstName || data.firstName || '';
        const lastName = data.miniProfile?.lastName || data.lastName || '';
        if (firstName && lastName) {
          cachedMyName = `${firstName} ${lastName}`;
          console.log('[EasyReach] Detected logged-in user:', cachedMyName);
        } else {
          // Last resort: look for any name-like field in the response
          const plain = data.plainId || data.publicIdentifier || '';
          console.log('[EasyReach] /api/me no name found. firstName:', firstName, 'lastName:', lastName, 'plainId:', plain);
          // Try the profile endpoint as fallback
          if (plain) {
            try {
              const profResp = await fetch(
                `https://www.linkedin.com/voyager/api/identity/dash/profiles?q=memberIdentity&memberIdentity=${plain}&decorationId=com.linkedin.voyager.dash.deco.identity.profile.FullProfileWithEntities-93`,
                { credentials: 'include', headers: { 'csrf-token': csrfToken, 'x-restli-protocol-version': '2.0.0' } }
              );
              if (profResp.ok) {
                const profData = await profResp.json();
                const el = (profData.elements || [])[0];
                if (el?.firstName && el?.lastName) {
                  cachedMyName = `${el.firstName} ${el.lastName}`;
                  console.log('[EasyReach] Detected logged-in user via profile API:', cachedMyName);
                }
              }
            } catch (e2) {}
          }
        }
      } else {
        console.log('[EasyReach] /api/me failed with status:', resp.status);
      }
    } catch (e) {
      console.log('[EasyReach] /api/me error:', e);
    }
  }
  myNamePromise = detectAndCacheMyName();

  // --- Track last visited profile page URL ---
  let lastProfilePageUrl = '';
  // Track the active messaging participant detected via MutationObserver
  let activeMessagingParticipant = null;

  // --- Detect if we're on a profile page ---
  function isProfilePage() {
    const onProfile = /^\/in\/[^/]+/.test(location.pathname);
    if (onProfile) {
      lastProfilePageUrl = location.href.split('?')[0];
    }
    return onProfile;
  }

  function getProfilePageInfo() {
    // Try multiple selectors for the profile name
    const nameSelectors = [
      'h1.text-heading-xlarge',
      'h1.inline',
      '.pv-top-card--list li:first-child',
      'h1[data-anonymize="person-name"]',
      '.top-card-layout__title',
    ];
    let name = 'Unknown';
    for (const sel of nameSelectors) {
      const el = document.querySelector(sel);
      if (el && el.textContent.trim()) {
        name = el.textContent.trim();
        break;
      }
    }

    // Headline
    const headlineSelectors = [
      '.text-body-medium.break-words',
      '.pv-top-card--list .text-body-medium',
      '[data-anonymize="headline"]',
      '.top-card-layout__headline',
    ];
    let headline = '';
    for (const sel of headlineSelectors) {
      const el = document.querySelector(sel);
      if (el && el.textContent.trim()) {
        headline = el.textContent.trim();
        break;
      }
    }

    const profileUrl = location.href.split('?')[0];

    // Photo — try multiple selectors and also look for any large img near the top card
    let photoUrl = '';
    const photoSelectors = [
      '.pv-top-card-profile-picture__image--show',
      '.pv-top-card-profile-picture__image',
      '.profile-photo-edit__preview',
      'img.evi-image.ember-view[width="200"]',
      '.top-card-layout__entity-image',
      'img[data-anonymize="headshot-photo"]',
    ];
    for (const sel of photoSelectors) {
      const img = document.querySelector(sel);
      if (img) {
        const src = img.src || img.getAttribute('data-delayed-url') || '';
        if (src && src.startsWith('http') && !src.includes('ghost')) {
          photoUrl = src;
          break;
        }
      }
    }
    // Fallback: find any img whose alt contains the person's name in the top card area
    if (!photoUrl && name !== 'Unknown') {
      const topCard = document.querySelector('.pv-top-card, .scaffold-layout__main, .top-card-layout');
      if (topCard) {
        const imgs = topCard.querySelectorAll('img');
        for (const img of imgs) {
          const alt = img.alt || '';
          const src = img.src || '';
          if (alt.includes(name) && src.startsWith('http') && !src.includes('ghost')) {
            photoUrl = src;
            break;
          }
        }
      }
    }

    return { name, headline, profileUrl, photoUrl };
  }

  // --- Messaging participant data from fetch interceptor (intercept.js, MAIN world) ---
  let latestMessagingParticipant = null;

  // Listen for intercepted profile data
  const messagingProfiles = {};
  window.addEventListener('message', (event) => {
    if (event.data?.type === 'EASYREACH_MESSAGING_PROFILES') {
      const myName = getMyName();
      for (const p of event.data.profiles) {
        // Skip the logged-in user
        if (myName && p.name === myName) continue;
        messagingProfiles[p.publicIdentifier] = p;
        latestMessagingParticipant = p;
        console.log('[EasyReach] Captured messaging participant:', p.name, p.publicIdentifier);
      }
    }
  });

  // --- Scraping LinkedIn context ---
  function getRecipientInfo() {
    // If on a profile page, scrape from the profile itself
    if (isProfilePage()) {
      return getProfilePageInfo();
    }

    // On messaging pages, prefer intercepted API data
    if (latestMessagingParticipant) {
      const p = latestMessagingParticipant;
      let photoUrl = '';
      // Extract photo from the picture data
      const picData = p.picture?.['com.linkedin.common.VectorImage']?.artifacts || [];
      if (picData.length > 0) {
        const rootUrl = p.picture?.['com.linkedin.common.VectorImage']?.rootUrl || '';
        const largest = picData[picData.length - 1];
        if (rootUrl && largest?.fileIdentifyingUrlPathSegment) {
          photoUrl = rootUrl + largest.fileIdentifyingUrlPathSegment;
        }
      }
      return {
        name: p.name,
        headline: p.occupation || '',
        profileUrl: `https://www.linkedin.com/in/${p.publicIdentifier}/`,
        photoUrl,
      };
    }

    // Strategy: Check the preload iframe for active conversation participants
    // LinkedIn's preload iframe contains profile links for the current conversation
    const myName = getMyName();
    let participantName = '';
    let profileUrl = '';

    try {
      const iframes = document.querySelectorAll('iframe');
      for (const iframe of iframes) {
        try {
          const doc = iframe.contentDocument;
          if (!doc) continue;
          const links = doc.querySelectorAll('a[href*="/in/"]');
          for (const link of links) {
            const text = link.textContent.trim().split('\n')[0].trim();
            if (!text || text.includes('View') || text.includes('profile')) continue;
            // Skip the logged-in user
            if (myName && text.toLowerCase() === myName.toLowerCase()) continue;
            // Skip stale profile page person
            const staleSlug = lastProfilePageUrl ? lastProfilePageUrl.match(/\/in\/([^/?]+)/)?.[1] : '';
            const slug = link.href.match(/\/in\/([^/?]+)/)?.[1];
            // Don't skip by staleSlug here — the iframe only has active conversation participants
            if (slug && text) {
              participantName = text;
              profileUrl = 'https://www.linkedin.com/in/' + slug + '/';
              break;
            }
          }
          if (participantName) break;
        } catch (e) { /* cross-origin iframe, skip */ }
      }
    } catch (e) {}

    console.log('[EasyReach DEBUG] Preload iframe - name:', participantName, 'profileUrl:', profileUrl);

    if (participantName) {
      return { name: participantName, headline: '', profileUrl, photoUrl: '' };
    }

    // Fallback: Use MutationObserver-detected participant (skip if it's the logged-in user)
    if (activeMessagingParticipant && activeMessagingParticipant.name) {
      if (!myName || activeMessagingParticipant.name.toLowerCase() !== myName.toLowerCase()) {
        return { name: activeMessagingParticipant.name, headline: '', profileUrl: activeMessagingParticipant.profileUrl || '', photoUrl: '' };
      }
    }

    // Fallback: DOM scraping with semantic selectors (works on fresh page loads)
    // Priority 1: Get the name from the active conversation THREAD header (right pane)
    // This is the most reliable — it's the header of the open conversation
    const threadHeaderSelectors = [
      '.msg-thread__link-to-profile',                  // profile link in thread header
      '.msg-conversation-card--active .msg-entity-lockup__entity-title',  // active card name
      '.msg-conversations-container__convo-item--active h2',              // active convo heading
    ];
    let name = '';
    let domProfileUrl = '';

    // First try to get name + URL from thread header profile link
    const threadLink = document.querySelector('.msg-thread__link-to-profile');
    if (threadLink) {
      const linkText = threadLink.textContent.trim().split('\n')[0].trim();
      if (linkText && (!myName || linkText.toLowerCase() !== myName.toLowerCase())) {
        name = linkText;
        if (threadLink.href?.includes('/in/')) {
          domProfileUrl = threadLink.href.split('?')[0];
        }
      }
    }

    // Try active conversation card
    if (!name) {
      const activeCardSelectors = [
        '.msg-conversation-card--active .msg-entity-lockup__entity-title',
        '.msg-conversations-container__convo-item--active h2',
        '.msg-conversation-listitem--active h2',
      ];
      for (const sel of activeCardSelectors) {
        const el = document.querySelector(sel);
        if (el && el.textContent.trim()) {
          const found = el.textContent.trim();
          if (myName && found.toLowerCase() === myName.toLowerCase()) continue;
          name = found;
          break;
        }
      }
    }

    // Fallback: any conversation card title, but prefer ones that aren't self
    if (!name) {
      const allTitles = document.querySelectorAll('h2.msg-entity-lockup__entity-title');
      for (const el of allTitles) {
        const found = el.textContent.trim();
        if (!found) continue;
        if (myName && found.toLowerCase() === myName.toLowerCase()) continue;
        name = found;
        break;
      }
    }

    // Last resort: overlay header
    if (!name) {
      const overlay = document.querySelector('.msg-overlay-bubble-header__title');
      if (overlay && overlay.textContent.trim()) {
        const found = overlay.textContent.trim();
        if (!myName || found.toLowerCase() !== myName.toLowerCase()) {
          name = found;
        }
      }
    }

    // Find profile URL if we have a name but no URL yet
    if (name && !domProfileUrl) {
      const allLinks = document.querySelectorAll('a[href*="/in/"]');
      for (const link of allLinks) {
        const linkText = link.textContent.trim().split('\n')[0].trim();
        if (linkText === name && link.href.includes('/in/')) {
          domProfileUrl = link.href.split('?')[0];
          break;
        }
      }
    }
    if (!domProfileUrl) {
      const headerLink = document.querySelector('.msg-thread__link-to-profile');
      if (headerLink?.href) domProfileUrl = headerLink.href;
    }

    console.log('[EasyReach DEBUG] DOM scraping - name:', name, 'profileUrl:', domProfileUrl, 'myName:', myName);

    if (name) {
      return { name, headline: '', profileUrl: domProfileUrl, photoUrl: '' };
    }

    return { name: 'Unknown', headline: '', profileUrl: '', photoUrl: '' };
  }

  // Async fallback: fetch the active conversation's participant from Voyager messaging API
  async function fetchActiveConversationParticipant() {
    try {
      const csrfToken = document.cookie.match(/JSESSIONID="?([^";]+)"?/)?.[1] || '';
      if (!csrfToken) return null;

      // Try to get the conversation ID from the URL
      const convoMatch = location.pathname.match(/\/messaging\/thread\/([^/]+)/);
      if (!convoMatch) return null;
      const threadId = convoMatch[1];

      // Use the messaging conversations endpoint with the thread ID
      const resp = await fetch(
        `https://www.linkedin.com/voyager/api/messaging/conversations/${threadId}`,
        {
          credentials: 'include',
          headers: {
            'csrf-token': csrfToken,
            'x-restli-protocol-version': '2.0.0',
          },
        }
      );
      if (!resp.ok) return null;
      const data = await resp.json();

      const myName = getMyName();
      const participants = data.participants || [];
      for (const p of participants) {
        const mini = p['com.linkedin.voyager.messaging.MessagingMember']?.miniProfile
          || p.miniProfile || {};
        const firstName = mini.firstName || '';
        const lastName = mini.lastName || '';
        const fullName = `${firstName} ${lastName}`.trim();
        const publicId = mini.publicIdentifier || '';
        if (!fullName) continue;
        if (myName && fullName.toLowerCase() === myName.toLowerCase()) continue;
        return {
          name: fullName,
          profileUrl: publicId ? `https://www.linkedin.com/in/${publicId}/` : '',
        };
      }
    } catch (e) {
      console.log('[EasyReach] Messaging API fallback failed:', e);
    }
    return null;
  }

  function scrapeProfilePanel() {
    const details = {};

    // LinkedIn sometimes shows a profile panel on the right side of messaging
    const panelSelectors = {
      location: '.msg-member-detail-card__location, .pv-text-details__right-panel-item-text',
      currentRole: '.msg-member-detail-card__occupation, .pv-text-details__right-panel-item-text',
      about: '.msg-member-detail-card__description',
      connections: '.msg-member-detail-card__connection-count',
    };

    for (const [key, sel] of Object.entries(panelSelectors)) {
      const el = document.querySelector(sel);
      if (el && el.textContent.trim()) {
        details[key] = el.textContent.trim();
      }
    }

    // Try to get profile URL for context — only use messaging-specific selectors
    const profileLink = document.querySelector(
      '.msg-thread__link-to-profile, .msg-thread-header__profile-link'
    );
    if (profileLink) {
      details.profileUrl = profileLink.href;
    }

    return details;
  }

  function getConversationHistory() {
    const messages = [];
    const msgElements = document.querySelectorAll('.msg-s-event-listitem__body, .msg-s-message-group__msg');

    msgElements.forEach((el) => {
      const text = el.textContent.trim();
      if (text) {
        messages.push(text);
      }
    });

    // Keep last 10 messages for context
    return messages.slice(-10);
  }

  // --- Search for a profile by name using Voyager typeahead ---
  async function searchProfileByName(name) {
    if (!name || name === 'Unknown') return '';
    try {
      const csrfToken = document.cookie.match(/JSESSIONID="?([^";]+)"?/)?.[1] || '';
      const resp = await fetch(
        `https://www.linkedin.com/voyager/api/voyagerSearchDashTypeahead?q=type&query=${encodeURIComponent(name)}&type=PROFILE`,
        {
          credentials: 'include',
          headers: {
            'csrf-token': csrfToken,
            'x-restli-protocol-version': '2.0.0',
          },
        }
      );
      if (!resp.ok) return '';
      const data = await resp.json();
      const elements = data.elements || [];
      // Find the best match — look for first/second degree connections
      for (const el of elements) {
        const trackingUrn = el.trackingUrn || '';
        const entityUrn = el.entityUrn || '';
        const title = el.title?.text || '';
        // Check if name matches
        if (title.toLowerCase().includes(name.toLowerCase())) {
          // Extract public identifier from navigationUrl
          const navUrl = el.navigationUrl || '';
          const slugMatch = navUrl.match(/\/in\/([^/?]+)/);
          if (slugMatch) {
            console.log('[EasyReach] Search found profile for "' + name + '":', slugMatch[1]);
            return 'https://www.linkedin.com/in/' + slugMatch[1] + '/';
          }
        }
      }
    } catch (err) {
      console.log('[EasyReach] Profile search failed:', err);
    }
    return '';
  }

  // --- Profile fetching & caching ---
  const profileCache = {};

  async function fetchFullProfile(profileUrl) {
    if (!profileUrl || !profileUrl.includes('/in/')) return {};
    if (profileCache[profileUrl]) return profileCache[profileUrl];

    try {
      // Extract the public identifier or encoded ID from the URL
      const urlMatch = profileUrl.match(/\/in\/([^/?]+)/);
      if (!urlMatch) return {};
      let profileId = urlMatch[1];

      // Get CSRF token from cookies
      const csrfToken = document.cookie.match(/JSESSIONID="?([^";]+)"?/)?.[1] || '';

      const headers = {
        'csrf-token': csrfToken,
        'x-restli-protocol-version': '2.0.0',
      };

      const profile = {};
      const debugInfo = { profileId, apiResults: {} };

      // 2. Get full profile data from FullProfileWithEntities
      try {
        const fullResp = await fetch(
          `https://www.linkedin.com/voyager/api/identity/dash/profiles?q=memberIdentity&memberIdentity=${profileId}&decorationId=com.linkedin.voyager.dash.deco.identity.profile.FullProfileWithEntities-93`,
          { credentials: 'include', headers }
        );
        if (fullResp.ok) {
          const data = await fullResp.json();
          const el = (data.elements || [])[0];
          if (el) {
            if (el.firstName) profile.firstName = el.firstName;
            if (el.lastName) profile.lastName = el.lastName;
            if (el.firstName && el.lastName) profile.name = `${el.firstName} ${el.lastName}`;
            if (el.headline) profile.headline = el.headline;
            if (el.summary) profile.about = el.summary.substring(0, 500);
            // Extract profile picture from API
            const picData = el.profilePicture?.displayImageReference?.vectorImage?.artifacts
              || el.profilePictureOriginalImage?.displayImageReference?.vectorImage?.artifacts
              || [];
            if (picData.length > 0) {
              const rootUrl = el.profilePicture?.displayImageReference?.vectorImage?.rootUrl
                || el.profilePictureOriginalImage?.displayImageReference?.vectorImage?.rootUrl
                || '';
              const largest = picData[picData.length - 1];
              if (rootUrl && largest?.fileIdentifyingUrlPathSegment) {
                profile.photoUrl = rootUrl + largest.fileIdentifyingUrlPathSegment;
              }
            }
            if (el.geoLocation?.geo?.defaultLocalizedName) profile.location = el.geoLocation.geo.defaultLocalizedName;
            if (el.industry) profile.industry = el.industry;

            // Experience from profilePositionGroups
            const posGroups = el.profilePositionGroups?.elements || [];
            if (posGroups.length > 0) {
              const jobs = [];
              for (const group of posGroups.slice(0, 5)) {
                const companyName = group.companyName || group.multiLocaleCompanyName?.en_US || '';
                const positions = group.profilePositionInPositionGroup?.elements || [];
                for (const pos of positions.slice(0, 2)) {
                  const title = pos.title || '';
                  if (title || companyName) {
                    jobs.push([title, companyName].filter(Boolean).join(' @ '));
                  }
                }
              }
              if (jobs.length > 0) profile.experience = jobs.join('\n');
            }

            // Education
            const edus = el.profileEducations?.elements || [];
            if (edus.length > 0) {
              profile.education = edus.slice(0, 3).map(e => {
                const school = e.school?.name || e.schoolName || '';
                const degree = e.degreeName || '';
                const field = e.fieldOfStudy || '';
                return [school, degree, field].filter(Boolean).join(' - ');
              }).join('\n');
            }

            // Skills
            const skills = el.profileSkills?.elements || [];
            if (skills.length > 0) {
              profile.skills = skills.slice(0, 10).map(s => s.name).filter(Boolean).join(', ');
            }
          }
        }
      } catch {}

      profileCache[profileUrl] = profile;
      return profile;
    } catch {
      return {};
    }
  }

  // --- PDF text extraction via Gemini API ---
  async function extractPdfText(file) {
    const settings = await new Promise((resolve) => {
      chrome.storage.sync.get(['geminiApiKey'], resolve);
    });
    if (!settings.geminiApiKey) return '';

    const arrayBuffer = await file.arrayBuffer();
    const uint8 = new Uint8Array(arrayBuffer);
    let binary = '';
    const chunkSize = 8192;
    for (let i = 0; i < uint8.length; i += chunkSize) {
      binary += String.fromCharCode.apply(null, uint8.subarray(i, i + chunkSize));
    }
    const base64 = btoa(binary);

    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${settings.geminiApiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{
              parts: [
                { inlineData: { mimeType: 'application/pdf', data: base64 } },
                { text: 'Extract all text content from this resume. Return ONLY the raw text, no formatting, no commentary.' }
              ]
            }],
            generationConfig: { temperature: 0, maxOutputTokens: 4096, thinkingConfig: { thinkingBudget: 0 } },
          }),
        }
      );

      if (!response.ok) return '';
      const data = await response.json();
      const parts = data.candidates?.[0]?.content?.parts || [];
      const text = parts.map(p => p.text).filter(Boolean).join('');
      console.log('[EasyReach] Resume extracted, length:', text.length, 'preview:', text.substring(0, 200));
      return text.trim();
    } catch (err) {
      console.error('[EasyReach] PDF extraction failed:', err);
      return '';
    }
  }

  // --- Gemini API call ---
  async function generateDraft(apiKey, prompt, tone, length, recipientInfo, conversationHistory, userName, aboutMe, senderResume) {
    const systemContext = buildPrompt(prompt, tone, length, recipientInfo, conversationHistory, userName, aboutMe, senderResume);

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              parts: [{ text: systemContext }],
            },
          ],
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 2048,
            thinkingConfig: {
              thinkingBudget: 0,
            },
          },
        }),
      }
    );

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error?.message || `API error: ${response.status}`);
    }

    const data = await response.json();


    const parts = data.candidates?.[0]?.content?.parts;
    if (!parts || parts.length === 0) {
      throw new Error('No response generated. Try again.');
    }

    // Gemini 2.5 Flash is a thinking model - skip "thought" parts and get the actual text
    let text = '';
    for (const part of parts) {
      if (part.text && !part.thought) {
        text += part.text;
      }
    }

    if (!text) {
      // Fallback: just grab any text part
      text = parts.map(p => p.text).filter(Boolean).join('');
    }

    if (!text) {
      throw new Error('No response generated. Try again.');
    }


    return text.trim();
  }

  function buildPrompt(userPrompt, tone, length, recipientInfo, conversationHistory, userName, aboutMe, senderResume) {
    const toneInstruction = tone ? `- Use a ${tone} tone` : '- Use a tone appropriate for the context';
    const lengthInstruction = length ? `- Keep it to approximately ${length} sentence${length === '1' ? '' : 's'}` : '- Keep it concise (under 150 words unless the user asks for more)';

    let prompt = `You are a helpful assistant that drafts LinkedIn direct messages.
Write a LinkedIn DM based on the user's request.

Rules:
${toneInstruction}
${lengthInstruction}
- Sound natural and human, not robotic
- Do not include a subject line
- Use proper line breaks between paragraphs, greetings, and sign-offs — never run sentences together without spacing
- Sign off as ${userName} when appropriate
- Output ONLY the raw message text, no quotes, no markdown, no formatting markers

Sender (you are writing on behalf of): ${userName}`;

    if (aboutMe) {
      prompt += `\nSender background: ${aboutMe}`;
    }
    if (senderResume) {
      prompt += `\nSender resume summary: ${senderResume}`;
    }

    prompt += `
Recipient: ${recipientInfo.name}`;

    if (recipientInfo.headline) {
      prompt += `\nRecipient headline: ${recipientInfo.headline}`;
    }
    if (recipientInfo.currentRole) {
      prompt += `\nRecipient current role: ${recipientInfo.currentRole}`;
    }
    if (recipientInfo.location) {
      prompt += `\nRecipient location: ${recipientInfo.location}`;
    }
    if (recipientInfo.about) {
      prompt += `\nRecipient about: ${recipientInfo.about}`;
    }
    if (recipientInfo.connections) {
      prompt += `\nRecipient connections: ${recipientInfo.connections}`;
    }
    if (recipientInfo.experience) {
      prompt += `\nRecipient work experience:\n${recipientInfo.experience}`;
    }
    if (recipientInfo.education) {
      prompt += `\nRecipient education:\n${recipientInfo.education}`;
    }
    if (recipientInfo.fullContext) {
      prompt += `\nRecipient profile details:\n${recipientInfo.fullContext}`;
    }
    if (recipientInfo.skills) {
      prompt += `\nRecipient skills: ${recipientInfo.skills}`;
    }
    if (recipientInfo.industry) {
      prompt += `\nRecipient industry: ${recipientInfo.industry}`;
    }

    if (conversationHistory.length > 0) {
      prompt += `\n\nRecent conversation:\n${conversationHistory.map((m) => `- ${m}`).join('\n')}`;
    }

    prompt += `\n\nUser's request: ${userPrompt}`;
    return prompt;
  }

  // --- Insert text into LinkedIn's message composer ---
  function insertIntoComposer(text) {
    const composerSelectors = [
      '.msg-form__contenteditable',
      'div.msg-form__msg-content-container--is-active .msg-form__contenteditable',
      '[role="textbox"][contenteditable="true"]',
    ];

    for (const sel of composerSelectors) {
      const composer = document.querySelector(sel);
      if (composer) {
        composer.focus();

        // Clear existing content
        composer.innerHTML = '';

        // Split by newlines and create a <p> for each line (LinkedIn's expected format)
        const lines = text.split('\n');
        lines.forEach((line) => {
          const p = document.createElement('p');
          p.textContent = line || '\u200B'; // zero-width space for empty lines
          composer.appendChild(p);
        });

        // Dispatch input event so LinkedIn detects the change
        composer.dispatchEvent(new Event('input', { bubbles: true }));
        composer.dispatchEvent(new Event('change', { bubbles: true }));

        // Also try execCommand as a fallback to ensure LinkedIn registers it
        try {
          document.execCommand('selectAll', false, null);
          document.execCommand('insertText', false, text);
        } catch {
          // execCommand may not work in all contexts, that's fine
        }

        return true;
      }
    }
    return false;
  }

  // --- Initialize ---
  function init() {
    const sidebar = createSidebar();
    const toggleBtn = createToggleButton();

    // Close sidebar when clicking outside
    const generateBtn = document.getElementById('la-generate');
    const promptInput = document.getElementById('la-prompt');
    const toneSelect = document.getElementById('la-tone');
    const draftSection = document.getElementById('la-draft-section');
    const draftOutput = document.getElementById('la-draft-output');
    const copyBtn = document.getElementById('la-copy');
    const errorDiv = document.getElementById('la-error');

    // Load default tone
    chrome.storage.sync.get(['defaultTone'], (result) => {
      if (result.defaultTone) {
        toneSelect.value = result.defaultTone;
      }
    });

    // About me - persist across sessions
    const aboutMeInput = document.getElementById('la-about-me');
    chrome.storage.sync.get(['aboutMe'], (result) => {
      if (result.aboutMe) aboutMeInput.value = result.aboutMe;
    });
    aboutMeInput.addEventListener('blur', () => {
      chrome.storage.sync.set({ aboutMe: aboutMeInput.value });
    });

    // Resume upload
    const resumeBtn = document.getElementById('la-resume-btn');
    const resumeInput = document.getElementById('la-resume-input');
    const resumeName = document.getElementById('la-resume-name');
    let resumeText = '';

    // Load saved resume
    chrome.storage.local.get(['resumeText', 'resumeFileName'], (result) => {
      if (result.resumeText) {
        resumeText = result.resumeText;
        resumeName.textContent = result.resumeFileName || 'Resume attached';
        resumeBtn.textContent = 'Change resume';
        resumeBtn.classList.add('attached');
      }
    });

    resumeBtn.addEventListener('click', () => resumeInput.click());
    resumeInput.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      resumeName.textContent = 'Reading...';

      if (file.name.endsWith('.txt')) {
        resumeText = await file.text();
      } else if (file.name.endsWith('.pdf')) {
        resumeText = await extractPdfText(file);
      }

      // Trim to 2000 chars to stay within reasonable prompt size
      resumeText = resumeText.substring(0, 2000);
      chrome.storage.local.set({ resumeText, resumeFileName: file.name });
      resumeName.textContent = file.name;
      resumeBtn.textContent = 'Change resume';
      resumeBtn.classList.add('attached');
    });

    // Length slider label
    const lengthSlider = document.getElementById('la-length');
    const lengthLabel = document.getElementById('la-length-label');
    lengthSlider.addEventListener('input', () => {
      const v = parseInt(lengthSlider.value);
      lengthLabel.textContent = v === 0 ? 'Auto' : `${v} sentence${v > 1 ? 's' : ''}`;
    });

    // Toggle sidebar
    toggleBtn.addEventListener('click', () => {
      sidebar.classList.toggle('open');
      if (sidebar.classList.contains('open')) {
        // Start hidden, fetch, then crossfade in
        const contextRow = document.querySelector('.la-context-row');
        if (contextRow) { contextRow.style.opacity = '0'; contextRow.style.transition = 'none'; }
        fetchAndUpdatePlaceholder();
      }
    });

    // Close button
    document.getElementById('la-close').addEventListener('click', () => {
      sidebar.classList.remove('open');
    });

    // Sidebar only closes via the X button

    // Tab switching
    const tabs = sidebar.querySelectorAll('.la-tab');
    const tabContents = sidebar.querySelectorAll('.la-tab-content');
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        tabs.forEach(t => t.classList.remove('active'));
        tabContents.forEach(c => c.classList.remove('active'));
        tab.classList.add('active');
        const target = sidebar.querySelector(`.la-tab-${tab.dataset.tab}`);
        if (target) target.classList.add('active');
      });
    });

    // --- MutationObserver to detect new conversation participant ---
    let mutationObserverInstance = null;

    function detectParticipantViaMutation() {
      // Stop any previous observer
      if (mutationObserverInstance) {
        mutationObserverInstance.disconnect();
        mutationObserverInstance = null;
      }

      // Reset participant
      activeMessagingParticipant = null;
      latestMessagingParticipant = null;

      if (!location.pathname.includes('/messaging/')) return;

      // Snapshot existing STRONG texts to ignore them (they're from stale conversations)
      const existingStrongs = new Set();
      document.querySelectorAll('strong').forEach(s => {
        const t = s.textContent.trim();
        if (t) existingStrongs.add(t);
      });

      // Snapshot existing /in/ links
      const existingLinks = new Set();
      document.querySelectorAll('a[href*="/in/"]').forEach(a => {
        const slug = a.href.match(/\/in\/([^/?]+)/)?.[1];
        if (slug) existingLinks.add(slug);
      });

      console.log('[EasyReach] MutationObserver started. Existing strongs:', existingStrongs.size, 'Existing links:', existingLinks.size);

      let foundName = '';
      let foundProfileUrl = '';
      const myName = getMyName();

      mutationObserverInstance = new MutationObserver((mutations) => {
        if (foundName && foundProfileUrl) return; // Already found

        for (const mutation of mutations) {
          for (const node of mutation.addedNodes) {
            if (node.nodeType !== Node.ELEMENT_NODE) continue;

            // Check for new profile links
            const newLinks = node.querySelectorAll ? node.querySelectorAll('a[href*="/in/"]') : [];
            for (const link of newLinks) {
              const slug = link.href.match(/\/in\/([^/?]+)/)?.[1];
              if (slug && !existingLinks.has(slug) && !link.href.includes('/overlay/')) {
                const staleSlug = lastProfilePageUrl ? lastProfilePageUrl.match(/\/in\/([^/?]+)/)?.[1] : '';
                if (staleSlug && slug === staleSlug) continue;
                const linkText = link.textContent.trim().split('·')[0].trim().split('\n')[0].trim();
                // Skip links with "View" or "profile" text (e.g. "View Anthony's profile")
                if (!linkText || linkText.includes('View') || linkText.includes('profile')) continue;
                // Skip the logged-in user (exact or partial match)
                if (myName) {
                  const myFirst = myName.split(' ')[0].toLowerCase();
                  if (linkText.toLowerCase() === myName.toLowerCase()) continue;
                  if (linkText.toLowerCase().includes(myFirst) && linkText.length < myName.length + 15) continue;
                }
                foundProfileUrl = 'https://www.linkedin.com/in/' + slug + '/';
                if (linkText && /^[A-Z]/.test(linkText)) {
                  foundName = linkText;
                }
                console.log('[EasyReach] MutationObserver found new link:', foundProfileUrl, 'name:', foundName);
              }
            }

            // Check for new STRONG tags (message sender names)
            const newStrongs = node.querySelectorAll ? node.querySelectorAll('strong') : [];
            if (node.tagName === 'STRONG') {
              const t = node.textContent.trim();
              if (t && !existingStrongs.has(t) && /^[A-Z]/.test(t) && t.length < 50) {
                // Skip the logged-in user
                if (!myName || t.toLowerCase() !== myName.toLowerCase()) {
                  if (!foundName) foundName = t;
                }
              }
            }
            for (const strong of newStrongs) {
              const t = strong.textContent.trim();
              if (t && !existingStrongs.has(t) && /^[A-Z]/.test(t) && t.length < 50) {
                // Skip the logged-in user
                if (!myName || t.toLowerCase() !== myName.toLowerCase()) {
                  if (!foundName) foundName = t;
                }
              }
            }
          }
        }

        // If we found something, update
        if (foundName || foundProfileUrl) {
          activeMessagingParticipant = {
            name: foundName || 'Unknown',
            profileUrl: foundProfileUrl,
          };
          console.log('[EasyReach] MutationObserver detected participant:', activeMessagingParticipant);
          fetchAndUpdatePlaceholder();
        }
      });

      mutationObserverInstance.observe(document.body, {
        childList: true,
        subtree: true,
      });

      // Stop observing after 5 seconds to avoid performance issues
      setTimeout(() => {
        if (mutationObserverInstance) {
          mutationObserverInstance.disconnect();
          mutationObserverInstance = null;
          console.log('[EasyReach] MutationObserver stopped. Found:', foundName, foundProfileUrl);
        }
      }, 5000);
    }

    // Auto-update when switching conversations
    let lastConvoUrl = location.href;
    // Watch for URL changes (LinkedIn is a SPA, so URL changes without page reload)
    const urlObserver = setInterval(() => {
      if (location.href !== lastConvoUrl) {
        lastConvoUrl = location.href;

        // Start mutation detection BEFORE the UI updates
        detectParticipantViaMutation();

        if (sidebar.classList.contains('open')) {
          // Immediately fade out picture/name/headline AND placeholder together
          const contextRow = document.querySelector('.la-context-row');
          if (contextRow) {
            contextRow.style.transition = 'opacity 0.25s ease';
            contextRow.style.opacity = '0';
          }
          let placeholderStyle = document.getElementById('la-placeholder-fade');
          if (!placeholderStyle) {
            placeholderStyle = document.createElement('style');
            placeholderStyle.id = 'la-placeholder-fade';
            document.head.appendChild(placeholderStyle);
          }
          placeholderStyle.textContent = '#la-prompt::placeholder { color: transparent !important; transition: color 0.25s ease; }';

          draftSection.style.display = 'none';
          draftOutput.textContent = '';
          promptInput.value = '';
          errorDiv.textContent = '';

          // Poll iframe for new data, then fetch and fade in
          let pollCount = 0;
          const pollInterval = setInterval(() => {
            pollCount++;
            const info = getRecipientInfo();
            if ((info.name && info.name !== 'Unknown') || pollCount >= 10) {
              clearInterval(pollInterval);
              fetchAndUpdatePlaceholder();
            }
          }, 150);
        }
      }
    }, 300);

    // Update recipient info (no transition — used for initial load)
    function updateRecipientInfo() {
      const info = getRecipientInfo();
      // GUARD: never display the logged-in user as the recipient
      if (cachedMyName && info.name && info.name.toLowerCase() === cachedMyName.toLowerCase()) {
        info.name = 'Detecting...';
        info.headline = '';
        info.photoUrl = '';
      }
      const nameEl = document.getElementById('la-recipient-name');
      const headlineEl = document.getElementById('la-recipient-headline');
      const photo = document.getElementById('la-recipient-photo');
      const initials = document.getElementById('la-recipient-initials');

      nameEl.textContent = info.name;
      headlineEl.textContent = info.headline;
      photo.src = '';
      photo.alt = '';
      photo.style.display = 'none';
      initials.style.display = 'none';

      if (info.photoUrl) {
        photo.src = info.photoUrl;
        photo.alt = info.name;
        photo.style.display = 'block';
      } else {
        const nameInitials = (info.name || 'U').split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase();
        initials.textContent = nameInitials;
        initials.style.display = 'flex';
      }

      promptInput.placeholder = '';
    }

    // Crossfade: keep old visible, fade out, swap content, fade in
    function crossfadeRecipientInfo(name, headline, photoUrl) {
      const contextRow = document.querySelector('.la-context-row');
      const nameEl = document.getElementById('la-recipient-name');
      const headlineEl = document.getElementById('la-recipient-headline');
      const photo = document.getElementById('la-recipient-photo');
      const initials = document.getElementById('la-recipient-initials');
      if (!contextRow) return;

      // GUARD: never display the logged-in user as the recipient
      if (cachedMyName && name && name.toLowerCase() === cachedMyName.toLowerCase()) {
        name = 'Detecting...';
        headline = '';
        photoUrl = '';
      }

      // Content is already faded out — just swap and fade in
      nameEl.textContent = name || 'Unknown';
      headlineEl.textContent = headline || '';
      photo.src = '';
      photo.style.display = 'none';
      initials.style.display = 'none';

      if (photoUrl) {
        photo.src = photoUrl;
        photo.alt = name || '';
        photo.style.display = 'block';
      } else {
        const nameInitials = (name || 'U').split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase();
        initials.textContent = nameInitials;
        initials.style.display = 'flex';
      }

      // Fade in
      contextRow.style.transition = 'opacity 0.3s ease';
      contextRow.style.opacity = '1';
      // Restore placeholder color
      let placeholderStyle = document.getElementById('la-placeholder-fade');
      if (placeholderStyle) {
        placeholderStyle.textContent = '#la-prompt::placeholder { color: #b0b0b0; transition: color 0.3s ease; }';
      }
    }

    // Fetch profile and update placeholder with most recent experience
    let placeholderFetchId = 0;
    async function fetchAndUpdatePlaceholder() {
      const fetchId = ++placeholderFetchId;

      // Make sure we know who the logged-in user is before detecting recipient
      if (myNamePromise) await myNamePromise;

      let info = getRecipientInfo();

      // On fresh messaging page load, data may not be ready yet — wait for intercepted
      // API response or DOM to populate. Also treat self-name as not found.
      const isSelfOrUnknown = (n) => !n || n === 'Unknown' || n === 'Detecting...' || (cachedMyName && n.toLowerCase() === cachedMyName.toLowerCase());
      if (isSelfOrUnknown(info.name) && location.pathname.includes('/messaging/')) {
        for (let retry = 0; retry < 15; retry++) {
          await new Promise(r => setTimeout(r, 300));
          if (fetchId !== placeholderFetchId) return;
          info = getRecipientInfo();
          if (!isSelfOrUnknown(info.name)) break;
        }
        // If still unknown/self, try the Voyager messaging API as last resort
        if (isSelfOrUnknown(info.name)) {
          const apiParticipant = await fetchActiveConversationParticipant();
          if (fetchId !== placeholderFetchId) return;
          if (apiParticipant) {
            info.name = apiParticipant.name;
            info.profileUrl = apiParticipant.profileUrl;
            console.log('[EasyReach] Got participant from messaging API:', info.name);
          }
        }
      }

      // If no profile URL but we have a name, try searching by name
      if (!info.profileUrl && info.name && info.name !== 'Unknown') {
        const searchedUrl = await searchProfileByName(info.name);
        if (searchedUrl) {
          info.profileUrl = searchedUrl;
        }
      }

      if (!info.profileUrl) {
        // No profile URL — just show what we have and reveal
        crossfadeRecipientInfo(info.name, info.headline || '', info.photoUrl || '');
        return;
      }

      promptInput.placeholder = '';

      // Fetch profile
      let firstName = (info.name || '').split(' ')[0] || 'them';
      const profile = await fetchFullProfile(info.profileUrl);
      if (fetchId !== placeholderFetchId) return;

      // Apply all data and crossfade from old to new
      const finalName = profile.name || info.name;
      const finalHeadline = profile.headline || info.headline || '';
      const finalPhoto = profile.photoUrl || '';
      if (profile.name) firstName = profile.firstName || profile.name.split(' ')[0];

      crossfadeRecipientInfo(finalName, finalHeadline, finalPhoto);

      // Wait for fade-in to finish, then type out placeholder
      if (profile.experience) {
        await new Promise(resolve => setTimeout(resolve, 350));
        if (fetchId !== placeholderFetchId) return;

        const mostRecent = profile.experience.split('\n')[0];
        const fullPlaceholder = `for example, ask about ${firstName}'s experience as ${mostRecent}`;

        let idx = 0;
        const typeInterval = setInterval(() => {
          if (fetchId !== placeholderFetchId) { clearInterval(typeInterval); return; }
          idx += 2;
          promptInput.placeholder = fullPlaceholder.substring(0, idx);
          if (idx >= fullPlaceholder.length) clearInterval(typeInterval);
        }, 16);
      }
    }

    // Generate draft
    generateBtn.addEventListener('click', async () => {
      const userPrompt = promptInput.value.trim();
      if (!userPrompt) {
        errorDiv.textContent = 'Please describe what you want to say.';
        return;
      }

      errorDiv.textContent = '';
      generateBtn.disabled = true;
      generateBtn.textContent = 'Generating...';
      draftSection.classList.remove('visible');

      try {
        const settings = await new Promise((resolve) => {
          chrome.storage.sync.get(['geminiApiKey'], resolve);
        });

        if (!settings.geminiApiKey) {
          throw new Error('No API key set. Click the extension icon to add your Gemini API key.');
        }

        const myName = getMyName() || 'Me';
        updateRecipientInfo();
        const recipientInfo = getRecipientInfo();
        const history = getConversationHistory();
        const tone = toneSelect.value;
        const lengthVal = parseInt(document.getElementById('la-length').value);
        const length = lengthVal > 0 ? String(lengthVal) : '';
        const aboutMe = document.getElementById('la-about-me').value.trim();
        const senderResume = resumeText;

        // Fetch full profile in background
        if (recipientInfo.profileUrl) {
          generateBtn.textContent = 'Fetching profile...';
          const fullProfile = await fetchFullProfile(recipientInfo.profileUrl);
          Object.assign(recipientInfo, fullProfile);
          generateBtn.textContent = 'Generating...';
        }

        const draft = await generateDraft(settings.geminiApiKey, userPrompt, tone, length, recipientInfo, history, myName, aboutMe, senderResume);

        // Type the draft into EasyReach smoothly, then insert into LinkedIn
        draftOutput.textContent = '';
        draftSection.classList.add('visible');
        await typeIntoDraftOutput(draft, draftOutput);

        // Insert into LinkedIn (or copy on profile pages) after typing completes
        if (isProfilePage()) {
          try {
            await navigator.clipboard.writeText(draft);
            copyBtn.textContent = 'Copied!';
            setTimeout(() => { copyBtn.textContent = 'Copy'; }, 2000);
          } catch {}
        } else {
          const inserted = insertIntoComposer(draft);
          if (!inserted) {
            errorDiv.textContent = 'Draft ready but could not auto-insert. Click on a conversation first.';
          }
        }
      } catch (err) {
        errorDiv.textContent = err.message;
      } finally {
        generateBtn.disabled = false;
        generateBtn.textContent = 'Generate Draft';
      }
    });

    // Insert into composer
    // Copy to clipboard
    copyBtn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(draftOutput.textContent);
        copyBtn.textContent = 'Copied!';
        setTimeout(() => {
          copyBtn.textContent = 'Copy';
        }, 2000);
      } catch {
        errorDiv.textContent = 'Failed to copy. Try selecting the text manually.';
      }
    });
  }

  // Smooth typing effect for draft output — returns a promise that resolves when done
  function typeIntoDraftOutput(text, el) {
    return new Promise(resolve => {
      let i = 0;
      const half = Math.floor(text.length / 2);
      const speedFast = Math.max(6, Math.min(16, 1200 / half)); // first half ~1.2s
      const speedSlow = Math.max(12, Math.min(28, 1800 / (text.length - half))); // second half ~1.8s
      function tick() {
        if (i < text.length) {
          const chunk = Math.min(3, text.length - i);
          el.textContent += text.substring(i, i + chunk);
          i += chunk;
          const speed = i < half ? speedFast : speedSlow;
          setTimeout(tick, speed);
        } else {
          resolve();
        }
      }
      tick();
    });
  }

  init();
})();
