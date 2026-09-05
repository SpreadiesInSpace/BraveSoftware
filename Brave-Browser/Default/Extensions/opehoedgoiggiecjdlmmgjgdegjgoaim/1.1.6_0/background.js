// AI Channel Blocker - Background Script (Service Worker)
// Import browser polyfill for Chrome compatibility
importScripts('browser-polyfill.min.js');
// sync.js also exports safeJsonStringify, used below for submit payloads.
importScripts('sync.js');

// When auto-blocklist is enabled, add submitted channel to personal blocklist.
// Tracked in autoAddedBlocklist so it can be pruned once the channel appears
// in the community list after syncing.
async function autoBlocklistChannel(channelHandle) {
  const data = await browser.storage.local.get([
    'autoBlocklistOnSubmit', 'blacklist', 'warnlist', 'whitelist', 'autoAddedBlocklist'
  ]);
  if (!data.autoBlocklistOnSubmit) return;

  // Canonical form (@-stripped, lowercased) — same as every other list-write
  // path and as the sync.js prune matching, so entries stay consistent.
  const handle = channelHandle.replace(/^@/, '').toLowerCase();
  let blacklist = data.blacklist || [];
  let warnlist = data.warnlist || [];
  let whitelist = data.whitelist || [];
  let autoAdded = data.autoAddedBlocklist || [];

  if (blacklist.includes(handle)) return;

  warnlist = warnlist.filter(h => h !== handle);
  whitelist = whitelist.filter(h => h !== handle);
  blacklist.push(handle);
  if (!autoAdded.includes(handle)) autoAdded.push(handle);

  await browser.storage.local.set({ blacklist, warnlist, whitelist, autoAddedBlocklist: autoAdded });

  // Notify all YouTube tabs to reload
  const tabs = await browser.tabs.query({ url: 'https://www.youtube.com/*' });
  tabs.forEach(tab => {
    browser.tabs.sendMessage(tab.id, { action: 'reloadSettings' }).catch(() => {});
  });
}

// ===== BACKGROUND SCRIPT FUNCTIONALITY =====

// Initialize default settings on installation
browser.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    // Set default values
    browser.storage.local.set({
      blockMode: 'warn',
      blacklist: [],
      warnlist: [],
      whitelist: [],
      blockedChannels: [], // Legacy support
      videosHidden: 0,
      useCommunityList: true, // Enable community list by default
      communityBlacklist: [],
      communityMediumList: []
    }).then(() => {
      console.log('AI Channel Blocker installed with default settings');
      // Initialize sync system with first install flag
      // This ensures community list syncs with retry logic
      initializeSync(true);
    });
  } else if (details.reason === 'update') {
    console.log('AI Channel Blocker updated');
    // Migrate legacy blockedChannels to blacklist
    browser.storage.local.get(['blockedChannels', 'blacklist']).then(result => {
      if (result.blockedChannels && result.blockedChannels.length > 0 && (!result.blacklist || result.blacklist.length === 0)) {
        browser.storage.local.set({ blacklist: result.blockedChannels }).then(() => {
          console.log('Migrated blockedChannels to blacklist');
        });
      }
    });
    // Initialize sync for existing users (not first install)
    initializeSync(false);
  }
});

