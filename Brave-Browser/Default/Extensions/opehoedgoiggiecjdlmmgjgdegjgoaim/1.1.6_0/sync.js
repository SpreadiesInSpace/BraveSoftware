// AI Channel Blocker - Community Sync

// Escape non-ASCII characters to \uXXXX for safe JSON transmission. Shared
// with background.js (both platforms) so the submit payload can't be
// corrupted by any intermediate proxy that mangles unicode.
function safeJsonStringify(obj) {
  return JSON.stringify(obj).replace(/[\u0080-\uffff]/g, ch =>
    '\\u' + ('0000' + ch.charCodeAt(0).toString(16)).slice(-4)
  );
}

// GitHub repository URLs for the community lists
// TODO: Replace with your actual GitHub repository URL
const GITHUB_BASE_URL = 'https://raw.githubusercontent.com/Override92/AiSList/refs/heads/main/AiSList/';
const BLOCKLIST_URL = GITHUB_BASE_URL + 'aislist_blocklist.txt';
const WARNLIST_URL = GITHUB_BASE_URL + 'aislist_warnlist.txt';

// Sync interval: 24 hours
const SYNC_INTERVAL_HOURS = 24;

/**
 * Parse a plain text blocklist file (EasyList style)
 * @param {string} text - Raw text content
 * @returns {Array<string>} Array of channel IDs
 */
function parseBlocklist(text) {
  const channels = [];
  const lines = text.split('\n');

  for (let line of lines) {
    // Trim whitespace
    line = line.trim();

    // Skip empty lines and comments
    if (!line || line.startsWith('!')) {
      continue;
    }

    // Extract channel ID (support @handle or UCxxx format)
    if (line.startsWith('@') || line.startsWith('UC')) {
      channels.push(line);
    }
  }

  return channels;
}

/**
 * Fetch and parse a list file from GitHub
 * @param {string} url - URL to fetch
 * @returns {Promise<Array<string>>} Array of channel IDs
 */
async function fetchList(url) {
  const response = await fetch(url, {
    method: 'GET',
    cache: 'no-cache',
    headers: {
      'Accept': 'text/plain'
    }
  });

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  const text = await response.text();
  return parseBlocklist(text);
}

/**
 * Sync the community blocklist from GitHub
 * @returns {Promise<Object>} Sync result with statistics
 */
async function syncCommunityBlocklist() {
  console.log('Starting community blocklist sync...');

  try {
    // Check if community sync is enabled
    const settings = await browser.storage.local.get(['useCommunityList']);
    if (!settings.useCommunityList) {
      console.log('Community list disabled, skipping sync');
      return { success: false, reason: 'disabled' };
    }

    // Fetch both lists in parallel, keeping results separate so a partial failure
    // does not overwrite previously synced data with empty arrays
    const [blocklistResult, warnlistResult] = await Promise.allSettled([
      fetchList(BLOCKLIST_URL),
      fetchList(WARNLIST_URL)
    ]);

    const blocklistChannels = blocklistResult.status === 'fulfilled' ? blocklistResult.value : null;
    const warnlistChannels  = warnlistResult.status  === 'fulfilled' ? warnlistResult.value  : null;

    if (blocklistResult.status === 'rejected') console.warn('Failed to fetch blocklist:', blocklistResult.reason);
    if (warnlistResult.status  === 'rejected') console.warn('Failed to fetch warnlist:',  warnlistResult.reason);

    // Abort if both fetches failed — keep existing data intact
    if (blocklistChannels === null && warnlistChannels === null) {
      throw new Error('Both list fetches failed: ' + (blocklistResult.reason?.message || 'unknown'));
    }

    // Only overwrite each list if its fetch succeeded
    const updates = {
      communityListVersion: new Date().toISOString().split('T')[0],
      communityListUpdated: new Date().toISOString(),
      lastSyncTime: Date.now(),
      lastSyncSuccess: true
    };
    if (blocklistChannels !== null) updates.communityBlacklist = blocklistChannels;
    if (warnlistChannels  !== null) updates.communityMediumList = warnlistChannels;

    await browser.storage.local.set(updates);

    // Prune auto-added personal blocklist entries that are now covered by the
    // community list, so the user's personal blocklist doesn't grow forever.
    if (blocklistChannels !== null) {
      const existing = await browser.storage.local.get(['autoAddedBlocklist', 'blacklist']);
      const autoAdded = existing.autoAddedBlocklist || [];
      const blacklist = existing.blacklist || [];

      if (autoAdded.length > 0) {
        // Normalize community entries for matching (case-insensitive, ignore @ prefix)
        const communitySet = new Set(
          blocklistChannels.map(h => (h.startsWith('@') ? h.slice(1) : h).toLowerCase())
        );
        const isCovered = (handle) =>
          communitySet.has((handle.startsWith('@') ? handle.slice(1) : handle).toLowerCase());

        const remainingAutoAdded = autoAdded.filter(h => !isCovered(h));
        const prunedHandles = autoAdded.filter(isCovered);

        if (prunedHandles.length > 0) {
          const remainingBlacklist = blacklist.filter(h => !prunedHandles.includes(h));
          await browser.storage.local.set({
            autoAddedBlocklist: remainingAutoAdded,
            blacklist: remainingBlacklist
          });
          console.log(`Pruned ${prunedHandles.length} auto-added entries now covered by community list`);
        }
      }
    }

    console.log(`Community sync successful: ${(blocklistChannels || []).length} blocklist, ${(warnlistChannels || []).length} warnlist channels`);

    // Notify all tabs to reload
    const tabs = await browser.tabs.query({ url: 'https://www.youtube.com/*' });
    tabs.forEach(tab => {
      browser.tabs.sendMessage(tab.id, { action: 'reloadSettings' }).catch(() => {
        // Ignore errors for tabs where content script isn't loaded
      });
    });

    return {
      success: true,
      version: new Date().toISOString().split('T')[0],
      highConfidence: (blocklistChannels || []).length,
      mediumConfidence: (warnlistChannels || []).length,
      timestamp: Date.now()
    };

  } catch (error) {
    console.error('Community sync failed:', error);

    await browser.storage.local.set({
      lastSyncTime: Date.now(),
      lastSyncSuccess: false,
      lastSyncError: error.message
    });

    return {
      success: false,
      error: error.message,
      timestamp: Date.now()
    };
  }
}

