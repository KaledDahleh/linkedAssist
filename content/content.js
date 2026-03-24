// EasyReach Content Script
// Runs on LinkedIn messaging pages

(function () {
  'use strict';

  // --- Load font ---
  const fontLink = document.createElement('link');
  fontLink.href = 'https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap';
  fontLink.rel = 'stylesheet';
  document.head.appendChild(fontLink);

  // --- Sidebar HTML ---
  function createSidebar() {
    const sidebar = document.createElement('div');
    sidebar.id = 'easyreach-sidebar';
    sidebar.innerHTML = `
      <div class="la-header">
        <h2 class="la-title">EasyReach</h2>
        <button class="la-close">&times;</button>
      </div>
      <hr class="la-divider" />
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
    btn.textContent = '✍️';
    btn.title = 'Open EasyReach';
    document.body.appendChild(btn);
    return btn;
  }

  // --- Auto-detect the logged-in user's name ---
  function getMyName() {
    // The nav "Me" button has an alt text with the user's name
    const meImg = document.querySelector('.global-nav__me-photo, img.nav-item__profile-member-photo');
    if (meImg && meImg.alt) {
      return meImg.alt.trim();
    }
    // Fallback: look for the profile nav link text
    const meLink = document.querySelector('.global-nav__primary-link--me .t-14');
    if (meLink) {
      return meLink.textContent.trim();
    }
    return '';
  }

  // --- Detect if we're on a profile page ---
  function isProfilePage() {
    return /^\/in\/[^/]+/.test(location.pathname);
  }

  function getProfilePageInfo() {
    const name = document.querySelector('h1.text-heading-xlarge, h1.inline')?.textContent?.trim() || 'Unknown';
    const headline = document.querySelector('.text-body-medium.break-words')?.textContent?.trim() || '';
    const profileUrl = location.href.split('?')[0];

    let photoUrl = '';
    const profileImg = document.querySelector('.pv-top-card-profile-picture__image, .profile-photo-edit__preview, img.evi-image');
    if (profileImg) {
      const src = profileImg.src || '';
      if (src && src.startsWith('http') && !src.includes('ghost')) {
        photoUrl = src;
      }
    }

    return { name, headline, profileUrl, photoUrl };
  }

  // --- Scraping LinkedIn context ---
  function getRecipientInfo() {
    // If on a profile page, scrape from the profile itself
    if (isProfilePage()) {
      return getProfilePageInfo();
    }

    // Otherwise, scrape from messaging UI
    const headerSelectors = [
      'h2.msg-entity-lockup__entity-title',
      '.msg-conversation-card__participant-names',
      '.msg-overlay-bubble-header__title',
    ];

    let name = '';
    for (const sel of headerSelectors) {
      const el = document.querySelector(sel);
      if (el && el.textContent.trim()) {
        name = el.textContent.trim();
        break;
      }
    }

    let profileUrl = '';
    if (name) {
      const allProfileLinks = document.querySelectorAll('a[href*="/in/"]');
      for (const link of allProfileLinks) {
        const linkText = link.textContent.trim().split('\n')[0].trim();
        if (linkText === name && link.href.includes('/in/')) {
          profileUrl = link.href;
          break;
        }
      }
    }
    if (!profileUrl) {
      const profileCardLink = document.querySelector('.profile-card-one-to-one__profile-link');
      const headerLink = document.querySelector('.msg-thread__link-to-profile');
      if (profileCardLink && profileCardLink.href) {
        profileUrl = profileCardLink.href;
      } else if (headerLink && headerLink.href) {
        profileUrl = headerLink.href;
      }
    }

    const headlineSelectors = [
      '.artdeco-entity-lockup__subtitle',
      '.msg-entity-lockup__entity-subtitle',
      '.profile-card-one-to-one__subtitle',
    ];

    let headline = '';
    for (const sel of headlineSelectors) {
      const el = document.querySelector(sel);
      if (el && el.textContent.trim()) {
        headline = el.textContent.trim();
        break;
      }
    }

    let photoUrl = '';
    const photoSelectors = [
      '.msg-entity-lockup__entity-photo img',
      '.msg-thread__link-to-profile img',
      '.profile-card-one-to-one__profile-link img',
      '.presence-entity__image',
      '.msg-selectable-entity__entity img',
    ];
    for (const sel of photoSelectors) {
      const imgs = document.querySelectorAll(sel);
      for (const img of imgs) {
        const src = img.src || img.getAttribute('data-delayed-url') || '';
        if (src && src.startsWith('http') && !src.includes('ghost')) {
          const alt = img.alt || '';
          if (name && alt.includes(name)) {
            photoUrl = src;
            break;
          }
        }
      }
      if (photoUrl) break;
    }
    if (!photoUrl) {
      const presenceEls = document.querySelectorAll('.presence-entity__image, .EntityPhoto-circle-4, [data-anonymize="headshot-photo"]');
      for (const el of presenceEls) {
        const bg = el.style?.backgroundImage || '';
        const bgMatch = bg.match(/url\(["']?(https[^"')]+)["']?\)/);
        if (bgMatch) {
          photoUrl = bgMatch[1];
          break;
        }
      }
    }

    const profileDetails = scrapeProfilePanel();

    return { name: name || 'Unknown', headline, profileUrl, photoUrl, ...profileDetails };
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

    // Try to get profile URL for context
    const profileLink = document.querySelector(
      '.msg-thread__link-to-profile, .msg-thread-header__profile-link, a[href*="/in/"]'
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

      // If it's an encoded ID (starts with ACoAA), resolve vanity from the profile page
      if (profileId.startsWith('ACoAA')) {
        try {
          const pageResp = await fetch(profileUrl, { credentials: 'include' });
          const html = await pageResp.text();
          // Find all vanity names in the page, pick the one in a canonical/og:url tag
          const ogMatch = html.match(/<meta[^>]*property="og:url"[^>]*content="[^"]*\/in\/([a-zA-Z0-9\-]+)/);
          const linkMatch = html.match(/<link[^>]*rel="canonical"[^>]*href="[^"]*\/in\/([a-zA-Z0-9\-]+)/);
          const resolved = (ogMatch && ogMatch[1]) || (linkMatch && linkMatch[1]);
          if (resolved && !resolved.startsWith('ACoAA')) {
            profileId = resolved;
          }
        } catch {}
      }

      // Get CSRF token from cookies
      const csrfToken = document.cookie.match(/JSESSIONID="?([^";]+)"?/)?.[1] || '';

      const headers = {
        'csrf-token': csrfToken,
        'x-restli-protocol-version': '2.0.0',
      };

      const profile = {};
      const debugInfo = { profileId, apiResults: {} };

      // 1. Resolve vanity name from dash API
      try {
        const dashResp = await fetch(
          `https://www.linkedin.com/voyager/api/identity/dash/profiles?q=memberIdentity&memberIdentity=${profileId}&decorationId=com.linkedin.voyager.dash.deco.identity.profile.WebTopCardCore-18`,
          { credentials: 'include', headers }
        );
        if (dashResp.ok) {
          const data = await dashResp.json();
          const elements = data.elements || [];
          if (elements.length > 0) {
            const p = elements[0];
            if (p.publicIdentifier) profileId = p.publicIdentifier;
          }
        }
      } catch {}

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
            if (el.headline) profile.headline = el.headline;
            if (el.summary) profile.about = el.summary.substring(0, 500);
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

    const closeBtn = sidebar.querySelector('.la-close');
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
        updateRecipientInfo();
        fetchAndUpdatePlaceholder();
      }
    });

    closeBtn.addEventListener('click', () => {
      sidebar.classList.remove('open');
    });

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

    // Auto-update when switching conversations
    let lastConvoUrl = location.href;
    // Watch for URL changes (LinkedIn is a SPA, so URL changes without page reload)
    const urlObserver = setInterval(() => {
      if (location.href !== lastConvoUrl) {
        lastConvoUrl = location.href;
        if (sidebar.classList.contains('open')) {
          // Small delay to let LinkedIn render the new conversation
          setTimeout(() => {
            updateRecipientInfo();
            fetchAndUpdatePlaceholder();
            draftSection.style.display = 'none';
            draftOutput.textContent = '';
            promptInput.value = '';
            errorDiv.textContent = '';
          }, 500);
        }
      }
    }, 300);

    // Also watch for clicks on conversation list items
    document.addEventListener('click', (e) => {
      const convoItem = e.target.closest('.msg-conversation-listitem, .msg-conversation-card');
      if (convoItem && sidebar.classList.contains('open')) {
        setTimeout(() => {
          updateRecipientInfo();
          fetchAndUpdatePlaceholder();
          draftSection.style.display = 'none';
          draftOutput.textContent = '';
          promptInput.value = '';
          errorDiv.textContent = '';
        }, 500);
      }
    });

    // Update recipient info
    function updateRecipientInfo() {
      const info = getRecipientInfo();
      document.getElementById('la-recipient-name').textContent = info.name;
      document.getElementById('la-recipient-headline').textContent = info.headline;
      const photo = document.getElementById('la-recipient-photo');
      const initials = document.getElementById('la-recipient-initials');
      // Always reset photo first to prevent stale images
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

      // Dynamic placeholder based on context
      const firstName = (info.name || '').split(' ')[0] || 'them';
      const headline = info.headline || '';
      const history = getConversationHistory();
      let placeholder;

      promptInput.placeholder = '';
    }

    // Fetch profile and update placeholder with most recent experience
    let placeholderFetchId = 0;
    async function fetchAndUpdatePlaceholder() {
      const fetchId = ++placeholderFetchId;
      const info = getRecipientInfo();
      if (!info.profileUrl) return;

      // Start fading in "e.g. " immediately
      promptInput.placeholder = '';
      promptInput.style.transition = 'none';
      promptInput.style.opacity = '1';

      // Fade in the prefix
      const prefix = 'for example, ';
      let charIdx = 0;
      const charDelay = Math.floor(1000 / prefix.length);
      const prefixInterval = setInterval(() => {
        if (fetchId !== placeholderFetchId) { clearInterval(prefixInterval); return; }
        charIdx++;
        promptInput.placeholder = prefix.substring(0, charIdx);
        if (charIdx >= prefix.length) clearInterval(prefixInterval);
      }, charDelay);

      // Fetch profile in parallel
      const firstName = (info.name || '').split(' ')[0] || 'them';
      const profile = await fetchFullProfile(info.profileUrl);
      if (fetchId !== placeholderFetchId) return;

      if (profile.experience) {
        const mostRecent = profile.experience.split('\n')[0];
        const rest = `ask about ${firstName}'s experience as ${mostRecent}`;

        // Wait for prefix to finish if it hasn't
        await new Promise(resolve => {
          const check = setInterval(() => {
            if (promptInput.placeholder.length >= prefix.length) {
              clearInterval(check);
              resolve();
            }
          }, 30);
        });

        if (fetchId !== placeholderFetchId) return;

        // Fade in the rest
        let restIdx = 0;
        const restInterval = setInterval(() => {
          if (fetchId !== placeholderFetchId) { clearInterval(restInterval); return; }
          restIdx += 2;
          promptInput.placeholder = prefix + rest.substring(0, restIdx);
          if (restIdx >= rest.length) clearInterval(restInterval);
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

        draftOutput.textContent = draft;
        draftSection.classList.add('visible');

        // On profile pages, auto-copy to clipboard; on messaging, auto-insert
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

  init();
})();