// Listen for messages from content scripts
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Self-heal: every message from a content script is an opportunity to
  // verify our context menus are still registered after a SW restart that
  // didn't fire onInstalled/onStartup. Fire-and-forget; no-op when ready.
  ensureContextMenus();

  if (message.action === 'incrementVideosHidden') {
    const delta = Math.max(1, message.by | 0);
    browser.storage.local.get(['videosHidden']).then(result => {
      const count = (result.videosHidden || 0) + delta;
      browser.storage.local.set({ videosHidden: count });
    });
  }

  if (message.action === 'getSettings') {
    browser.storage.local.get(null).then(settings => {
      sendResponse(settings);
    });
    return true; // Keep the message channel open for async response
  }

  if (message.action === 'syncCommunityList') {
    syncCommunityBlocklist().then(result => {
      sendResponse(result);
    });
    return true; // Keep the message channel open for async response
  }

  if (message.action === 'getSyncStats') {
    getSyncStats().then(stats => {
      sendResponse(stats);
    });
    return true; // Keep the message channel open for async response
  }

  // Handle API submissions from content script (to bypass CORS)
  if (message.action === 'submitToApi') {
    (async () => {
      const normalized = (message.channelHandle || '').replace(/^@/, '').toLowerCase();
      try {
        // Guard: refuse to submit channels that are already on a list that
        // would make the submission redundant or contradictory.
        const guard = await checkSubmitGuard(message.channelHandle);
        if (!guard.ok) {
          sendResponse(guard);
          return;
        }

        // Authoritative dedup backstop. Content scripts guard per-button and
        // per-page, but multiple triggers (player button, AI-flag banner) or
        // multiple tabs can race. submittedChannels (storage) catches anything
        // already submitted; pendingSubmissions catches concurrent in-flight
        // requests for the same channel that haven't recorded yet.
        if (normalized) {
          if (pendingSubmissions.has(normalized)) {
            sendResponse({ ok: false, status: 0, message: 'Submission already in progress' });
            return;
          }
          const stored = await browser.storage.local.get('submittedChannels');
          if ((stored.submittedChannels || []).includes(normalized)) {
            sendResponse({ ok: false, status: 0, message: 'Channel already submitted' });
            return;
          }
          pendingSubmissions.add(normalized);
        }

        const apiResponse = await fetch('https://api.aisloplist.com', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json; charset=utf-8'
          },
          body: safeJsonStringify({
            channel_handle: message.channelHandle,
            video_url: message.videoUrl,
            username: message.username
          })
        });

        const responseData = await apiResponse.json().catch(() => ({}));
        if (apiResponse.ok) {
          await recordSubmittedChannel(normalized);
          await autoBlocklistChannel(message.channelHandle);
        }
        sendResponse({
          ok: apiResponse.ok,
          status: apiResponse.status,
          message: responseData.message
        });
      } catch (error) {
        console.error('[AiBlock] Submit API error:', error);
        sendResponse({
          ok: false,
          status: 0,
          message: 'Network error'
        });
      } finally {
        if (normalized) pendingSubmissions.delete(normalized);
      }
    })();
    return true; // Keep the message channel open for async response
  }
});

// In-flight submissions (normalized handle) — see the submitToApi dedup
// backstop above. Lives at module scope so concurrent messages share it.
const pendingSubmissions = new Set();

// Record a successfully submitted channel into the shared submittedChannels
// list (capped, deduped). Authoritative write so the popup, context menu, and
// every content-script tab converge on the same dedup state.
async function recordSubmittedChannel(normalizedHandle) {
  if (!normalizedHandle) return;
  const data = await browser.storage.local.get('submittedChannels');
  let list = (data.submittedChannels || []).filter(h => h !== normalizedHandle);
  list.push(normalizedHandle);
  if (list.length > 150) list = list.slice(-150);
  await browser.storage.local.set({ submittedChannels: list });
}

// Pre-submit guard. Refuses submission when the channel is already on the
// active community blocklist (redundant) or on the user's whitelist
// (contradictory). Returns { ok: true } when submission is allowed, or
// { ok: false, status: 0, message } when blocked.
// Normalize a handle the same way the content script's normalizeHandle does:
// @-stripped, percent-decoded (best-effort), lowercased. Matching this exactly
// is what makes the guard catch the same entries the content script blocks on
// (a plain strip+lowercase misses percent-encoded / unicode handles).
function normalizeHandleForGuard(h) {
  let s = String(h || '');
  if (s.startsWith('@')) s = s.slice(1);
  try { s = decodeURIComponent(s); } catch (e) { /* keep raw */ }
  return s.toLowerCase();
}

async function checkSubmitGuard(channelHandle) {
  if (!channelHandle) return { ok: true };
  const normalized = normalizeHandleForGuard(channelHandle);
  const data = await browser.storage.local.get([
    'whitelist', 'communityBlacklist', 'useCommunityList'
  ]);
  const whitelist = (data.whitelist || []).map(normalizeHandleForGuard);
  if (whitelist.includes(normalized)) {
    return { ok: false, status: 0, message: 'Channel is on your whitelist' };
  }
  // Enabled-by-default: undefined means on, matching the content script's
  // `useCommunityList !== false`. Using a plain truthy check here would skip
  // the guard when the value was never explicitly stored, so a community-
  // blocked channel could still be submitted.
  if (data.useCommunityList !== false) {
    const community = (data.communityBlacklist || []).map(normalizeHandleForGuard);
    if (community.includes(normalized)) {
      return { ok: false, status: 0, message: 'Channel is already on the community list' };
    }
  }
  return { ok: true };
}