/**
 * Get sync statistics
 * @returns {Promise<Object>} Sync statistics
 */
async function getSyncStats() {
  const data = await browser.storage.local.get([
    'communityBlacklist',
    'communityMediumList',
    'communityListVersion',
    'communityListUpdated',
    'lastSyncTime',
    'lastSyncSuccess',
    'lastSyncError',
    'useCommunityList'
  ]);

  return {
    enabled: data.useCommunityList || false,
    version: data.communityListVersion || 'unknown',
    listUpdated: data.communityListUpdated || 'unknown',
    lastSync: data.lastSyncTime || null,
    lastSuccess: data.lastSyncSuccess !== false,
    error: data.lastSyncError || null,
    highConfidenceCount: (data.communityBlacklist || []).length,
    mediumConfidenceCount: (data.communityMediumList || []).length
  };
}

/**
 * Force a manual sync
 * @returns {Promise<Object>} Sync result
 */
async function forceSync() {
  console.log('Manual sync triggered');
  return await syncCommunityBlocklist();
}

/**
 * Check if it's time to sync
 * @returns {Promise<boolean>} True if sync is needed
 */
async function shouldSync() {
  const data = await browser.storage.local.get(['lastSyncTime', 'useCommunityList']);

  if (!data.useCommunityList) {
    return false;
  }

  if (!data.lastSyncTime) {
    return true; // Never synced before
  }

  const hoursSinceLastSync = (Date.now() - data.lastSyncTime) / (1000 * 60 * 60);
  return hoursSinceLastSync >= SYNC_INTERVAL_HOURS;
}

/**
 * Initialize sync system with retry logic
 * @param {boolean} isFirstInstall - Whether this is a first install
 */
async function initializeSync(isFirstInstall = false) {
  console.log('Initializing community sync system', isFirstInstall ? '(first install)' : '');

  // Set up periodic sync alarm first
  browser.alarms.create('communitySync', {
    periodInMinutes: SYNC_INTERVAL_HOURS * 60
  });

  console.log(`Sync alarm created: every ${SYNC_INTERVAL_HOURS} hours`);

  // On first install, ensure sync happens with retry logic
  if (isFirstInstall) {
    console.log('First install detected - ensuring community list sync');

    // Add a small delay to ensure network is ready
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Try to sync with retry logic
    const maxRetries = 3;
    let attempt = 0;
    let syncSuccess = false;

    while (attempt < maxRetries && !syncSuccess) {
      attempt++;
      console.log(`Community sync attempt ${attempt}/${maxRetries}`);

      try {
        const result = await syncCommunityBlocklist();
        if (result.success) {
          syncSuccess = true;
          console.log('First install sync completed successfully');

          // Show success notification
          browser.notifications.create({
            type: 'basic',
            iconUrl: browser.runtime.getURL('icons/AiBlock_ico2_48tp.png'),
            title: 'AI Channel Blocker Ready',
            message: `Community list synced: ${result.highConfidence + result.mediumConfidence} channels loaded`
          });
        } else if (result.reason === 'disabled') {
          // Community list is disabled, don't retry
          console.log('Community list is disabled, skipping sync');
          syncSuccess = true; // Mark as "success" to stop retrying
          break;
        } else {
          throw new Error(result.error || result.reason || 'Sync failed');
        }
      } catch (error) {
        console.warn(`Sync attempt ${attempt} failed:`, error);

        // Wait before retrying (exponential backoff: 3s, 6s, 12s)
        if (attempt < maxRetries) {
          const delayMs = 3000 * Math.pow(2, attempt - 1);
          console.log(`Retrying in ${delayMs}ms...`);
          await new Promise(resolve => setTimeout(resolve, delayMs));
        }
      }
    }

    // If all retries failed, notify user
    if (!syncSuccess) {
      console.error('All sync attempts failed on first install');
      browser.notifications.create({
        type: 'basic',
        iconUrl: browser.runtime.getURL('icons/AiBlock_ico2_48tp.png'),
        title: 'AI Channel Blocker',
        message: 'Community list sync failed. Please click "Sync Now" in settings.'
      });
    }
  } else {
    // Not first install - check if we should sync immediately
    if (await shouldSync()) {
      console.log('Sync needed - triggering sync');
      await syncCommunityBlocklist();
    }
  }
}

// Listen for alarm
browser.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'communitySync') {
    console.log('Periodic sync alarm triggered');
    syncCommunityBlocklist();
  }
});

// Export functions for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    syncCommunityBlocklist,
    getSyncStats,
    forceSync,
    shouldSync,
    initializeSync
  };
}
