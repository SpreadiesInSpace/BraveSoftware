// AI Channel Blocker - Content Script

(function() {
  'use strict';

  let blacklist = new Set();
  let whitelist = new Set();
  let warnlist = new Set();
  let communityBlacklist = new Set();
  let communityWarnlist = new Set();
  let useCommunityList = true;
  let blockMode = 'warn'; // 'disabled', 'warn', or 'hide'
  let username = ''; // Username for submissions
  let anonymousSubmit = false; // Anonymous submission mode
  let submitButtonConfirmed = false; // Has user seen first-time submit warning
  let bannerMode = 'ai'; // AI-flag banner: 'off' | 'ai' (AI disclosure only) | 'all' (also altered/synthetic)
  let submittedChannels = []; // Last 150 submitted channel handles (to prevent duplicates)
  // Channels with a submission currently in flight. submittedChannels is only
  // updated once the API responds, so without this an in-flight channel would
  // pass the dedup check from a second trigger (e.g. the player flag button AND
  // the AI-flag banner for the same channel) and submit twice.
  const inFlightSubmissions = new Set();
  const DEBUG = false; // Set to true for console logging

  // Keyboard shortcuts are configured natively (chrome://extensions/shortcuts
  // and Firefox's Manage Extension Shortcuts) and declared in the manifest as
  // commands. The background relays a fired command to this tab; we then act on
  // the channel under the cursor — no click on the video, so YouTube's
  // algorithm gets no interaction signal from reporting AI slop.
  // Element currently under the cursor + its coords, used to resolve which
  // channel a shortcut targets.
  let lastHoverTarget = null;
  let lastHoverCoords = { x: 0, y: 0 };

  // Cache for Shorts video -> channel info mapping
  const shortsChannelCache = new Map();

  // Flag to prevent processing during navigation/cleanup
  let isNavigating = false;

  // Store last right-clicked element for context menu
  let lastContextMenuTarget = null;
  let lastContextMenuCoords = { x: 0, y: 0 };

  // Small DOM builder used by overlays/modals — avoids innerHTML so user-controlled
  // strings (channel name, reason, etc.) can't be interpreted as HTML.
  function el(tag, attrs, children) {
    const node = document.createElement(tag);
    if (attrs) {
      for (const k in attrs) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k === 'onClick') node.addEventListener('click', attrs[k]);
        else node.setAttribute(k, attrs[k]);
      }
    }
    if (children) {
      for (const c of children) {
        if (c == null) continue;
        node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
      }
    }
    return node;
  }

  // Debounce timer for processing
  let processTimer = null;

  // Throttle timer for MutationObserver callback
  let observerThrottleTimer = null;
  let pendingMutations = false;
  let lastUrl = location.href;

  // Pre-built lookup map: channelId variant → {reason, isWarnlist, source}
  // Rebuilt on every settings load. Turns 5 × Set.has() with variant
  // expansion into a single Map.get().
  let channelLookup = new Map();

  function log(...args) {
    if (DEBUG) {
      console.log('[AiBlock]', ...args);
    }
  }

  // Coalesce videosHidden increments within a single mutation pass. Without
  // this, blocking N videos in a channel-page hide-mode sends N racing
  // read-modify-write messages to the background and counts get dropped.
  let pendingHiddenCount = 0;
  let hiddenFlushScheduled = false;
  function bumpVideosHidden(n = 1) {
    pendingHiddenCount += n;
    if (hiddenFlushScheduled) return;
    hiddenFlushScheduled = true;
    requestAnimationFrame(() => {
      const by = pendingHiddenCount;
      pendingHiddenCount = 0;
      hiddenFlushScheduled = false;
      if (by > 0) {
        browser.runtime.sendMessage({ action: 'incrementVideosHidden', by });
      }
    });
  }

  // Shared handle/URL helpers so every call site does the same thing.
  function stripAt(s) {
    if (!s) return '';
    return s.startsWith('@') ? s.slice(1) : s;
  }
  function ensureAt(s) {
    if (!s) return '';
    return s.startsWith('@') ? s : '@' + s;
  }
  // Extract `@handle` or channel ID (UCxxx) from a YouTube href. Returns the
  // same form the URL carried (with @ for handles, raw for /channel/).
  function matchChannelUrl(href) {
    if (!href) return null;
    const m = href.match(/\/@([^\/\?\s#]+)|\/channel\/([^\/\?\s#]+)/);
    if (!m) return null;
    return m[1] ? `@${m[1]}` : m[2];
  }

  // Canonical form: @-stripped, percent-decoded (best-effort), lowercased.
  // Both stored map keys and lookup inputs pass through this, so 1 Map entry
  // per list entry is enough — no variant explosion. Memory for a 10k
  // community list drops from ~60k keys to ~10k.
  function normalizeHandle(id) {
    if (!id) return '';
    let s = String(id);
    if (s.startsWith('@')) s = s.slice(1);
    try {
      s = decodeURIComponent(s);
    } catch (e) { /* invalid URI escapes — keep raw */ }
    return s.toLowerCase();
  }

  // Build the channel lookup map from all lists.
  // Called once per settings load — replaces per-video variant expansion +
  // 5× Set.has() with a single normalized Map.get().
  function buildChannelLookup() {
    channelLookup = new Map();
    // Insert in ascending priority order: later entries overwrite earlier
    // so higher-priority lists win on conflict.
    const layers = [
      [communityWarnlist,  'Community warnlist',         true,  'community-warnlist'],
      [communityBlacklist, 'Community blocklist',        false, 'community-blacklist'],
      [blacklist,          'Manually blacklisted',       false, 'manual-blacklist'],
      [warnlist,           'Manually added to warnlist', true,  'manual-warnlist'],
      [whitelist,          null,                         false, 'whitelist'],
    ];
    for (const [set, reason, isWarnlist, source] of layers) {
      const entry = { reason, isWarnlist, source };
      for (const id of set) {
        const canonical = normalizeHandle(id);
        if (canonical) channelLookup.set(canonical, entry);
      }
    }
  }

  // Single-lookup channel check. Returns the matched entry or null.
  function lookupChannel(channelId) {
    if (!channelId) return null;
    return channelLookup.get(normalizeHandle(channelId)) || null;
  }

  // Fetch channel info from a Shorts URL
  async function fetchChannelFromShortsUrl(shortsUrl) {
    try {
      // Check cache first
      if (shortsChannelCache.has(shortsUrl)) {
        log(`Using cached channel info for ${shortsUrl}`);
        return shortsChannelCache.get(shortsUrl);
      }

      log(`Fetching channel info for ${shortsUrl}`);

      const response = await fetch(shortsUrl);
      const html = await response.text();

      // Extract channel info from the HTML
      // Look for channel link in the page
      const channelMatch = html.match(/"ownerChannelName":"([^"]+)"/);
      const handleMatch = html.match(/"webCommandMetadata".*?"url":"(\/@[^"]+)"/);

      let channelName = null;
      let channelId = null;

      if (channelMatch) {
        channelName = channelMatch[1];
      }

      if (handleMatch) {
        channelId = handleMatch[1].replace(/^\//, ''); // Remove leading /
        // Remove /shorts or other trailing paths
        channelId = channelId.split('/')[0];
      } else {
        // Try alternate pattern for channel ID
        const idMatch = html.match(/"channelId":"([^"]+)"/);
        if (idMatch) {
          channelId = idMatch[1];
        }
      }

      const result = { channelName, channelId };

      // Cache the result
      shortsChannelCache.set(shortsUrl, result);

      log(`Fetched channel info: ${channelName} (${channelId})`);
      return result;

    } catch (error) {
      log(`Error fetching channel info: ${error}`);
      return { channelName: null, channelId: null };
    }
  }

  // Load settings from storage
  function loadSettings() {
    return browser.storage.local.get([
      'blacklist',
      'whitelist',
      'warnlist',
      'blockedChannels',
      'blockMode',
      'communityBlacklist',
      'communityMediumList',
      'useCommunityList',
      'username',
      'anonymousSubmit',
      'submitButtonConfirmed',
      'submittedChannels',
      'bannerMode'
    ]).then(result => {
        // Support both new and legacy storage keys
        blacklist = new Set(result.blacklist || result.blockedChannels || []);
        whitelist = new Set(result.whitelist || []);
        warnlist = new Set(result.warnlist || []);
        communityBlacklist = new Set(result.communityBlacklist || []);
        communityWarnlist = new Set(result.communityMediumList || []);
        useCommunityList = result.useCommunityList !== false;
        blockMode = result.blockMode || 'hide';
        username = result.username || '';
        anonymousSubmit = result.anonymousSubmit || false;
        submitButtonConfirmed = result.submitButtonConfirmed || false;
        submittedChannels = result.submittedChannels || [];
        bannerMode = result.bannerMode || 'ai';
        buildChannelLookup();
      });
  }

  // Retry state for button injection. Tracked so SPA navigation can cancel a
  // pending retry chain — without this, a fast page switch stacks retries
  // from the previous video onto the new one.
  let buttonRetryCount = 0;
  let buttonRetryTimer = null;
  const MAX_BUTTON_RETRIES = 10;

  function cancelButtonRetry() {
    if (buttonRetryTimer) {
      clearTimeout(buttonRetryTimer);
      buttonRetryTimer = null;
    }
    buttonRetryCount = 0;
  }

  // Inject submit button into YouTube player controls
  function injectSubmitButton(isRetry = false) {
    // Only show on video watch pages when community list is enabled
    if (!useCommunityList || !location.pathname.startsWith('/watch')) {
      cancelButtonRetry();
      return;
    }

    // Check if button already exists
    if (document.querySelector('.aiblock-submit-btn')) {
      cancelButtonRetry();
      return;
    }

    // Find the right controls container
    const rightControls = document.querySelector('.ytp-right-controls');
    if (!rightControls) {
      // Retry after a delay if controls aren't loaded yet
      if (buttonRetryCount < MAX_BUTTON_RETRIES) {
        buttonRetryCount++;
        log(`Player controls not found, retry ${buttonRetryCount}/${MAX_BUTTON_RETRIES}`);
        buttonRetryTimer = setTimeout(() => {
          buttonRetryTimer = null;
          injectSubmitButton(true);
        }, 500);
      }
      return;
    }

    cancelButtonRetry();

    // Create the button
    const button = document.createElement('button');
    button.className = 'ytp-button aiblock-submit-btn';
    button.setAttribute('aria-label', 'Report AI Channel');
    button.setAttribute('data-tooltip-text', 'Report AI Channel');

    // Flag icon SVG (outline style to match YouTube icons)
    button.innerHTML = `
      <svg height="24" width="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"></path>
        <line x1="4" y1="22" x2="4" y2="15"></line>
      </svg>
    `;

    // Add click handler
    button.addEventListener('click', handleSubmitButtonClick);

    // Add hover tooltip
    button.addEventListener('mouseenter', showHoverTooltip);
    button.addEventListener('mouseleave', hideHoverTooltip);

    // Insert at the beginning of the right controls (leftmost position in right section)
    if (rightControls.firstChild) {
      rightControls.insertBefore(button, rightControls.firstChild);
    } else {
      rightControls.appendChild(button);
    }

    log('Submit button injected into player controls');

    // Add styles if not already added
    if (!document.querySelector('#aiblock-player-styles')) {
      const style = document.createElement('style');
      style.id = 'aiblock-player-styles';
      style.textContent = `
        .aiblock-submit-btn {
          opacity: 0.9;
          transition: opacity 0.1s;
          width: 48px;
          height: 48px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          position: relative;
        }
        .aiblock-submit-btn svg {
          width: 24px;
          height: 24px;
        }
        .aiblock-submit-btn:hover {
          opacity: 1;
        }
        .aiblock-submit-btn.submitting {
          opacity: 0.5;
          pointer-events: none;
        }
        .aiblock-submit-btn.success svg {
          stroke: #4caf50;
        }
        .aiblock-submit-btn.error svg {
          stroke: #f44336;
        }
        .aiblock-submit-tooltip {
          position: fixed;
          background: rgba(28, 28, 28, 0.9);
          color: white;
          padding: 8px 12px;
          border-radius: 2px;
          font-size: 13px;
          font-weight: 500;
          white-space: nowrap;
          z-index: 99999;
          pointer-events: none;
        }
      `;
      document.head.appendChild(style);
    }
  }

  // Handle submit button click
  async function handleSubmitButtonClick(e) {
    e.preventDefault();
    e.stopPropagation();

    const button = e.currentTarget;

    // Prevent double-clicks
    if (button.classList.contains('submitting')) {
      return;
    }

    // Check if username is set (unless anonymous mode)
    if (!anonymousSubmit && !username) {
      showButtonTooltip(button, 'Set username in extension settings first');
      return;
    }

    // Get channel handle from the page
    const channelHandle = getChannelHandleFromWatchPage();
    if (!channelHandle) {
      showButtonTooltip(button, 'Could not detect channel');
      return;
    }

    // Show confirmation modal on first use, then submit on confirm.
    if (!submitButtonConfirmed) {
      showSubmitConfirmationModal(channelHandle, () => performSubmission(button, channelHandle));
      return;
    }

    // Already confirmed — submit directly.
    performSubmission(button, channelHandle);
  }

  // Show first-time confirmation modal. onConfirm runs when the user confirms
  // (after recording the "don't show again" preference). Button-agnostic so
  // both the player flag button and the keybind submit can reuse it.
  function showSubmitConfirmationModal(channelHandle, onConfirm) {
    // Remove any existing modal
    const existingModal = document.querySelector('.aiblock-confirm-overlay');
    if (existingModal) {
      existingModal.remove();
    }

    const displayHandle = ensureAt(channelHandle);

    const overlay = el('div', { class: 'aiblock-confirm-overlay' }, [
      el('div', { class: 'aiblock-confirm-modal' }, [
        el('h3', { text: 'Submit Channel to AiSList?' }),
        el('p', null, [
          'You are about to report ',
          el('span', { class: 'channel-name', text: displayHandle }),
          ' as an AI-generated content channel. This will be submitted to the community blocklist for review.'
        ]),
        el('label', { class: 'aiblock-confirm-checkbox' }, [
          el('input', { type: 'checkbox', id: 'aiblock-dont-show-again' }),
          " Don't show this again"
        ]),
        el('div', { class: 'aiblock-confirm-buttons' }, [
          el('button', { class: 'aiblock-confirm-btn cancel', text: 'Cancel' }),
          el('button', { class: 'aiblock-confirm-btn submit', text: 'Submit' })
        ])
      ])
    ]);

    document.body.appendChild(overlay);

    // Handle cancel
    overlay.querySelector('.aiblock-confirm-btn.cancel').addEventListener('click', () => {
      overlay.remove();
    });

    // Handle click outside modal
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        overlay.remove();
      }
    });

    // Handle submit
    overlay.querySelector('.aiblock-confirm-btn.submit').addEventListener('click', () => {
      const dontShowAgain = overlay.querySelector('#aiblock-dont-show-again').checked;

      if (dontShowAgain) {
        submitButtonConfirmed = true;
        browser.storage.local.set({ submitButtonConfirmed: true });
      }

      overlay.remove();
      if (typeof onConfirm === 'function') onConfirm();
    });

    // Handle escape key
    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        overlay.remove();
        document.removeEventListener('keydown', handleEscape);
      }
    };
    document.addEventListener('keydown', handleEscape);
  }

  // Perform the actual submission
  async function performSubmission(button, channelHandle) {
    // Normalize channel handle (lowercase, without @) for duplicate checking
    const normalizedHandle = stripAt(channelHandle).toLowerCase();

    // Check if channel was already submitted (exact match, not substring) or
    // a submission for it is already in flight from another trigger.
    if (submittedChannels.includes(normalizedHandle) || inFlightSubmissions.has(normalizedHandle)) {
      showButtonTooltip(button, 'Channel already submitted');
      return;
    }

    // Get current video URL
    const videoUrl = location.href;

    // Mark in-flight immediately (before any await) so a concurrent trigger
    // for the same channel is rejected by the guard above.
    inFlightSubmissions.add(normalizedHandle);

    // Show submitting state
    button.classList.add('submitting');
    showButtonTooltip(button, 'Submitting...');

    try {
      // Route through background script
      const response = await browser.runtime.sendMessage({
        action: 'submitToApi',
        channelHandle: ensureAt(channelHandle),
        videoUrl: videoUrl,
        username: anonymousSubmit ? 'Anonymous' : username
      });

      if (response.ok) {
        button.classList.remove('submitting');
        button.classList.add('success');
        showButtonTooltip(button, response.message || 'Submitted!');

        // Track submitted channel (keep last 150 unique entries)
        submittedChannels = submittedChannels.filter(h => h !== normalizedHandle);
        submittedChannels.push(normalizedHandle);
        if (submittedChannels.length > 150) {
          submittedChannels = submittedChannels.slice(-150);
        }
        browser.storage.local.set({ submittedChannels });

        // Reset after 3 seconds
        setTimeout(() => {
          button.classList.remove('success');
        }, 3000);
      } else {
        button.classList.remove('submitting');
        button.classList.add('error');
        let errorMessage = response.message || 'Submission failed';
        if (response.status === 502) {
          errorMessage = 'API Offline. Try again later';
        } else if (response.status === 429) {
          errorMessage = 'Rate limit reached. Try again later';
        } else if (response.status === 403) {
          errorMessage = 'Banned from submitting';
        }
        showButtonTooltip(button, errorMessage);

        // Reset after 3 seconds
        setTimeout(() => {
          button.classList.remove('error');
        }, 3000);
      }
    } catch (error) {
      button.classList.remove('submitting');
      button.classList.add('error');
      showButtonTooltip(button, 'Network error');

      // Reset after 3 seconds
      setTimeout(() => {
        button.classList.remove('error');
      }, 3000);
    } finally {
      // Allow re-submission attempts once this one resolves (success records
      // the channel permanently; failure should let the user retry).
      inFlightSubmissions.delete(normalizedHandle);
    }
  }

  // Show tooltip on button (for status messages)
  function showButtonTooltip(button, message) {
    // Remove existing tooltip
    hideHoverTooltip();

    // Create tooltip
    const tooltip = document.createElement('div');
    tooltip.className = 'aiblock-submit-tooltip';
    tooltip.textContent = message;

    // Position using fixed positioning above the button
    const rect = button.getBoundingClientRect();
    tooltip.style.left = rect.left + rect.width / 2 + 'px';
    tooltip.style.top = rect.top - 10 + 'px';
    tooltip.style.transform = 'translate(-50%, -100%)';

    document.body.appendChild(tooltip);

    // Remove after 3 seconds
    setTimeout(() => {
      tooltip.remove();
    }, 3000);
  }

  // Show hover tooltip
  function showHoverTooltip(e) {
    const button = e.currentTarget;

    // Don't show if there's already a status tooltip
    if (document.querySelector('.aiblock-submit-tooltip')) {
      return;
    }

    const tooltip = document.createElement('div');
    tooltip.className = 'aiblock-submit-tooltip aiblock-hover-tooltip';
    tooltip.textContent = 'Report AI Channel';

    // Position using fixed positioning above the button
    const rect = button.getBoundingClientRect();
    tooltip.style.left = rect.left + rect.width / 2 + 'px';
    tooltip.style.top = rect.top - 10 + 'px';
    tooltip.style.transform = 'translate(-50%, -100%)';

    document.body.appendChild(tooltip);
  }

  // Hide hover tooltip
  function hideHoverTooltip() {
    const tooltip = document.querySelector('.aiblock-hover-tooltip');
    if (tooltip) {
      tooltip.remove();
    }
  }

  // Get channel handle from watch page
  function getChannelHandleFromWatchPage() {
    // Try multiple selectors for channel link
    const selectors = [
      'ytd-video-owner-renderer a.yt-simple-endpoint[href*="/@"]',
      'ytd-channel-name a[href*="/@"]',
      '#owner a[href*="/@"]',
      '#channel-name a[href*="/@"]',
      'a.ytd-channel-name[href*="/@"]'
    ];

    for (const selector of selectors) {
      const link = document.querySelector(selector);
      if (link) {
        const href = link.getAttribute('href');
        const match = href.match(/\/@([^\/\?]+)/);
        if (match) {
          return '@' + match[1];
        }
      }
    }

    // Fallback: try to find from page data
    const channelLink = document.querySelector('a[href*="/@"]');
    if (channelLink) {
      const href = channelLink.getAttribute('href');
      const match = href.match(/\/@([^\/\?]+)/);
      if (match) {
        return '@' + match[1];
      }
    }

    return null;
  }

  // Remove submit button (for cleanup)
  function removeSubmitButton() {
    const button = document.querySelector('.aiblock-submit-btn');
    if (button) {
      button.remove();
    }
  }


  // Get channel ID from video element
  function getChannelId(element) {
    // Try to find any link containing channel reference
    const links = element.querySelectorAll('a[href*="/@"], a[href*="/channel/"]');

    // For playlists, we need to find the channel link (not the playlist link)
    // Channel links come before or alongside playlist info
    for (const link of links) {
      const href = link.getAttribute('href');
      // Skip playlist links, watch links, and shorts video links - we want the channel
      if (href && !href.includes('/playlist') && !href.includes('/watch') && !href.includes('/shorts/')) {
        const channelRef = matchChannelUrl(href);
        if (channelRef) return channelRef;
      }
    }

    // For Shorts, try to find channel from nested lockup or metadata
    const lockup = element.querySelector('ytd-shorts-lockup-view-model-v2, ytd-reel-item-renderer, ytm-shorts-lockup-view-model-v2');
    if (lockup) {
      const lockupLinks = lockup.querySelectorAll('a[href*="/@"], a[href*="/channel/"]');
      for (const link of lockupLinks) {
        const href = link.getAttribute('href');
        if (href && !href.includes('/shorts/')) {
          const channelRef = matchChannelUrl(href);
          if (channelRef) return channelRef;
        }
      }
    }

    return null;
  }

  // Block/hide a video element
  // source can be: 'manual-blacklist', 'manual-warnlist', 'community-blacklist', 'community-warnlist'
  function blockVideo(element, channelName, reason, isWarnlist = false, isCompact = false, source = '') {
    log(`blockVideo called for channel: ${channelName}, reason: ${reason}, mode: ${blockMode}`);

    // Determine behavior based on mode and list type
    // Hide mode: Hide blocklist items, warn warnlist items
    // Warn mode: Warn everything
    const shouldShowOverlay = blockMode === 'warn' || isWarnlist;

    // Check if this is a Shorts element
    const isShort = element.tagName.toLowerCase().includes('shorts') ||
                    element.tagName.toLowerCase().includes('reel') ||
                    element.classList.contains('shortsLockupViewModelHost');
    const contentType = isShort ? 'Short' : 'Video';

    // Determine title based on source
    let title;
    if (source === 'community-blacklist' || source === 'manual-blacklist') {
      title = `🚫 AI ${contentType} Blocked`;
    } else if (source === 'community-warnlist' || source === 'manual-warnlist') {
      title = `⚠️ Warning - Potential AI ${contentType}`;
    } else {
      title = `⚠️ Potential AI ${contentType} ${isWarnlist ? 'Warned' : 'Blocked'}`;
    }

    if (!shouldShowOverlay && blockMode === 'hide') {
      // Hide blocklist items in hide mode
      log(`Hiding element for channel: ${channelName}`);
      element.style.display = 'none';
      // Increment counter
      bumpVideosHidden();
    } else {
      // Guard against duplicate overlays from nested video elements
      // (e.g. ytd-rich-item-renderer wrapping ytd-video-renderer).
      // Descendant check: inner already has overlay → skip outer.
      // Ancestor check: outer already has overlay → skip inner.
      if (element.querySelector('.ai-blocker-warning') ||
          element.closest('[data-ai-has-overlay]')) {
        return;
      }
      // Show warning overlay
      log(`Adding warning overlay for channel: ${channelName}`);
      const warning = el('div', {
        class: isCompact ? 'ai-blocker-warning compact' : 'ai-blocker-warning'
      }, [
        el('div', { class: 'ai-blocker-warning-content' }, [
          el('strong', { text: title }),
          el('p', { text: `Channel: ${channelName}` }),
          el('p', { text: `Reason: ${reason}` }),
          el('button', { class: 'ai-blocker-show-btn', text: 'Show Anyway' })
        ])
      ]);

      // aib-overlay-host: local stacking context contains the overlay's
      // z-index under YouTube's fixed navbar. aib-clipped clips to rounded
      // corners matching the tile shape.
      element.classList.add('aib-overlay-host', 'aib-clipped');
      element.setAttribute('data-ai-has-overlay', '');
      element.appendChild(warning);

      // Block clicks on the overlay from reaching the underlying element.
      // Matters for anchor containers like .ytp-videowall-still (endscreen),
      // where clicks would otherwise navigate to the blocked video.
      warning.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
      });

      warning.querySelector('.ai-blocker-show-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        warning.remove();
      });

      // Increment counter for warned videos too
      bumpVideosHidden();
    }
  }

  // Mark channel page with warning banner. Selectors span legacy and current
  // YouTube header layouts — newer A/B rollouts use yt-page-header-view-model
  // / ytd-page-header-renderer, older cohorts still see c4-tabbed-header.
  function markChannelPage(channelName, reason) {
    const header = document.querySelector('#channel-header')
                || document.querySelector('ytd-c4-tabbed-header-renderer')
                || document.querySelector('ytd-page-header-renderer')
                || document.querySelector('yt-page-header-view-model');

    if (header && !header.querySelector('.ai-blocker-channel-warning')) {
      const warning = el('div', { class: 'ai-blocker-channel-warning' }, [
        el('div', {
          class: 'ai-blocker-banner',
          text: `⚠️ This channel is blocked: ${reason}`
        })
      ]);

      header.insertBefore(warning, header.firstChild);
    }
  }

  // "How this was made" disclosure header — the wrapper class is shared by
  // several creator declarations (Made with AI, Altered/synthetic, Auto-dubbed,
  // ...). We categorize by header text:
  //   - "ai"        → Made-with-AI declaration   → same banner as the AI badge
  //   - "synthetic" → Altered/synthetic content  → different banner message
  //   - anything else (e.g. auto-dubbed) → ignored
  // Keyword lists are lowercased substrings. CJK substrings work as-is.
  // The Auto-dub disclosure ("Automatisch synchronisiert", "Auto-dubbed", ...)
  // intentionally shares NO keywords with either list.
  const DISCLOSURE_AI_KEYWORDS = [
    // English / pan-language "AI" phrases
    'made with ai', 'with ai',
    // German
    'mit ki',
    // Spanish
    'con ia',
    // French
    'avec ia', 'avec une ia', 'avec l\'IA',
    // Italian
    'con ia',
    // Portuguese
    'com ia',
    // Polish
    'za pomocą ai', 'z ai', 'pomocy ai',
    // Dutch
    'met ai',
    // Turkish
    'yapay zeka',
    // Russian
    'с помощью ии', 'при помощи ии',
    // Indonesian
    'dengan ai',
    // CJK
    'aiで', 'ai를', 'ai 사용', '使用ai', '使用人工智能', 'ai로',
  ];

  const DISCLOSURE_SYNTHETIC_KEYWORDS = [
    // English
    'altered', 'synthetic', 'generated',
    // German
    'verändert', 'synthetisch',
    // Spanish
    'alterado', 'alterada', 'sintétic', 'generado',
    // French
    'modifié', 'altéré', 'synthétique', 'généré',
    // Italian
    'alterato', 'alterata', 'sintetic', 'generato',
    // Portuguese
    'sintétic', 'gerado',
    // Polish
    'zmienion', 'syntetyczn', 'wygenerowan',
    // Dutch
    'gewijzigd', 'synthetisch', 'gegenereerd',
    // Turkish
    'değiştirilmiş', 'sentetik', 'üretilmiş',
    // Russian
    'изменён', 'изменен', 'синтетическ', 'сгенерирован',
    // Indonesian
    'sintetis',
    // CJK
    '合成', '生成', '합성', '생성',
  ];

  // Returns 'ai' | 'synthetic' | null. AI takes precedence if both appear.
  function detectDisclosureKind() {
    const headers = document.querySelectorAll('.ytwHowThisWasMadeSectionViewModelBodyHeader');
    if (headers.length === 0) return null;
    let foundSynthetic = false;
    for (const h of headers) {
      const text = h.textContent.toLowerCase();
      for (const k of DISCLOSURE_AI_KEYWORDS) {
        if (text.includes(k)) return 'ai';
      }
      for (const k of DISCLOSURE_SYNTHETIC_KEYWORDS) {
        if (text.includes(k)) { foundSynthetic = true; break; }
      }
    }
    return foundSynthetic ? 'synthetic' : null;
  }

  // Inject the YouTube-AI-flag banner on watch / shorts pages where YouTube
  // has labelled the video as AI-generated. The banner offers two actions:
  // add to personal blocklist, or submit to the community list.
  async function processYtAiFlag() {
    if (blockMode === 'disabled' || isNavigating) return;

    // Banner disabled entirely by the user — drop any stale banner and bail.
    if (bannerMode === 'off') {
      const stale = document.querySelector('.ai-blocker-yt-flag-warning');
      if (stale) stale.remove();
      return;
    }

    const onWatch = location.pathname.startsWith('/watch');
    const onShorts = location.pathname.startsWith('/shorts/');
    if (!onWatch && !onShorts) return;

    // Decide which kind of banner (if any) to show, based solely on the
    // "How this was made" disclosure header text:
    //   - 'ai':        "Made with AI" disclosure
    //   - 'synthetic': "Altered/synthetic content" disclosure
    // The standalone AI badge-shape on YouTube isn't unique enough to detect
    // reliably (it's the generic info-icon component, reused for many tiny
    // labels), so we don't use it — the structured disclosure is the truth.
    // 'synthetic' is only shown when bannerMode is 'all'.
    let kind = detectDisclosureKind();
    if (kind === 'synthetic' && bannerMode !== 'all') kind = null;
    if (!kind) {
      // No reason to show a banner. If a stale one is hanging around from
      // a previous video that cleanup missed, drop it now.
      const stale = document.querySelector('.ai-blocker-yt-flag-warning');
      if (stale) stale.remove();
      return;
    }

    // For Shorts, resolve the active reel so we can anchor the banner inside
    // it (the banner uses position: absolute relative to the reel container).
    let activeReel = null;
    if (onShorts) {
      const reels = document.querySelectorAll('ytd-reel-video-renderer');
      for (const reel of reels) {
        const link = reel.querySelector('a[href*="/shorts/"]');
        if (link && link.href === location.href) { activeReel = reel; break; }
      }
      if (!activeReel) activeReel = document.querySelector('ytd-reel-video-renderer[is-active]')
                                 || document.querySelector('ytd-reel-video-renderer');
      if (!activeReel) return; // wait for next tick
    }

    // Watch page DOM has the channel link; Shorts page DOM exposes other
    // shorts in the feed too, so getChannelHandleFromWatchPage would pick
    // the wrong one. For shorts, fetch the active video's HTML (cached).
    const urlAtStart = location.href;
    let channelId;
    if (onShorts) {
      const info = await fetchChannelFromShortsUrl(urlAtStart);
      // Bail if user scrolled to a different short while we were fetching —
      // next reprocess tick will handle the new one.
      if (location.href !== urlAtStart) return;
      channelId = info?.channelId || null;
    } else {
      channelId = getChannelHandleFromWatchPage();
    }
    if (!channelId) return; // wait for next tick — channel info not ready

    const normalized = normalizeHandle(channelId);

    // Skip if user has already acted on this channel.
    if (blacklist.has(normalized) || warnlist.has(normalized)) {
      const stale = document.querySelector('.ai-blocker-yt-flag-warning');
      if (stale) stale.remove();
      return;
    }

    // Dedup: only skip re-render when URL, channel handle, AND banner kind
    // still match. Anything else (new video, channel detected late after a
    // shorts fetch, etc.) forces a clean rebuild.
    const existing = document.querySelector('.ai-blocker-yt-flag-warning');
    if (existing
        && existing.dataset.videoUrl === location.href
        && existing.dataset.kind === kind
        && existing.dataset.channel === normalized) {
      return;
    }
    if (existing) existing.remove();

    // If the channel is already on the active community list, the buttons
    // would be redundant — the channel is already known to the community
    // and our normal blocking already applies. Show the banner without
    // actions so the user still sees YouTube's flag.
    const entry = lookupChannel(channelId);
    const onActiveCommunityList = !!(entry && useCommunityList
      && (entry.source === 'community-blacklist' || entry.source === 'community-warnlist'));

    const alreadySubmitted = submittedChannels.includes(normalized);

    const headline = kind === 'ai'
      ? `⚠️ AI-flagged by YouTube — ${ensureAt(channelId)}`
      : `⚠️ Altered/synthetic content disclosed — ${ensureAt(channelId)}`;

    const bannerContent = [el('span', { text: headline })];

    let blockBtn, submitBtn;
    if (!onActiveCommunityList) {
      blockBtn = el('button', {
        class: 'ai-blocker-yt-flag-btn',
        text: 'Add to my blocklist'
      });
      submitBtn = el('button', {
        class: 'ai-blocker-yt-flag-btn',
        text: alreadySubmitted ? 'Already submitted' : 'Submit to community'
      });
      if (alreadySubmitted) submitBtn.setAttribute('disabled', '');

      // For the synthetic-content banner, prompt the user to evaluate
      // whether the video is actually AI slop. Not shown for the AI banner
      // (where the AI nature is already confirmed by YouTube).
      const actionsChildren = [];
      if (kind === 'synthetic') {
        actionsChildren.push(el('span', {
          class: 'ai-blocker-yt-flag-prompt',
          text: 'Is AI Slop?'
        }));
      }
      actionsChildren.push(blockBtn, submitBtn);
      bannerContent.push(el('div', { class: 'ai-blocker-yt-flag-actions' }, actionsChildren));
    }

    const banner = el('div', {
      class: onShorts ? 'ai-blocker-yt-flag-warning shorts' : 'ai-blocker-yt-flag-warning'
    }, [
      el('div', { class: 'ai-blocker-yt-flag-banner' }, bannerContent)
    ]);
    banner.dataset.videoUrl = location.href;
    banner.dataset.kind = kind;
    banner.dataset.channel = normalized;

    if (blockBtn) {
      blockBtn.addEventListener('click', () => {
        addChannelToBlacklist(normalized);
        blockBtn.textContent = 'Added';
        blockBtn.setAttribute('disabled', '');
        // The popup refreshes via storage.onChanged when blacklist is written.
      });
    }

    if (submitBtn) {
      submitBtn.addEventListener('click', async () => {
        if (submitBtn.hasAttribute('disabled')) return;
        // Reject if already submitted or a submission is in flight (e.g. the
        // player flag button is mid-request for the same channel).
        if (submittedChannels.includes(normalized) || inFlightSubmissions.has(normalized)) {
          submitBtn.textContent = 'Already submitted';
          submitBtn.setAttribute('disabled', '');
          return;
        }
        submitBtn.textContent = 'Submitting…';
        submitBtn.setAttribute('disabled', '');
        inFlightSubmissions.add(normalized);
        try {
          const response = await browser.runtime.sendMessage({
            action: 'submitToApi',
            channelHandle: ensureAt(channelId),
            videoUrl: location.href,
            username: anonymousSubmit ? 'Anonymous' : username
          });
          if (response && response.ok) {
            submitBtn.textContent = 'Submitted';
            submittedChannels = submittedChannels.filter(h => h !== normalized);
            submittedChannels.push(normalized);
            if (submittedChannels.length > 150) submittedChannels = submittedChannels.slice(-150);
            browser.storage.local.set({ submittedChannels });
          } else {
            submitBtn.textContent = response?.status === 502 ? 'API offline' : 'Submit failed';
            submitBtn.removeAttribute('disabled');
          }
        } catch (e) {
          submitBtn.textContent = 'Network error';
          submitBtn.removeAttribute('disabled');
        } finally {
          inFlightSubmissions.delete(normalized);
        }
      });
    }

    if (onShorts) {
      // Anchor to the active reel (resolved earlier) so the banner sits above
      // the channel info and respects the player's actual position.
      if (getComputedStyle(activeReel).position === 'static') {
        activeReel.style.position = 'relative';
      }
      activeReel.appendChild(banner);
    } else {
      // Insert above the video metadata, below the player.
      const target = document.querySelector('ytd-watch-metadata')
                  || document.querySelector('#above-the-fold')
                  || document.querySelector('#primary-inner');
      if (target) target.insertBefore(banner, target.firstChild);
      else document.body.appendChild(banner);
    }
  }

  // Get channel ID from channel page
  function getChannelIdFromPage() {
    // FIRST: Try to get from current URL (preferred, gives us @handle)
    const url = window.location.href;
    const urlMatch = url.match(/\/@([^\/\?]+)|\/channel\/([^\/\?]+)/);
    if (urlMatch) {
      const raw = urlMatch[1] || urlMatch[2];
      try { var id = decodeURIComponent(raw); } catch (e) { var id = raw; }
      return urlMatch[1] ? `@${id}` : id;
    }

    // FALLBACK: Try canonical link (may give channel ID instead of handle)
    const canonical = document.querySelector('link[rel="canonical"]');
    if (canonical) {
      const match = canonical.href.match(/\/@([^\/\?]+)|\/channel\/([^\/\?]+)/);
      if (match) {
        const raw = match[1] || match[2];
        try { var id = decodeURIComponent(raw); } catch (e) { var id = raw; }
        return match[1] ? `@${id}` : id;
      }
    }

    return null;
  }

  // Canonical storage form for a channel handle: @-stripped, lowercased.
  // Matches the form used by sync.js pruning, submittedChannels, and
  // checkSubmitGuard, so a channel is stored identically no matter which
  // surface added it (banner, keybind, context menu, popup, auto-blocklist).
  function canonicalHandle(id) {
    return String(id || '').replace(/^@/, '').toLowerCase();
  }

  // Add channel to blacklist
  function addChannelToBlacklist(channelId) {
    const handle = canonicalHandle(channelId);
    blacklist.add(handle);
    whitelist.delete(handle);
    warnlist.delete(handle);
    buildChannelLookup();
    browser.storage.local.set({
      blacklist: Array.from(blacklist),
      whitelist: Array.from(whitelist),
      warnlist: Array.from(warnlist)
    });
  }

  // Add channel to whitelist
  function addChannelToWhitelist(channelId) {
    const handle = canonicalHandle(channelId);
    whitelist.add(handle);
    blacklist.delete(handle);
    warnlist.delete(handle);
    buildChannelLookup();
    browser.storage.local.set({
      whitelist: Array.from(whitelist),
      blacklist: Array.from(blacklist),
      warnlist: Array.from(warnlist)
    });
  }

  // Add channel to warnlist
  function addChannelToWarnlist(channelId) {
    const handle = canonicalHandle(channelId);
    warnlist.add(handle);
    blacklist.delete(handle);
    whitelist.delete(handle);
    buildChannelLookup();
    browser.storage.local.set({
      warnlist: Array.from(warnlist),
      blacklist: Array.from(blacklist),
      whitelist: Array.from(whitelist)
    });
  }

  // Process sidebar videos (yt-lockup-view-model) that require fetching channel info
  async function processSidebarVideos() {
    // Skip processing if extension is disabled or currently navigating
    if (blockMode === 'disabled' || isNavigating) {
      return;
    }

    // On channel pages the lockup tiles all belong to the page's channel, which
    // processChannelPageVideos resolves instantly from the URL. Skip here so we
    // don't do a slow per-tile page fetch for content we can attribute for free.
    const path = location.pathname;
    if (path.startsWith('/@') || path.includes('/channel/')
        || path.startsWith('/c/') || path.startsWith('/user/')) {
      return;
    }

    const sidebarVideos = document.querySelectorAll('yt-lockup-view-model');

    for (const video of sidebarVideos) {
      if (video.hasAttribute('data-ai-sidebar-fetched')) continue;
      video.setAttribute('data-ai-sidebar-fetched', 'true');

      // Find the video URL
      const link = video.querySelector('a[href*="/watch?v="]');
      if (!link) continue;

      const videoUrl = link.href;

      const { channelName, channelId } = await fetchChannelFromShortsUrl(videoUrl);
      if (!channelName || !channelId) continue;

      const entry = lookupChannel(channelId);
      if (!entry || entry.source === 'whitelist') continue;
      if (!useCommunityList && entry.source.startsWith('community-')) continue;

      blockVideo(video, channelId || channelName, entry.reason, entry.isWarnlist, true, entry.source);
    }
  }

  // Process YouTube player endscreen videowall (post-video suggestions shown
  // when a video finishes playing). Covers both the legacy .ytp-videowall-still
  // anchors and the newer .ytp-modern-videowall-still format (2025+).
  async function processEndscreenVideos() {
    // Skip processing if extension is disabled or currently navigating
    if (blockMode === 'disabled' || isNavigating) {
      return;
    }

    const stills = document.querySelectorAll('.ytp-videowall-still, .ytp-modern-videowall-still');

    for (const still of stills) {
      // URL-keyed cache so stale overlays are cleared when YouTube swaps
      // a different suggestion into the same slot
      const currentHref = still.href;
      if (!currentHref || !currentHref.includes('/watch?v=')) continue;

      const lastCheckedHref = still.getAttribute('data-ai-endscreen-url');
      if (lastCheckedHref === currentHref) continue;

      if (lastCheckedHref !== null) {
        // URL changed: clean up stale overlay before re-evaluating
        still.querySelector('.ai-blocker-warning')?.remove();
        still.removeAttribute('data-ai-has-overlay');
        still.style.display = '';
      }
      still.setAttribute('data-ai-endscreen-url', currentHref);

      // Reuse fetchChannelFromShortsUrl — its name is historical, it works
      // for any YouTube video URL and shares the same cache
      const { channelName, channelId } = await fetchChannelFromShortsUrl(currentHref);
      if (!channelName || !channelId) continue;

      const entry = lookupChannel(channelId);
      if (!entry || entry.source === 'whitelist') continue;
      if (!useCommunityList && entry.source.startsWith('community-')) continue;

      blockVideo(still, channelId || channelName, entry.reason, entry.isWarnlist, true, entry.source);
    }
  }

  // Process YTM Shorts that require fetching channel info
  async function processYtmShorts() {
    // Skip processing if extension is disabled or currently navigating
    if (blockMode === 'disabled' || isNavigating) {
      return;
    }

    const ytmShortsSelectors = [
      'ytm-shorts-lockup-view-model',
      'ytm-shorts-lockup-view-model-v2'
    ];

    for (const selector of ytmShortsSelectors) {
      const shorts = document.querySelectorAll(selector);

      for (const short of shorts) {
        if (short.hasAttribute('data-ai-shorts-fetched')) continue;
        short.setAttribute('data-ai-shorts-fetched', 'true');

        // Find the Shorts URL
        const link = short.querySelector('a[href*="/shorts/"]');
        if (!link) continue;

        const shortsUrl = link.href;

        // Fetch channel info
        const { channelName, channelId } = await fetchChannelFromShortsUrl(shortsUrl);
        if (!channelName || !channelId) continue;

        const entry = lookupChannel(channelId);
        if (!entry || entry.source === 'whitelist') continue;
        if (!useCommunityList && entry.source.startsWith('community-')) continue;

        blockVideo(short, channelId || channelName, entry.reason, entry.isWarnlist, false, entry.source);
      }
    }
  }

  // Combined selector — single querySelectorAll instead of 7 separate calls.
  // NOTE: ytd-reel-video-renderer (the fullscreen Shorts player) is intentionally
  // excluded — it's handled by processShortsFeed with its own two-button overlay.
  // Listing it here caused a second single-button overlay to stack on top of the
  // Shorts-feed overlay.
  const VIDEO_SELECTOR = [
    'ytd-video-renderer',           // Search results
    'ytd-grid-video-renderer',      // Grid view
    'ytd-compact-video-renderer',   // Sidebar
    'ytd-rich-item-renderer',       // Home page rich grid
    'ytd-reel-item-renderer',       // Shorts in feed/grid
    'ytd-shorts-lockup-view-model'  // Shorts in search/home
  ].join(',');

  // Process video elements
  function processVideos() {
    if (blockMode === 'disabled' || isNavigating) return;

    const videos = document.querySelectorAll(VIDEO_SELECTOR);

    for (const video of videos) {
      // Fast-path: try YouTube's internal .data property first (instant,
      // no DOM traversal). Fall back to DOM selectors only if needed.
      let channelId = extractChannelFromDataProperty(video);
      if (channelId) channelId = `@${channelId}`;
      if (!channelId) channelId = getChannelId(video);

      // Need at least a channel ID to proceed. If the DOM hasn't loaded
      // channel info yet, skip — MutationObserver will retry later.
      if (!channelId) continue;

      // Skip if already checked for this exact channel.
      // If YouTube recycled the element for a different channel, clean up.
      const checkedFor = video.getAttribute('data-ai-checked');
      if (checkedFor !== null) {
        if (checkedFor === channelId) continue;
        video.querySelector('.ai-blocker-warning')?.remove();
        video.removeAttribute('data-ai-has-overlay');
        video.style.display = '';
      }
      video.setAttribute('data-ai-checked', channelId);

      // Single map lookup replaces 5× Set.has() with variant expansion
      const entry = lookupChannel(channelId);
      if (!entry) continue;
      if (entry.source === 'whitelist') continue;
      if (!useCommunityList && entry.source.startsWith('community-')) continue;

      blockVideo(video, channelId, entry.reason, entry.isWarnlist, false, entry.source);
    }

    processChannelResults();
  }

  // Process channel elements in search results
  function processChannelResults() {
    // Skip processing if extension is disabled or currently navigating
    if (blockMode === 'disabled' || isNavigating) {
      return;
    }

    // Combined selector — one querySelectorAll covers all known channel-card
    // element types, including newer view-model variants YouTube has rolled out.
    const channelSelector = [
      'ytd-channel-renderer',             // Classic channel result in search
      'ytd-grid-channel-renderer',        // Grid view
      'ytd-universal-channel-renderer',   // Newer unified channel card (seen in 2025)
      'channel-renderer-view-model',      // View-model channel card
      'yt-lockup-view-model[lockup-view-model-variant*="CHANNEL"]',
      'yt-lockup-view-model[lockup-view-model-variant*="channel"]'
    ].join(',');

    const channels = document.querySelectorAll(channelSelector);

    channels.forEach(channel => {
      if (channel.hasAttribute('data-ai-channel-checked')) return;

      // Try the handle selectors in priority order. Reusing HANDLE_SELECTORS
      // keeps this consistent with video-card detection — narrow 'a#main-link'
      // only matches the classic ytd-channel-renderer and misses newer variants.
      let channelLink = null;
      for (const sel of HANDLE_SELECTORS) {
        channelLink = channel.querySelector(sel);
        if (channelLink) break;
      }

      // Link not hydrated yet (common on first paint after search). Leave
      // the element unmarked so the next MutationObserver pass retries —
      // otherwise the card stays un-overlaid until the user reloads.
      if (!channelLink) return;

      channel.setAttribute('data-ai-channel-checked', 'true');

      const href = channelLink.getAttribute('href') || channelLink.href;
      const channelId = matchChannelUrl(href);
      if (!channelId) return;

      const entry = lookupChannel(channelId);
      if (!entry || entry.source === 'whitelist') return;
      if (!useCommunityList && entry.source.startsWith('community-')) return;

      blockChannelResult(channel, channelId, entry.reason, entry.isWarnlist, entry.source);
    });
  }

  // Block/hide a channel result element
  // source can be: 'manual-blacklist', 'manual-warnlist', 'community-blacklist', 'community-warnlist'
  function blockChannelResult(element, channelName, reason, isWarnlist = false, source = '') {
    log(`blockChannelResult called for channel: ${channelName}, reason: ${reason}`);

    // First, remove any existing overlay from this element
    const existingOverlay = element.querySelector('.ai-blocker-channel-overlay');
    if (existingOverlay) {
      log(`Removing existing channel overlay from element before adding new one`);
      existingOverlay.remove();
    }

    // Determine behavior based on mode and list type
    // Hide mode: Hide blocklist items, warn warnlist items
    // Warn mode: Warn everything
    const shouldShowOverlay = blockMode === 'warn' || isWarnlist;

    // Determine title based on source
    let title;
    if (source === 'community-blacklist' || source === 'manual-blacklist') {
      title = '🚫 AI Channel Blocked';
    } else if (source === 'community-warnlist' || source === 'manual-warnlist') {
      title = '⚠️ Warning - Potential AI Channel';
    } else {
      title = `🚫 AI Channel ${isWarnlist ? 'Warned' : 'Blocked'}`;
    }

    if (!shouldShowOverlay && blockMode === 'hide') {
      // Hide blocklist items in hide mode
      log(`Hiding channel result for: ${channelName}`);
      element.style.display = 'none';
      // Increment counter
      bumpVideosHidden();
    } else {
      // Show warning overlay
      log(`Adding channel overlay for: ${channelName}`);
      const warning = el('div', { class: 'ai-blocker-channel-overlay' }, [
        el('div', { class: 'ai-blocker-warning-content' }, [
          el('strong', { text: title }),
          el('p', { text: `Channel: ${channelName}` }),
          el('p', { text: `Reason: ${reason}` }),
          el('button', { class: 'ai-blocker-show-btn', text: 'Show Anyway' })
        ])
      ]);

      // Local stacking context — contains the overlay z-index under the navbar.
      element.classList.add('aib-overlay-host');
      element.appendChild(warning);

      warning.querySelector('.ai-blocker-show-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        warning.remove();
      });

      // Increment counter for warned channels too
      bumpVideosHidden();
    }
  }

  // Process videos on a channel page
  function processChannelPageVideos() {
    // Skip processing if extension is disabled or currently navigating
    if (blockMode === 'disabled' || isNavigating) {
      return;
    }

    const url = window.location.href;
    if (!url.includes('/@') && !url.includes('/channel/')) return;

    // Get the channel ID from the page
    const channelId = getChannelIdFromPage();

    if (!channelId) {
      return;
    }

    // Use the channel handle as display name — DOM selectors for the
    // channel name are fragile and can pick up collab names from video cards.
    const channelName = channelId;

    // Single lookup replaces 5× Set.has() with variant expansion
    const entry = lookupChannel(channelId);
    if (!entry || entry.source === 'whitelist') return;
    if (!useCommunityList && entry.source.startsWith('community-')) return;

    const blockReason = entry.reason;
    const isWarnlist = entry.isWarnlist;
    const source = entry.source;

    {
      // Hide mode for a blacklisted channel: hide the grid CONTAINER rather
      // than each tile. Per-tile hiding empties the viewport, which triggers
      // YouTube's infinite scroll — causing an endless load-then-hide loop on
      // channels with thousands of videos. Hiding the container once fully
      // stops the scroll trigger at the source. The header banner still shows
      // so the user sees why the grid is empty.
      // Warnlist entries still need per-tile overlays (user wants to see what
      // was warned), so they fall through to the per-tile path below.
      if (blockMode === 'hide' && !isWarnlist) {
        const containerSelectors = [
          'ytd-rich-grid-renderer',     // Home / Videos tab on current layout
          'ytd-section-list-renderer',  // Older channel tab layouts
          'ytd-shelf-renderer',         // Shelves (Popular uploads, etc.)
          'ytd-grid-renderer'           // Grid-only channel tabs
        ];
        const tileSelectors = [
          'ytd-grid-video-renderer',
          'ytd-rich-item-renderer',
          'ytd-video-renderer',
          'ytd-playlist-video-renderer',
          'ytd-reel-item-renderer',
          'ytd-shorts-lockup-view-model',
          'ytm-shorts-lockup-view-model',
          'ytm-shorts-lockup-view-model-v2',
          'yt-lockup-view-model'        // Overview-tab shelf items (Releases, For you)
        ].join(',');

        let totalHidden = 0;
        containerSelectors.forEach(selector => {
          document.querySelectorAll(selector).forEach(container => {
            if (container.getAttribute('data-ai-checked-channel') === channelId) return;
            // Count tiles for stats before we hide the container
            totalHidden += container.querySelectorAll(tileSelectors).length;
            container.setAttribute('data-ai-checked-channel', channelId);
            container.style.display = 'none';
          });
        });

        bumpVideosHidden(totalHidden);

        markChannelPage(channelName, blockReason);
        return;
      }

      // Warn mode (or warnlist in hide mode): iterate tiles and show overlays
      // Combined selector — single querySelectorAll instead of 8 separate calls
      const channelVideoSelector = [
        'ytd-grid-video-renderer',
        'ytd-rich-item-renderer',
        'ytd-video-renderer',
        'ytd-playlist-video-renderer',
        'ytd-reel-item-renderer',
        'ytd-shorts-lockup-view-model',
        'ytm-shorts-lockup-view-model',
        'ytm-shorts-lockup-view-model-v2',
        'yt-lockup-view-model'        // Overview-tab shelf items (Releases, For you)
      ].join(',');

      const videos = document.querySelectorAll(channelVideoSelector);
      for (const video of videos) {
        const checkedFor = video.getAttribute('data-ai-checked-channel');
        if (checkedFor === channelId) continue;
        if (checkedFor !== null) {
          video.querySelector('.ai-blocker-warning')?.remove();
          video.removeAttribute('data-ai-has-overlay');
        }
        video.setAttribute('data-ai-checked-channel', channelId);
        blockVideo(video, channelName, blockReason, isWarnlist, false, source);
      }

      // Also mark the channel page with banner
      markChannelPage(channelName, blockReason);
    }
  }

  // Check if we're on a channel page
  function checkChannelPage() {
    const url = window.location.href;
    if (url.includes('/@') || url.includes('/channel/')) {
      // Process videos on this channel page
      processChannelPageVideos();
    }
  }

  // Process Shorts feed (when viewing a Short)
  function processShortsFeed() {
    // Skip processing if extension is disabled or currently navigating
    if (blockMode === 'disabled' || isNavigating) {
      return;
    }

    const url = window.location.href;
    // Only process if we're on the Shorts player page
    if (!url.includes('/shorts/')) return;

    log('Processing Shorts player page');

    // Shorts player uses different selectors
    const shortsSelectors = [
      'ytd-reel-video-renderer',           // Current Short being viewed
      'ytd-shorts',                         // Shorts container
      '#shorts-container reel-video-renderer', // Alternative Shorts container
      'reel-video-renderer',               // Alternative reel renderer
      '#shorts-player',                     // Shorts player container
      'ytd-shorts-player-renderer'          // Shorts player renderer
    ];

    shortsSelectors.forEach(selector => {
      const shorts = document.querySelectorAll(selector);

      shorts.forEach(short => {
        // Get the current video URL to uniquely identify this short
        const videoLink = short.querySelector('a[href*="/shorts/"]') ||
                         document.querySelector('link[rel="canonical"]');
        const currentVideoUrl = videoLink ? (videoLink.href || videoLink.getAttribute('href')) : window.location.href;

        // Check if we've already processed this specific video (not just this DOM element)
        const lastCheckedUrl = short.getAttribute('data-ai-shorts-url');
        if (lastCheckedUrl === currentVideoUrl) {
          return; // Already processed this exact video
        }

        // Clean up any stale overlays from DOM reuse
        const staleOverlay = short.querySelector('.ai-blocker-shorts-overlay');
        if (staleOverlay) {
          log('Removing stale overlay from reused DOM element');
          staleOverlay.remove();
        }

        // Mark this element with the current video URL
        short.setAttribute('data-ai-shorts-checked', 'true');
        short.setAttribute('data-ai-shorts-url', currentVideoUrl);

        // Try to find channel link in the Short
        const channelLink = short.querySelector('a[href*="/@"]') ||
                           short.querySelector('a[href*="/channel/"]') ||
                           document.querySelector('#channel-name a') ||
                           document.querySelector('ytd-channel-name a');

        if (!channelLink) return;

        const href = channelLink.getAttribute('href');
        const channelId = matchChannelUrl(href);
        if (!channelId) return;

        const channelName = channelLink.textContent.trim() || channelId;

        const hit = lookupChannel(channelId);
        if (!hit) return;
        // Whitelist entries have reason === null — they explicitly allow.
        if (hit.source === 'whitelist') return;
        // Community entries only apply when the community list is enabled.
        if (!useCommunityList && hit.source.startsWith('community-')) return;
        blockShort(short, channelName, hit.reason, hit.isWarnlist, hit.source);
      });
    });
  }

  // Block/hide a Short in the Shorts feed
  // source can be: 'manual-blacklist', 'manual-warnlist', 'community-blacklist', 'community-warnlist'
  function blockShort(element, channelName, reason, isWarnlist = false, source = '') {
    log(`blockShort called for channel: ${channelName}, reason: ${reason}`);

    // First, remove any existing overlay from this element
    const existingOverlay = element.querySelector('.ai-blocker-shorts-overlay');
    if (existingOverlay) {
      log(`Removing existing shorts overlay from element before adding new one`);
      existingOverlay.remove();
    }

    // Determine behavior based on mode and list type
    const shouldShowOverlay = blockMode === 'warn' || isWarnlist;

    // Determine title based on source
    let title;
    if (source === 'community-blacklist' || source === 'manual-blacklist') {
      title = '🚫 AI Short Blocked';
    } else if (source === 'community-warnlist' || source === 'manual-warnlist') {
      title = '⚠️ Warning - Potential AI Short';
    } else {
      title = `⚠️ Potential AI Short ${isWarnlist ? 'Warned' : 'Blocked'}`;
    }

    if (!shouldShowOverlay && blockMode === 'hide') {
      // For Shorts feed, we can't just hide - instead show a full overlay
      // because Shorts auto-play and navigate
      log(`Adding block overlay for Short: ${channelName}`);
      const overlay = el('div', { class: 'ai-blocker-shorts-overlay' }, [
        el('div', { class: 'ai-blocker-shorts-content' }, [
          el('strong', { text: '🚫 AI Short Blocked' }),
          el('p', { text: `Channel: ${channelName}` }),
          el('p', { text: `Reason: ${reason}` }),
          el('button', { class: 'ai-blocker-skip-btn', text: 'Skip to Next' })
        ])
      ]);

      element.classList.add('aib-overlay-host');
      element.appendChild(overlay);

      overlay.querySelector('.ai-blocker-skip-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        // Simulate arrow down key press to go to next Short
        const keydownEvent = new KeyboardEvent('keydown', {
          key: 'ArrowDown',
          code: 'ArrowDown',
          keyCode: 40,
          which: 40,
          bubbles: true,
          cancelable: true
        });
        document.dispatchEvent(keydownEvent);
      });

      bumpVideosHidden();
    } else {
      // Show warning overlay
      log(`Adding warning overlay for Short: ${channelName}`);
      const warning = el('div', { class: 'ai-blocker-shorts-overlay' }, [
        el('div', { class: 'ai-blocker-shorts-content' }, [
          el('strong', { text: title }),
          el('p', { text: `Channel: ${channelName}` }),
          el('p', { text: `Reason: ${reason}` }),
          el('button', { class: 'ai-blocker-show-btn', text: 'Continue Watching' }),
          el('button', { class: 'ai-blocker-skip-btn', text: 'Skip to Next' })
        ])
      ]);

      element.classList.add('aib-overlay-host');
      element.appendChild(warning);

      warning.querySelector('.ai-blocker-show-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        warning.remove();
      });

      warning.querySelector('.ai-blocker-skip-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        // Simulate arrow down key press to go to next Short
        const keydownEvent = new KeyboardEvent('keydown', {
          key: 'ArrowDown',
          code: 'ArrowDown',
          keyCode: 40,
          which: 40,
          bubbles: true,
          cancelable: true
        });
        document.dispatchEvent(keydownEvent);
      });

      bumpVideosHidden();
    }
  }

  // Listen for messages from popup
  browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'reloadSettings') {
      loadSettings().then(() => {
        resetProcessedElements();
        requestAnimationFrame(() => {
          processVideos();
          checkChannelPage();
          processShortsFeed();
          processYtmShorts();
          processSidebarVideos();
          processEndscreenVideos();
        });
      });
    } else if (message.action === 'blockChannel') {
      addChannelToBlacklist(message.channelId);
      reprocessAfterListChange();
    } else if (message.action === 'whitelistChannel') {
      addChannelToWhitelist(message.channelId);
      reprocessAfterListChange();
    } else if (message.action === 'warnChannel') {
      addChannelToWarnlist(message.channelId);
      reprocessAfterListChange();
    } else if (message.action === 'keybindAction') {
      // Native keyboard shortcut relayed from the background. Act on the
      // channel currently under the cursor.
      runKeybindAction(message.which);
    } else if (message.action === 'getChannelFromContext') {
      // Try to extract channel from the last right-clicked element
      extractChannelFromElement(lastContextMenuTarget).then(channelId => {
        sendResponse({ channelId });
      });
      return true; // Keep message channel open for async response
    } else if (message.action === 'getChannelAndVideoForSubmit') {
      // Extract channel and video URL for submission
      extractChannelAndVideoForSubmit(lastContextMenuTarget).then(result => {
        sendResponse(result);
      });
      return true; // Keep message channel open for async response
    }
  });

  // Validate that a URL contains an actual video ID (not just /shorts/ or /watch)
  // Prevents submitting nav/sidebar links like "https://www.youtube.com/shorts/"
  function isValidVideoUrl(url) {
    if (!url) return false;
    return /\/shorts\/[\w-]+/.test(url) || /[?&]v=[\w-]+/.test(url);
  }

  // Extract channel ID and video URL for submission
  async function extractChannelAndVideoForSubmit(element) {
    const result = { channelId: null, videoUrl: null };

    log('extractChannelAndVideoForSubmit called with:', element ? element.tagName : 'null');

    // Video container selectors - must include Shorts containers and channel page items
    const videoContainerSelectors = [
      'ytd-compact-video-renderer',
      'ytd-video-renderer',
      'ytd-grid-video-renderer',
      'ytd-rich-grid-media',
      'ytd-rich-item-renderer',
      'ytd-reel-item-renderer',
      'ytd-shorts-lockup-view-model',
      'ytm-shorts-lockup-view-model-v2',
      'ytd-reel-video-renderer',
      'yt-lockup-view-model'
    ];

    // Helper: find video URL from a card container
    function findVideoUrlInCard(card) {
      if (!card) return null;
      // Try DOM links first
      const videoLink = card.querySelector('a[href*="/watch?v="], a[href*="/shorts/"]');
      if (videoLink && isValidVideoUrl(videoLink.href)) return videoLink.href;
      // Fallback: extract videoId from YouTube's internal .data property
      const renderer = card.querySelector('ytd-rich-grid-media, ytd-video-renderer, ytd-grid-video-renderer') || card;
      const data = renderer?.data || renderer?.__data;
      if (data?.videoId) {
        return `https://www.youtube.com/watch?v=${data.videoId}`;
      }
      // Also check navigationEndpoint for video URL
      const navVideoId = data?.navigationEndpoint?.watchEndpoint?.videoId;
      if (navVideoId) {
        return `https://www.youtube.com/watch?v=${navVideoId}`;
      }
      return null;
    }

    // Helper: find the card container for an element
    function findCardForElement(el) {
      if (!el) return null;
      const selectorStr = videoContainerSelectors.join(',');
      return el.closest(selectorStr);
    }

    // Step 1: Find the card the user right-clicked on and extract its video URL
    let card = findCardForElement(element);

    // Also try elementsFromPoint if the element itself isn't in a card
    if (!card && lastContextMenuCoords.x && lastContextMenuCoords.y) {
      const elementsAtPoint = document.elementsFromPoint(lastContextMenuCoords.x, lastContextMenuCoords.y);
      for (const el of elementsAtPoint) {
        card = findCardForElement(el);
        if (card) break;
      }
    }

    const cardVideoUrl = findVideoUrlInCard(card);
    log('Card video URL:', cardVideoUrl, 'from card:', card?.tagName);

    // Step 2: Determine channel ID
    // On channel pages, get channel from URL — but video must come from the right-clicked card
    const pageUrl = window.location.href;
    const channelPageMatch = pageUrl.match(/youtube\.com\/(@[^\/\s?#]+|channel\/[\w-]+|c\/[^\/\s?#]+|user\/[^\/\s?#]+)/);
    if (channelPageMatch) {
      const urlPath = channelPageMatch[1];
      if (urlPath.startsWith('@')) {
        result.channelId = stripAt(urlPath);
      } else if (urlPath.startsWith('channel/')) {
        const handleElement = document.querySelector('yt-formatted-string#channel-handle, span.yt-core-attributed-string[role="text"]');
        if (handleElement && handleElement.textContent.startsWith('@')) {
          result.channelId = stripAt(handleElement.textContent);
        }
      } else if (urlPath.startsWith('c/') || urlPath.startsWith('user/')) {
        result.channelId = urlPath.split('/')[1];
      }

      if (result.channelId && cardVideoUrl) {
        result.videoUrl = cardVideoUrl;
        log('Channel page + card video:', result);
        return result;
      }
      // If we have the channel but no video from the card, find any video on the page as fallback
      if (result.channelId) {
        const candidates = document.querySelectorAll('a[href*="/watch?v="], a[href*="/shorts/"]');
        for (const link of candidates) {
          if (isValidVideoUrl(link.href) && !link.href.includes('list=')) {
            result.videoUrl = link.href;
            break;
          }
        }
        if (result.videoUrl) {
          log('Channel page fallback video:', result);
          return result;
        }
      }
    }

    // Standard flow: Get the channel ID using existing function
    result.channelId = await extractChannelFromElement(element);
    log('Got channelId:', result.channelId);

    // Use the card video URL we already found
    if (cardVideoUrl) {
      result.videoUrl = cardVideoUrl;
      log('Using card video URL:', result.videoUrl);
      return result;
    }

    // Fallback: try shadow DOM traversal up from element
    if (element) {
      let current = element;
      for (let i = 0; i < 30 && current; i++) {
        if (current.tagName === 'A' && current.href) {
          if (isValidVideoUrl(current.href)) {
            result.videoUrl = current.href;
            log('Fallback - Found video URL from ancestor link:', result.videoUrl);
            return result;
          }
        }
        // Stop at container boundaries
        if (current.id === 'secondary' || current.id === 'related' ||
            current.id === 'primary' || current.id === 'content') break;
        // Escape shadow DOM if needed
        current = current.parentElement || (current.getRootNode?.()?.host);
      }
    }

    // Last resort: use current page URL if we're watching a video/Short
    const currentUrl = window.location.href;
    if (isValidVideoUrl(currentUrl)) {
      result.videoUrl = currentUrl;
      log('Fallback to current page URL:', result.videoUrl);
    }

    return result;
  }

  // Capture right-clicked element for context menu
  // Use capture phase to ensure we capture the element before any handlers modify it
  document.addEventListener('contextmenu', (e) => {
    lastContextMenuTarget = e.target;
    lastContextMenuCoords = { x: e.clientX, y: e.clientY };

    // Note: Firefox doesn't show extension context menu items on VIDEO elements
    // We use CSS (pointer-events: none) to make videos non-interactive so clicks
    // pass through to the container, avoiding Firefox's video-specific context menu
  }, true);

  // ===== Keyboard shortcuts: report the channel under the cursor =====
  // Track the element under the cursor so a keypress can resolve which channel
  // to act on. Pure assignment — cheap enough to run on every mousemove.
  document.addEventListener('mousemove', (e) => {
    lastHoverTarget = e.target;
    lastHoverCoords = { x: e.clientX, y: e.clientY };
  }, true);

  // Toast anchored at the cursor, used for keybind action feedback.
  function showCursorToast(message) {
    document.querySelector('.aiblock-cursor-toast')?.remove();
    const toast = el('div', { class: 'aiblock-submit-tooltip aiblock-cursor-toast', text: message });
    toast.style.left = lastHoverCoords.x + 'px';
    toast.style.top = (lastHoverCoords.y - 14) + 'px';
    toast.style.transform = 'translate(-50%, -100%)';
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 1800);
  }

  // Re-scan the page after a keybind list change so the just-acted channel's
  // tiles update immediately (mirrors the reloadSettings handler).
  function reprocessAfterListChange() {
    resetProcessedElements();
    requestAnimationFrame(() => {
      processVideos();
      checkChannelPage();
      processShortsFeed();
      processYtmShorts();
      processSidebarVideos();
      processEndscreenVideos();
      processYtAiFlag();
    });
  }

  // Submission triggered by keybind. Runs the same guards as the player
  // button, then the one-time confirmation modal on first use, then submits.
  function keybindSubmit(channelHandle, videoUrl) {
    const normalized = stripAt(channelHandle).toLowerCase();
    if (!useCommunityList) {
      showCursorToast('Enable community list to submit');
      return;
    }
    if (!anonymousSubmit && !username) {
      showCursorToast('Set a username in settings first');
      return;
    }
    if (submittedChannels.includes(normalized) || inFlightSubmissions.has(normalized)) {
      showCursorToast('Already submitted');
      return;
    }
    // First-time confirmation, consistent with the player flag button.
    if (!submitButtonConfirmed) {
      showSubmitConfirmationModal(channelHandle, () => doKeybindSubmit(channelHandle, videoUrl, normalized));
      return;
    }
    doKeybindSubmit(channelHandle, videoUrl, normalized);
  }

  async function doKeybindSubmit(channelHandle, videoUrl, normalized) {
    // Re-check in case a concurrent action recorded it between gate and run.
    if (submittedChannels.includes(normalized) || inFlightSubmissions.has(normalized)) {
      showCursorToast('Already submitted');
      return;
    }
    inFlightSubmissions.add(normalized);
    showCursorToast('Submitting…');
    try {
      const response = await browser.runtime.sendMessage({
        action: 'submitToApi',
        channelHandle: ensureAt(channelHandle),
        videoUrl: videoUrl || location.href,
        username: anonymousSubmit ? 'Anonymous' : username
      });
      if (response && response.ok) {
        submittedChannels = submittedChannels.filter(h => h !== normalized);
        submittedChannels.push(normalized);
        if (submittedChannels.length > 150) submittedChannels = submittedChannels.slice(-150);
        browser.storage.local.set({ submittedChannels });
        showCursorToast(`Submitted ✓ ${ensureAt(channelHandle)}`);
      } else if (response && response.status === 502) {
        showCursorToast('API offline. Try again later');
      } else {
        showCursorToast(response?.message || 'Submission failed');
      }
    } catch (err) {
      showCursorToast('Network error');
    } finally {
      inFlightSubmissions.delete(normalized);
    }
  }

  // Add the channel under the cursor to a personal list via keybind. Lists
  // store handles without the @ prefix (matching the popup's manual-add).
  function keybindAddToList(listName, channelHandle) {
    const handle = stripAt(channelHandle);
    if (listName === 'blacklist') addChannelToBlacklist(handle);
    else if (listName === 'warnlist') addChannelToWarnlist(handle);
    else if (listName === 'whitelist') addChannelToWhitelist(handle);
    const labels = { blacklist: 'blocklist', warnlist: 'warnlist', whitelist: 'whitelist' };
    showCursorToast(`Added to ${labels[listName]}: ${ensureAt(channelHandle)}`);
    // Re-scan this page; the popup refreshes via storage.onChanged on write.
    reprocessAfterListChange();
  }

  // Dispatch a matched keybind action against the hovered channel.
  async function runKeybindAction(action) {
    // Resolve channel (and video URL for submit) from the hovered element.
    // Reuse the right-click extraction path by pointing its target/coords at
    // the current hover position.
    lastContextMenuTarget = lastHoverTarget;
    lastContextMenuCoords = { x: lastHoverCoords.x, y: lastHoverCoords.y };

    let channelId = null, videoUrl = null;
    try {
      const result = await extractChannelAndVideoForSubmit(lastHoverTarget);
      channelId = result.channelId;
      videoUrl = result.videoUrl;
    } catch (err) {
      log('Keybind channel extraction failed:', err);
    }

    if (!channelId) {
      showCursorToast('No channel under the cursor');
      return;
    }

    if (action === 'submit') keybindSubmit(channelId, videoUrl);
    else keybindAddToList(action, channelId);
  }

  // Extract channel handle from a clicked element by traversing up the DOM
  /**
   * Parse channel handle from href - handles all YouTube URL formats
   * Returns handle WITHOUT @ prefix for consistency
   */
  function parseChannelFromHref(href) {
    if (!href) return null;

    // Normalize: could be full URL or relative path
    let path;
    try {
      path = new URL(href, 'https://www.youtube.com').pathname;
    } catch {
      path = href;
    }

    // Match all known channel URL patterns (in priority order)
    const patterns = [
      /^\/@([^\/\s?#]+)/,        // /@handle (most common now)
      /^\/c\/([^\/\s?#]+)/,      // /c/customname (legacy)
      /^\/user\/([^\/\s?#]+)/,   // /user/username (very old)
    ];

    for (const pattern of patterns) {
      const match = path.match(pattern);
      if (match) {
        return match[1]; // Return handle WITHOUT @ prefix
      }
    }

    return null;
  }

  /**
   * Extract channel info from YouTube's internal .data property on renderers
   * This is a fallback when DOM doesn't have visible channel links
   */
  function extractChannelFromDataProperty(cardElement) {
    // Try to find the renderer with data
    const renderer = cardElement.querySelector('ytd-rich-grid-media, ytd-video-renderer') || cardElement;
    const data = renderer?.data || renderer?.__data;

    if (!data) return null;

    // Navigate the InnerTube data structure - multiple possible paths
    const runs = data?.shortBylineText?.runs
      || data?.longBylineText?.runs
      || data?.ownerText?.runs;

    if (runs?.[0]?.navigationEndpoint?.browseEndpoint) {
      const endpoint = runs[0].navigationEndpoint.browseEndpoint;
      // Prefer canonicalBaseUrl (/@handle format)
      if (endpoint.canonicalBaseUrl) {
        const match = endpoint.canonicalBaseUrl.match(/\/@([\w.-]+)/);
        if (match) return match[1];
      }
    }

    return null;
  }

  // All known card-level selectors (from YouTube DOM reference)
  const CARD_SELECTORS = [
    'ytd-rich-item-renderer',      // Homepage grid cards
    'ytd-video-renderer',          // Search results, some feeds
    'ytd-compact-video-renderer',  // Sidebar recommendations
    'ytd-grid-video-renderer',     // Channel page grid
    'ytd-rich-grid-media',         // Inner media element (fallback)
    'ytd-channel-renderer',        // Channel card in search results
    'ytd-reel-item-renderer',      // Shorts shelf items
    'ytd-shorts-lockup-view-model', // Shorts lockup
    'ytm-shorts-lockup-view-model-v2', // New Shorts format (2025+)
    'grid-shelf-view-model',       // New Shorts shelf container
    'yt-lockup-view-model',        // Sidebar videos (new format)
    'ytd-reel-video-renderer',     // Shorts in player
  ].join(',');

  // Channel handle selectors in priority order (from YouTube DOM reference)
  const HANDLE_SELECTORS = [
    'a#avatar-link[href]',           // Homepage - avatar image link
    'a#channel-thumbnail[href]',     // Search page - avatar link (DIFFERENT from homepage!)
    'a#main-link[href]',             // Channel renderer main link
    '#avatar-section > a[href]',     // Channel renderer avatar
    'ytd-channel-name a[href]',      // Channel name text link
    '#channel-name a[href]',         // Alternative channel name selector
    '#owner a[href]',                // Owner link on some pages
    'a[href^="/@"]',                 // Any @handle link
    'a[href*="/@"]',                 // @handle link anywhere in href
    'a[href^="/c/"]',                // Legacy custom URL format
    'a[href^="/user/"]',             // Very old user format
  ];

  async function extractChannelFromElement(element) {
    log('extractChannelFromElement called with:', element ? element.tagName : 'null');
    if (!element) return null;

    // ========================================================================
    // REFACTORED: Following YouTube DOM Reference Document recommendations
    // Strategy: closest() UP to card → querySelector DOWN to channel → .data fallback
    // ========================================================================

    // Check if this is a playlist element - context menu not supported for playlists
    const playlistCheck = element.closest('ytd-playlist-renderer, ytd-grid-playlist-renderer, ytd-compact-playlist-renderer, ytd-playlist-panel-renderer, ytd-browse[page-subtype="playlist"]');
    if (playlistCheck) {
      log('Detected playlist, returning null');
      return null;
    }

    // ----- STEP 1: Find the video card container -----
    let card = element.closest(CARD_SELECTORS);
    log('Step 1 - Card container:', card ? card.tagName : 'none');

    // ----- STEP 2: Handle hover preview - find actual card underneath -----
    const videoPreview = element.closest('ytd-video-preview');
    const inlinePlayer = element.closest('#inline-preview-player, .html5-video-player');

    if ((videoPreview || inlinePlayer) && lastContextMenuCoords.x && lastContextMenuCoords.y) {
      log('Step 2 - Detected preview, using elementsFromPoint');
      const elementsAtPoint = document.elementsFromPoint(lastContextMenuCoords.x, lastContextMenuCoords.y);

      for (const el of elementsAtPoint) {
        // Skip the preview element itself
        if (el.closest('ytd-video-preview') || el.closest('#inline-preview-player')) {
          continue;
        }
        // Find the actual card at this position
        const cardAtPoint = el.closest(CARD_SELECTORS);
        if (cardAtPoint) {
          card = cardAtPoint;
          log('Step 2 - Found card via elementsFromPoint:', card.tagName);
          break;
        }
      }
    }

    if (!card) {
      log('No card container found, trying fallback traversal');
      // Fallback: simple upward traversal looking for any channel link
      let current = element;
      for (let i = 0; i < 15 && current; i++) {
        if (current.tagName === 'A') {
          const handle = parseChannelFromHref(current.getAttribute('href') || current.href);
          if (handle) {
            log('Found channel on ancestor link:', handle);
            return handle;
          }
        }
        if (current.querySelector) {
          for (const selector of HANDLE_SELECTORS) {
            const anchor = current.querySelector(selector);
            if (anchor) {
              const handle = parseChannelFromHref(anchor.getAttribute('href') || anchor.href);
              if (handle) {
                log('Found channel via fallback:', handle);
                return handle;
              }
            }
          }
        }
        current = current.parentElement;
      }
      return null;
    }

    // ----- STEP 3: Check for Shorts (need to fetch page for channel info) -----
    const shortsLink = card.querySelector('a[href*="/shorts/"]');
    if (shortsLink) {
      const href = shortsLink.getAttribute('href') || shortsLink.href;
      const shortsIdMatch = href.match(/\/shorts\/([^?&#]+)/);
      if (shortsIdMatch) {
        log('Step 3 - Detected Shorts, fetching channel for:', shortsIdMatch[1]);
        const shortsUrl = `https://www.youtube.com/shorts/${shortsIdMatch[1]}`;
        const channelInfo = await fetchChannelFromShortsUrl(shortsUrl);
        if (channelInfo?.channelId) {
          return stripAt(channelInfo.channelId);
        }
        return null;
      }
    }

    // ----- STEP 4: Handle sidebar videos (yt-lockup-view-model) - need page fetch -----
    if (card.tagName === 'YT-LOCKUP-VIEW-MODEL') {
      const videoLink = card.querySelector('a[href*="/watch?v="]');
      if (videoLink) {
        const href = videoLink.getAttribute('href') || videoLink.href;
        const videoIdMatch = href.match(/[?&]v=([^&]+)/);
        if (videoIdMatch) {
          log('Step 4 - Sidebar video, fetching channel for:', videoIdMatch[1]);
          const videoUrl = `https://www.youtube.com/watch?v=${videoIdMatch[1]}`;
          const channelInfo = await fetchChannelFromShortsUrl(videoUrl);
          if (channelInfo?.channelId) {
            return stripAt(channelInfo.channelId);
          }
        }
      }
      return null;
    }

    // ----- STEP 5: Query DOWN for channel links (priority order) -----
    for (const selector of HANDLE_SELECTORS) {
      const anchor = card.querySelector(selector);
      if (anchor) {
        const handle = parseChannelFromHref(anchor.getAttribute('href') || anchor.href);
        if (handle) {
          log('Step 5 - Found channel via:', selector, '→', handle);
          return handle;
        }
      }
    }

    // ----- STEP 6: Try .data property fallback (YouTube's internal data) -----
    const channelFromData = extractChannelFromDataProperty(card);
    if (channelFromData) {
      log('Step 6 - Found channel via .data property:', channelFromData);
      return channelFromData;
    }

    log('No channel found after all steps');
    return null;
  }


  // Strip all data-ai-* tracking attributes, drop the overlay-host classes,
  // and remove any injected overlay elements. Shared by the navigation
  // cleanup path and the settings-reload path. Combined selectors mean one
  // DOM scan per category instead of one per attribute/class.
  const TRACKED_ATTR_SELECTOR = [
    'data-ai-checked',
    'data-ai-checked-channel',
    'data-ai-channel-checked',
    'data-ai-shorts-checked',
    'data-ai-shorts-fetched',
    'data-ai-sidebar-fetched',
    'data-ai-endscreen-url'
  ].map(a => `[${a}]`).join(',');

  const OVERLAY_SELECTOR = [
    '.ai-blocker-warning',
    '.ai-blocker-channel-warning',
    '.ai-blocker-channel-overlay',
    '.ai-blocker-shorts-overlay',
    '.ai-blocker-yt-flag-warning'
  ].join(',');

  function resetProcessedElements() {
    document.querySelectorAll(TRACKED_ATTR_SELECTOR).forEach(el => {
      el.removeAttribute('data-ai-checked');
      el.removeAttribute('data-ai-checked-channel');
      el.removeAttribute('data-ai-channel-checked');
      el.removeAttribute('data-ai-shorts-checked');
      el.removeAttribute('data-ai-shorts-url');
      el.removeAttribute('data-ai-shorts-fetched');
      el.removeAttribute('data-ai-sidebar-fetched');
      el.removeAttribute('data-ai-endscreen-url');
      if (el.style.display === 'none') el.style.display = '';
    });

    document.querySelectorAll('.aib-overlay-host').forEach(el => {
      el.classList.remove('aib-overlay-host', 'aib-clipped');
    });

    document.querySelectorAll('[data-ai-has-overlay]').forEach(el => {
      el.removeAttribute('data-ai-has-overlay');
    });

    document.querySelectorAll(OVERLAY_SELECTOR).forEach(el => el.remove());
  }

  // Helper function to clean up all overlays and attributes
  // Used when navigating to prevent false positives on reused DOM elements
  function cleanupAllOverlays() {
    log('Cleaning up all overlays and attributes');
    isNavigating = true;
    if (processTimer) {
      clearTimeout(processTimer);
      processTimer = null;
    }
    cancelButtonRetry();
    resetProcessedElements();
    removeSubmitButton();
    log('Cleanup complete');
  }

  // Helper function to reprocess all content with debouncing
  function reprocessAllContent() {
    // Clear any existing timer
    if (processTimer) {
      clearTimeout(processTimer);
    }

    // Debounce processing to prevent rapid re-execution
    processTimer = setTimeout(() => {
      log('Reprocessing all content');
      // Re-enable processing
      isNavigating = false;

      processVideos();
      checkChannelPage();
      processShortsFeed();
      processYtmShorts();
      processSidebarVideos();
      processEndscreenVideos();
      injectSubmitButton();
      processYtAiFlag();

      processTimer = null;
    }, 100);
  }

  // Initialize
  loadSettings().then(() => {
    // Initial scan
    reprocessAllContent();

    // Single MutationObserver handles both DOM changes and URL changes.
    // Throttled to prevent excessive callback firing on YouTube's SPA.
    new MutationObserver(() => {
      pendingMutations = true;

      if (!observerThrottleTimer) {
        observerThrottleTimer = setTimeout(() => {
          if (pendingMutations) {
            // Check for SPA navigation (URL change)
            const url = location.href;
            if (url !== lastUrl) {
              log('URL change detected');
              lastUrl = url;
              cleanupAllOverlays();
              // Fast path: check channel page immediately using URL (no wait)
              isNavigating = false;
              checkChannelPage();
              reprocessAllContent();
            } else {
              // Fast path: catch new channel-page grid containers as they load
              checkChannelPage();
              reprocessAllContent();
            }
            pendingMutations = false;
          }
          observerThrottleTimer = null;
        }, 150);
      }
    }).observe(document.body, {
      childList: true,
      subtree: true,
      attributes: false,
      characterData: false
    });

    // Handle browser back/forward navigation
    window.addEventListener('popstate', () => {
      log('Popstate event detected');
      cleanupAllOverlays();
      isNavigating = false;
      checkChannelPage();
      reprocessAllContent();
    });

    // Handle YouTube's custom SPA navigation event
    window.addEventListener('yt-navigate-finish', () => {
      log('YouTube navigation event detected');
      cleanupAllOverlays();
      isNavigating = false;
      checkChannelPage();
      reprocessAllContent();
    });

  });
})();