// Context menus must be created from lifecycle events — the MV3 service worker
// wakes on every event, and top-level browser.contextMenus.create() would log
// "Cannot create item with duplicate id" on every wake.
//
// Promise/await form (not the callback form): with callback-style removeAll,
// the service worker can terminate between removeAll returning and the
// callback firing, so the create calls never run and the user ends up with
// no context menu items. Awaiting the Promise keeps the SW alive across the
// async boundary. Each create() is also awaited individually with its own
// try/catch so a single failed item doesn't leave the rest unregistered AND
// failures get logged (the polyfill returns Promises whose rejections would
// otherwise be silently unhandled).
async function createContextMenus() {
  await browser.contextMenus.removeAll();
  const common = {
    contexts: ['all'],
    documentUrlPatterns: ['https://www.youtube.com/*']
  };
  const items = [
    { id: 'add-to-blacklist',   title: 'Add Channel to Blacklist',                ...common },
    { id: 'add-to-warnlist',    title: 'Add Channel to Warnlist',                 ...common },
    { id: 'add-to-whitelist',   title: 'Add Channel to Whitelist',                ...common },
    { id: 'separator-1',        type: 'separator',                                ...common },
    { id: 'submit-ai-channel',  title: 'Submit AI Channel to Community List',     ...common }
  ];
  let anyFailed = false;
  for (const item of items) {
    try {
      await browser.contextMenus.create(item);
    } catch (err) {
      anyFailed = true;
      console.error(`[AiBlock] Failed to create context menu item "${item.id}":`, err);
    }
  }
  // Surface partial-failure to the caller so ensureContextMenus doesn't mark
  // itself ready and will retry on the next message.
  if (anyFailed) throw new Error('Partial context menu registration');
}

// Self-healing wrapper. In MV3, Chrome may terminate and restart the service
// worker without firing onInstalled or onStartup (e.g. after a long idle, a
// browser update, or an enable/disable toggle in chrome://extensions). The
// menu registrations are *supposed* to persist across SW restarts, but there
// are open Chromium bugs where they don't. Calling this from the message
// handler means the first ping from a content script after a SW wake will
// lazily re-register if needed. Idempotent thanks to removeAll, and dedupes
// concurrent calls so a burst of messages on wake doesn't queue N registrations.
let contextMenusReady = false;
let contextMenuPromise = null;
function ensureContextMenus() {
  if (contextMenusReady) return Promise.resolve();
  if (contextMenuPromise) return contextMenuPromise;
  contextMenuPromise = createContextMenus()
    .then(() => { contextMenusReady = true; })
    .catch(err => {
      console.error('[AiBlock] ensureContextMenus failed, will retry on next call:', err);
    })
    .finally(() => { contextMenuPromise = null; });
  return contextMenuPromise;
}

browser.runtime.onInstalled.addListener(() => ensureContextMenus());
browser.runtime.onStartup.addListener(() => ensureContextMenus());

// Native keyboard shortcuts (configured at chrome://extensions/shortcuts).
// commands.onCommand fires in the background, so relay it to the active
// YouTube tab's content script, which acts on the channel under the cursor.
const COMMAND_ACTIONS = {
  'submit-channel': 'submit',
  'blacklist-channel': 'blacklist',
  'warnlist-channel': 'warnlist',
  'whitelist-channel': 'whitelist'
};
browser.commands.onCommand.addListener(async (command) => {
  const which = COMMAND_ACTIONS[command];
  if (!which) return;
  try {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (!tab || !/^https:\/\/www\.youtube\.com\//.test(tab.url || '')) return;
    await browser.tabs.sendMessage(tab.id, { action: 'keybindAction', which });
  } catch (err) {
    // Content script not loaded on this tab — ignore.
  }
});

browser.contextMenus.onClicked.addListener(async (info, tab) => {
  // Handle submit AI channel
  if (info.menuItemId === 'submit-ai-channel') {
    // Check if community list is enabled and get username
    const settings = await browser.storage.local.get(['useCommunityList', 'username', 'anonymousSubmit']);

    if (!settings.useCommunityList) {
      browser.notifications.create({
        type: 'basic',
        iconUrl: browser.runtime.getURL('icons/AiBlock_ico2_48tp.png'),
        title: 'Community List Disabled',
        message: 'Enable "Use community blocklist" in settings to submit channels'
      });
      return;
    }

    if (!settings.anonymousSubmit && (!settings.username || !settings.username.trim())) {
      browser.notifications.create({
        type: 'basic',
        iconUrl: browser.runtime.getURL('icons/AiBlock_ico2_48tp.png'),
        title: 'Username Required',
        message: 'Please set your username in the extension settings first'
      });
      return;
    }

    // Try to get channel and video info from content script
    try {
      const response = await browser.tabs.sendMessage(tab.id, {
        action: 'getChannelAndVideoForSubmit'
      });

      if (!response || !response.channelId) {
        browser.notifications.create({
          type: 'basic',
          iconUrl: browser.runtime.getURL('icons/AiBlock_ico2_48tp.png'),
          title: 'No Channel Found',
          message: 'Please right-click on a video to submit its channel'
        });
        return;
      }

      if (!response.videoUrl) {
        browser.notifications.create({
          type: 'basic',
          iconUrl: browser.runtime.getURL('icons/AiBlock_ico2_48tp.png'),
          title: 'No Video URL',
          message: 'Could not detect video URL. Please try on a video page.'
        });
        return;
      }

      // Ensure channel handle starts with @
      let channelHandle = response.channelId;
      if (!channelHandle.startsWith('@')) {
        channelHandle = '@' + channelHandle;
      }

      // Normalize channel handle for duplicate checking (lowercase, without @)
      const normalizedHandle = channelHandle.slice(1).toLowerCase();

      // Check if channel was already submitted
      const storageData = await browser.storage.local.get('submittedChannels');
      const submittedChannels = storageData.submittedChannels || [];
      if (submittedChannels.includes(normalizedHandle)) {
        browser.notifications.create({
          type: 'basic',
          iconUrl: browser.runtime.getURL('icons/AiBlock_ico2_48tp.png'),
          title: 'Already Submitted',
          message: `${channelHandle} has already been submitted`
        });
        return;
      }

      // On-list guard (whitelist / active community blocklist).
      const guard = await checkSubmitGuard(channelHandle);
      if (!guard.ok) {
        browser.notifications.create({
          type: 'basic',
          iconUrl: browser.runtime.getURL('icons/AiBlock_ico2_48tp.png'),
          title: 'Submission Skipped',
          message: guard.message
        });
        return;
      }

      // Submit to API
      try {
        const apiResponse = await fetch('https://api.aisloplist.com', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json; charset=utf-8'
          },
          body: safeJsonStringify({
            channel_handle: channelHandle,
            video_url: response.videoUrl,
            username: settings.anonymousSubmit ? 'Anonymous' : settings.username.trim()
          })
        });

        const responseData = await apiResponse.json().catch(() => ({}));

        if (apiResponse.ok) {
          browser.notifications.create({
            type: 'basic',
            iconUrl: browser.runtime.getURL('icons/AiBlock_ico2_48tp.png'),
            title: 'Channel Submitted',
            message: responseData.message || `${channelHandle} has been submitted to the community list`
          });

          // Track submitted channel (keep last 150 unique entries)
          let updatedChannels = submittedChannels.filter(h => h !== normalizedHandle);
          updatedChannels.push(normalizedHandle);
          if (updatedChannels.length > 150) {
            updatedChannels = updatedChannels.slice(-150);
          }
          browser.storage.local.set({ submittedChannels: updatedChannels });

          // Auto-blocklist: add to personal blocklist until next community sync
          await autoBlocklistChannel(channelHandle);
        } else {
          let errorMessage = responseData.message || `Submission failed (${apiResponse.status}). Please try again later.`;
          let errorTitle = 'Submission Failed';
          if (apiResponse.status === 502) {
            errorTitle = 'API Offline';
            errorMessage = 'The submission server is currently offline. Please try again later.';
          } else if (apiResponse.status === 429) {
            errorTitle = 'Rate Limit Reached';
            errorMessage = 'Too many requests. Please try again later.';
          } else if (apiResponse.status === 403) {
            errorTitle = 'Access Denied';
            errorMessage = 'Your connection has been temporarily or permanently banned from submitting.';
          }
          browser.notifications.create({
            type: 'basic',
            iconUrl: browser.runtime.getURL('icons/AiBlock_ico2_48tp.png'),
            title: errorTitle,
            message: errorMessage
          });
        }
      } catch (error) {
        console.error('[AiBlock] Submit API error:', error);
        browser.notifications.create({
          type: 'basic',
          iconUrl: browser.runtime.getURL('icons/AiBlock_ico2_48tp.png'),
          title: 'Network Error',
          message: 'Could not connect to the submission server'
        });
      }
    } catch (error) {
      console.error('[AiBlock] Content script error:', error);
      browser.notifications.create({
        type: 'basic',
        iconUrl: browser.runtime.getURL('icons/AiBlock_ico2_48tp.png'),
        title: 'Error',
        message: 'Could not get channel information from the page'
      });
    }
    return;
  }

  // Helper function to add channel to list
  const addChannelToList = (rawChannelId, menuItemId) => {
    // Canonical form (@-stripped, lowercased) — consistent with all other paths.
    const channelId = String(rawChannelId || '').replace(/^@/, '').toLowerCase();
    browser.storage.local.get(['blacklist', 'warnlist', 'whitelist']).then(result => {
      let blacklist = result.blacklist || [];
      let warnlist = result.warnlist || [];
      let whitelist = result.whitelist || [];

      // Remove from all lists first (case-insensitive to also catch legacy entries)
      const sameHandle = (id) => id.toLowerCase().replace(/^@/, '') === channelId;
      blacklist = blacklist.filter(id => !sameHandle(id));
      warnlist = warnlist.filter(id => !sameHandle(id));
      whitelist = whitelist.filter(id => !sameHandle(id));

      let listName = '';

      // Add to appropriate list
      if (menuItemId === 'add-to-blacklist') {
        blacklist.push(channelId);
        listName = 'Blacklist';
      } else if (menuItemId === 'add-to-warnlist') {
        warnlist.push(channelId);
        listName = 'Warnlist';
      } else if (menuItemId === 'add-to-whitelist') {
        whitelist.push(channelId);
        listName = 'Whitelist';
      }

      browser.storage.local.set({ blacklist, warnlist, whitelist }).then(() => {
        // Notify content script to refresh
        browser.tabs.sendMessage(tab.id, { action: 'reloadSettings' }).catch(() => {
          // Ignore if content script not loaded
        });

        // Show notification
        browser.notifications.create({
          type: 'basic',
          iconUrl: browser.runtime.getURL('icons/AiBlock_ico2_48tp.png'),
          title: `Added to ${listName}`,
          message: `Channel ${channelId} has been added to ${listName}`
        });
      });
    });
  };

  // Try to extract channel ID from link URL or page URL
  let channelId = null;
  let urlToCheck = info.linkUrl || info.pageUrl;

  if (urlToCheck) {
    const match = urlToCheck.match(/\/@([^\/\?]+)|\/channel\/([^\/\?]+)/);
    if (match) {
      channelId = match[1] || match[2];
    }
  }

  // If we found a channel ID from URL
  if (channelId) {
    addChannelToList(channelId, info.menuItemId);
  } else {
    // Try to find channel from DOM context
    try {
      const response = await browser.tabs.sendMessage(tab.id, {
        action: 'getChannelFromContext'
      });

      if (response && response.channelId) {
        addChannelToList(response.channelId, info.menuItemId);
      } else {
        // Show error notification if no channel found
        browser.notifications.create({
          type: 'basic',
          iconUrl: browser.runtime.getURL('icons/AiBlock_ico2_48tp.png'),
          title: 'No Channel Found',
          message: 'Please right-click on a video or channel link'
        });
      }
    } catch (error) {
      // Show error notification if content script not available
      browser.notifications.create({
        type: 'basic',
        iconUrl: browser.runtime.getURL('icons/AiBlock_ico2_48tp.png'),
        title: 'No Channel Found',
        message: 'Please right-click on a video or channel link'
      });
    }
  }
});
