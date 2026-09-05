// AI Channel Blocker - Popup Script

document.addEventListener('DOMContentLoaded', () => {
  const usernameInput = document.getElementById('username');
  const anonymousToggle = document.getElementById('anonymousSubmit');
  const blockModeSelect = document.getElementById('blockMode');
  const useCommunityListToggle = document.getElementById('useCommunityList');
  const autoBlocklistToggle = document.getElementById('autoBlocklistOnSubmit');
  const bannerModeControl = document.getElementById('bannerMode');
  const syncNowBtn = document.getElementById('syncNow');
  const syncStatus = document.getElementById('syncStatus');
  const darkModeToggle = document.getElementById('darkModeToggle');

  // Main tab elements
  const mainTabBtns = document.querySelectorAll('.tab');
  const mainTabContents = document.querySelectorAll('.tab-content');

  // Sub-tab elements (within Settings tab)
  const subTabBtns = document.querySelectorAll('.sub-tab');
  const subTabContents = document.querySelectorAll('.subtab-content');

  // Channel list tab elements
  const tabBtns = document.querySelectorAll('.tab-btn');
  const tabContents = document.querySelectorAll('.tab-content');

  // More menu elements
  const moreBtn = document.getElementById('moreBtn');
  const moreMenu = document.getElementById('moreMenu');

  // Username modal elements
  const editUsernameBtn = document.getElementById('editUsernameBtn');
  const usernameModal = document.getElementById('usernameModal');
  const saveUsernameBtn = document.getElementById('saveUsernameBtn');
  const cancelUsernameBtn = document.getElementById('cancelUsernameBtn');
  const submitUsername = document.getElementById('submitUsername');

  // List elements
  const blacklistChannels = document.getElementById('blacklistChannels');
  const warnlistChannels = document.getElementById('warnlistChannels');
  const whitelistChannels = document.getElementById('whitelistChannels');
  const blacklistEmpty = document.getElementById('blacklistEmpty');
  const warnlistEmpty = document.getElementById('warnlistEmpty');
  const whitelistEmpty = document.getElementById('whitelistEmpty');

  // Stats
  const blacklistCountSpan = document.getElementById('blacklistCount');
  const blacklistManualCountSpan = document.getElementById('blacklistManualCount');
  const blacklistPendingCountSpan = document.getElementById('blacklistPendingCount');
  const warnlistCountSpan = document.getElementById('warnlistCount');
  const whitelistCountSpan = document.getElementById('whitelistCount');
  const communityCountSpan = document.getElementById('communityCount');
  const videosHiddenSpan = document.getElementById('videosHidden');

  // Buttons
  const clearAllBtn = document.getElementById('clearAll');
  const exportDataBtn = document.getElementById('exportData');
  const importDataBtn = document.getElementById('importData');
  const notification = document.getElementById('notification');

  // Submit tab elements
  const submitTabBtn = document.querySelector('.tab[data-tab="submit"]');
  const submitChannelHandle = document.getElementById('submitChannelHandle');
  const submitVideoUrl = document.getElementById('submitVideoUrl');
  const submitChannelBtn = document.getElementById('submitChannel');
  const submitStatus = document.getElementById('submitStatus');

  // Main tab switching
  mainTabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetTab = btn.getAttribute('data-tab');

      // Update active states
      mainTabBtns.forEach(b => b.classList.remove('active'));
      mainTabContents.forEach(c => c.classList.remove('active'));

      btn.classList.add('active');
      document.getElementById(targetTab).classList.add('active');
    });
  });

  // Sub-tab switching (within Channels tab)
  subTabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetSubTab = btn.getAttribute('data-subtab');

      // Update active states
      subTabBtns.forEach(b => b.classList.remove('active'));
      subTabContents.forEach(c => c.classList.remove('active'));

      btn.classList.add('active');
      document.getElementById(`${targetSubTab}-content`).classList.add('active');
    });
  });

  // Channel list tab switching (within Channel Management)
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetTab = btn.getAttribute('data-tab');

      // Update active states
      tabBtns.forEach(b => b.classList.remove('active'));
      tabContents.forEach(c => c.classList.remove('active'));

      btn.classList.add('active');
      document.getElementById(`${targetTab}-tab`).classList.add('active');
    });
  });

  // Dark mode functionality (dark is default, light-mode class for light)
  function loadDarkMode() {
    browser.storage.local.get(['darkMode']).then(result => {
      // Default to dark mode (true) on first install
      const darkMode = result.darkMode === undefined ? true : result.darkMode;

      // Save default if not set
      if (result.darkMode === undefined) {
        browser.storage.local.set({ darkMode: true });
      }

      if (!darkMode) {
        document.body.classList.add('light-mode');
      } else {
        document.body.classList.remove('light-mode');
      }
    });
  }

  darkModeToggle.addEventListener('click', () => {
    const isLightMode = document.body.classList.toggle('light-mode');
    const darkMode = !isLightMode;
    browser.storage.local.set({ darkMode: darkMode });
  });

  // Load settings
  function loadSettings() {
    browser.storage.local.get([
      'username',
      'anonymousSubmit',
      'blockMode',
      'useCommunityList',
      'autoBlocklistOnSubmit',
      'bannerMode',
      'autoAddedBlocklist',
      'blacklist',
      'warnlist',
      'whitelist',
      'communityBlacklist',
      'communityMediumList',
      'blockedChannels', // Legacy support
      'videosHidden',
      'submitFormChannelHandle',
      'submitFormVideoUrl'
    ]).then(result => {
      usernameInput.value = result.username || '';
      const isAnonymous = result.anonymousSubmit || false;
      if (isAnonymous) {
        anonymousToggle.classList.add('active');
        editUsernameBtn.style.display = 'none';
      } else {
        anonymousToggle.classList.remove('active');
        editUsernameBtn.style.display = '';
      }
      blockModeSelect.value = result.blockMode || 'hide';

      // Set community list toggle state
      const useCommunityList = result.useCommunityList !== false;
      if (useCommunityList) {
        useCommunityListToggle.classList.add('active');
      } else {
        useCommunityListToggle.classList.remove('active');
      }

      // Set auto-blocklist toggle state
      if (result.autoBlocklistOnSubmit) {
        autoBlocklistToggle.classList.add('active');
      } else {
        autoBlocklistToggle.classList.remove('active');
      }
      // Dim the toggle when community list is off — the prune-on-sync step
      // that makes this feature bounded requires the community list to be enabled.
      updateAutoBlocklistAvailability(useCommunityList);

      // AI-flag banner mode (off | ai | all), default 'ai'.
      renderBannerMode(result.bannerMode || 'ai');

      // Show/hide submit tab based on community list setting
      updateSubmitTabVisibility(useCommunityList);

      // Update submit username display
      updateSubmitUsernameDisplay(result.username, result.anonymousSubmit);

      // Restore submit form values
      submitChannelHandle.value = result.submitFormChannelHandle || '';
      submitVideoUrl.value = result.submitFormVideoUrl || '';

      // Support legacy blockedChannels or use new lists
      const blacklist = result.blacklist || result.blockedChannels || [];
      const warnlist = result.warnlist || [];
      const whitelist = result.whitelist || [];
      const communityBlacklist = result.communityBlacklist || [];
      const communityWarnlist = result.communityMediumList || [];
      const autoAdded = result.autoAddedBlocklist || [];
      const pendingCount = autoAdded.filter(h => blacklist.includes(h)).length;
      const manualCount = Math.max(blacklist.length - pendingCount, 0);

      blacklistCountSpan.textContent = blacklist.length;
      blacklistManualCountSpan.textContent = manualCount;
      blacklistPendingCountSpan.textContent = pendingCount;
      warnlistCountSpan.textContent = warnlist.length;
      whitelistCountSpan.textContent = whitelist.length;
      communityCountSpan.textContent = communityBlacklist.length + communityWarnlist.length;
      videosHiddenSpan.textContent = result.videosHidden || 0;

      renderChannelLists(blacklist, warnlist, whitelist);
      updateSyncStatus();
    });
  }

  // Update sync status display
  function updateSyncStatus() {
    browser.runtime.sendMessage({ action: 'getSyncStats' }).then(stats => {
      if (!stats.enabled) {
        syncStatus.textContent = 'Community list disabled';
        syncStatus.className = 'sync-status disabled';
        return;
      }

      if (stats.lastSync) {
        const hoursAgo = Math.floor((Date.now() - stats.lastSync) / (1000 * 60 * 60));

        let statusText = '';
        if (hoursAgo < 1) {
          statusText = 'Synced';
        } else if (hoursAgo < 24) {
          statusText = `${hoursAgo}h ago`;
        } else {
          statusText = `${Math.floor(hoursAgo / 24)}d ago`;
        }

        statusText += ` • ${stats.highConfidenceCount + stats.mediumConfidenceCount} channels`;

        syncStatus.textContent = statusText;
        syncStatus.className = stats.lastSuccess ? 'sync-status success' : 'sync-status error';
      } else {
        syncStatus.textContent = 'Never synced';
        syncStatus.className = 'sync-status warning';
      }
    }).catch(() => {
      syncStatus.textContent = 'Sync status unavailable';
      syncStatus.className = 'sync-status error';
    });
  }

  // Render channel lists
  function renderChannelLists(blacklist, warnlist, whitelist) {
    renderList(blacklist, blacklistChannels, blacklistEmpty, 'blacklist');
    renderList(warnlist, warnlistChannels, warnlistEmpty, 'warnlist');
    renderList(whitelist, whitelistChannels, whitelistEmpty, 'whitelist');
  }

  // Render a single list
  function renderList(channels, container, emptyState, listType) {
    if (channels.length === 0) {
      container.style.display = 'none';
      emptyState.style.display = 'block';
      return;
    }

    container.style.display = 'block';
    emptyState.style.display = 'none';
    container.textContent = '';

    const moveTargets = [
      { list: 'blacklist', label: 'Move to Blacklist', icon: '🚫' },
      { list: 'warnlist',  label: 'Move to Warnlist',  icon: '⚠️' },
      { list: 'whitelist', label: 'Move to Whitelist', icon: '✓' }
    ];

    channels.forEach(channelId => {
      const item = document.createElement('div');
      item.className = 'channel-item';

      const idSpan = document.createElement('span');
      idSpan.className = 'channel-id';
      idSpan.textContent = channelId;
      item.appendChild(idSpan);

      const actions = document.createElement('div');
      actions.className = 'channel-actions';

      moveTargets.forEach(t => {
        if (listType === t.list) return;
        const btn = document.createElement('button');
        btn.className = 'move-btn';
        btn.title = t.label;
        btn.textContent = t.icon;
        btn.addEventListener('click', () => moveChannel(channelId, t.list));
        actions.appendChild(btn);
      });

      const removeBtn = document.createElement('button');
      removeBtn.className = 'remove-btn';
      removeBtn.title = 'Remove';
      removeBtn.textContent = '✕';
      removeBtn.addEventListener('click', () => removeChannel(channelId, listType));
      actions.appendChild(removeBtn);

      item.appendChild(actions);
      container.appendChild(item);
    });
  }

  // Show notification
  function showNotification(message, type = 'success') {
    notification.textContent = message;
    notification.className = `notification ${type} show`;

    setTimeout(() => {
      notification.classList.remove('show');
    }, 3000);
  }

  // Save username
  usernameInput.addEventListener('change', () => {
    const username = usernameInput.value.trim();
    browser.storage.local.set({ username }).then(() => {
      showNotification('Username saved');
    });
  });

  // Anonymous submission toggle
  anonymousToggle.addEventListener('click', () => {
    const anonymousSubmit = !anonymousToggle.classList.contains('active');
    anonymousToggle.classList.toggle('active');
    editUsernameBtn.style.display = anonymousSubmit ? 'none' : '';
    browser.storage.local.get(['username']).then(result => {
      browser.storage.local.set({ anonymousSubmit }).then(() => {
        showNotification(anonymousSubmit ? 'Anonymous mode enabled' : 'Anonymous mode disabled');
        updateSubmitUsernameDisplay(result.username, anonymousSubmit);
        notifyContentScript();
      });
    });
  });

  // AI-flag banner mode: highlight the active segment.
  function renderBannerMode(mode) {
    if (!bannerModeControl) return;
    const valid = ['off', 'ai', 'all'].includes(mode) ? mode : 'ai';
    bannerModeControl.querySelectorAll('.segment').forEach(seg => {
      seg.classList.toggle('active', seg.dataset.value === valid);
    });
  }

  if (bannerModeControl) {
    bannerModeControl.addEventListener('click', (e) => {
      const seg = e.target.closest('.segment');
      if (!seg) return;
      const mode = seg.dataset.value;
      renderBannerMode(mode);
      browser.storage.local.set({ bannerMode: mode }).then(() => {
        const labels = { off: 'AI-flag banner off', ai: 'AI-flag banner: AI only', all: 'AI-flag banner: AI + synthetic' };
        showNotification(labels[mode] || 'AI-flag banner updated');
        notifyContentScript();
      });
    });
  }

  // Save block mode
  blockModeSelect.addEventListener('change', () => {
    const blockMode = blockModeSelect.value;
    browser.storage.local.set({ blockMode }).then(() => {
      showNotification('Block mode updated');
      notifyContentScript();
    });
  });

  // Update submit tab visibility based on community list setting
  function updateSubmitTabVisibility(enabled) {
    if (enabled) {
      submitTabBtn.style.display = '';
    } else {
      submitTabBtn.style.display = 'none';
      // If currently on submit tab, switch to settings tab
      if (submitTabBtn.classList.contains('active')) {
        const settingsTab = document.querySelector('.tab[data-tab="settings"]');
        mainTabBtns.forEach(b => b.classList.remove('active'));
        mainTabContents.forEach(c => c.classList.remove('active'));
        settingsTab.classList.add('active');
        document.getElementById('settings').classList.add('active');
      }
    }
  }

  // Save community list setting (toggle div instead of checkbox)
  useCommunityListToggle.addEventListener('click', () => {
    const useCommunityList = !useCommunityListToggle.classList.contains('active');
    useCommunityListToggle.classList.toggle('active');

    browser.storage.local.set({ useCommunityList }).then(() => {
      showNotification(useCommunityList ? 'Community list enabled' : 'Community list disabled');
      notifyContentScript();
      updateSyncStatus();
      updateSubmitTabVisibility(useCommunityList);
      updateAutoBlocklistAvailability(useCommunityList);
    });
  });

  // Save auto-blocklist setting: adds submitted channels to personal blocklist
  // until they appear in the community list after syncing
  autoBlocklistToggle.addEventListener('click', () => {
    // Ignore clicks when disabled (community list off)
    if (autoBlocklistToggle.classList.contains('disabled')) return;

    const autoBlocklistOnSubmit = !autoBlocklistToggle.classList.contains('active');
    autoBlocklistToggle.classList.toggle('active');

    browser.storage.local.set({ autoBlocklistOnSubmit }).then(() => {
      showNotification(autoBlocklistOnSubmit
        ? 'Submitted channels will be auto-blocklisted'
        : 'Auto-blocklist disabled');
    });
  });

  // Dim the auto-blocklist toggle when community list is off. Turning the
  // community list off also clears the auto-blocklist setting, because the
  // prune-on-sync mechanism that bounds this feature needs the community list.
  function updateAutoBlocklistAvailability(communityListEnabled) {
    if (communityListEnabled) {
      autoBlocklistToggle.classList.remove('disabled');
    } else {
      autoBlocklistToggle.classList.add('disabled');
      if (autoBlocklistToggle.classList.contains('active')) {
        autoBlocklistToggle.classList.remove('active');
        browser.storage.local.set({ autoBlocklistOnSubmit: false });
      }
    }
  }

  // Manual sync button
  syncNowBtn.addEventListener('click', () => {
    syncNowBtn.disabled = true;
    syncNowBtn.textContent = 'Syncing...';
    syncStatus.textContent = 'Syncing with community list...';
    syncStatus.className = 'sync-status syncing';

    browser.runtime.sendMessage({ action: 'syncCommunityList' }).then(result => {
      if (result && result.success) {
        showNotification(`Synced ${result.highConfidence} blocklist, ${result.mediumConfidence} warnlist channels`);
        loadSettings(); // Reload to update counts
      } else {
        showNotification('Sync failed: ' + (result && result.error ? result.error : 'Unknown error'), 'error');
      }
    }).catch(error => {
      showNotification('Sync failed: ' + error.message, 'error');
    }).finally(() => {
      syncNowBtn.disabled = false;
      syncNowBtn.textContent = 'Sync Now';
      updateSyncStatus();
    });
  });

  // Save submit form values as user types
  submitChannelHandle.addEventListener('input', () => {
    browser.storage.local.set({ submitFormChannelHandle: submitChannelHandle.value });
  });

  submitVideoUrl.addEventListener('input', () => {
    browser.storage.local.set({ submitFormVideoUrl: submitVideoUrl.value });
  });

  // Submit channel to community blocklist
  submitChannelBtn.addEventListener('click', async () => {
    // Get values
    let channelHandle = submitChannelHandle.value.trim();
    const videoUrl = submitVideoUrl.value.trim();
    const isAnonymous = anonymousToggle.classList.contains('active');
    const username = isAnonymous ? 'Anonymous' : usernameInput.value.trim();

    // Reset status
    submitStatus.className = 'submit-status';
    submitStatus.textContent = '';

    // Validation
    if (!isAnonymous && !username) {
      submitStatus.className = 'submit-status error';
      submitStatus.textContent = 'Please set your username first';
      return;
    }

    if (!channelHandle) {
      submitStatus.className = 'submit-status error';
      submitStatus.textContent = 'Please enter a channel handle';
      return;
    }

    // Check if user pasted a URL instead of a channel handle
    if (channelHandle.includes('youtube.com/') || channelHandle.includes('youtu.be/')) {
      // Try to extract channel handle from URL (supports Unicode characters)
      const urlPatterns = [
        /youtube\.com\/@([^\/\s?#]+)/,        // /@handle
        /youtube\.com\/c\/([^\/\s?#]+)/,      // /c/customname
        /youtube\.com\/user\/([^\/\s?#]+)/,   // /user/username
        /youtube\.com\/channel\/([\w-]+)/,    // /channel/UCxxx
      ];

      let extracted = null;
      for (const pattern of urlPatterns) {
        const match = channelHandle.match(pattern);
        if (match) {
          extracted = match[1];
          break;
        }
      }

      if (extracted) {
        channelHandle = '@' + extracted;
        // Update the input field with the extracted handle
        submitChannelHandle.value = channelHandle;
        browser.storage.local.set({ submitFormChannelHandle: channelHandle });
      } else {
        submitStatus.className = 'submit-status error';
        submitStatus.textContent = 'Could not extract channel handle from URL. Please enter @channelhandle';
        return;
      }
    } else {
      // Validate channel handle format (should be @handle or just handle)
      // Remove @ if present for validation, then add it back
      const handleWithoutAt = channelHandle.startsWith('@') ? channelHandle.slice(1) : channelHandle;

      // Check for invalid characters (allow alphanumeric, Unicode letters, dots, underscores, hyphens)
      if (!/^[\p{L}\p{N}._-]+$/u.test(handleWithoutAt)) {
        submitStatus.className = 'submit-status error';
        submitStatus.textContent = 'Invalid channel handle format. Use @channelhandle';
        return;
      }

      // Ensure channel handle starts with @
      if (!channelHandle.startsWith('@')) {
        channelHandle = '@' + channelHandle;
      }
    }

    if (!videoUrl) {
      submitStatus.className = 'submit-status error';
      submitStatus.textContent = 'Please enter a video URL as evidence';
      return;
    }

    // Validate video URL format
    if (!videoUrl.includes('youtube.com/watch') && !videoUrl.includes('youtu.be/') && !videoUrl.includes('youtube.com/shorts/')) {
      submitStatus.className = 'submit-status error';
      submitStatus.textContent = 'Please enter a valid YouTube video URL';
      return;
    }

    // Normalize channel handle for duplicate checking (lowercase, without @)
    const normalizedHandle = channelHandle.startsWith('@') ? channelHandle.slice(1).toLowerCase() : channelHandle.toLowerCase();

    // Check if channel was already submitted
    const storageData = await browser.storage.local.get(['submittedChannels', 'whitelist', 'communityBlacklist', 'useCommunityList']);
    const submittedChannels = storageData.submittedChannels || [];
    if (submittedChannels.includes(normalizedHandle)) {
      submitStatus.className = 'submit-status error';
      submitStatus.textContent = 'Channel already submitted';
      return;
    }

    // On-list guard: refuse submissions that are redundant (already on
    // the active community list) or contradictory (on the whitelist).
    const whitelist = (storageData.whitelist || []).map(h => h.replace(/^@/, '').toLowerCase());
    if (whitelist.includes(normalizedHandle)) {
      submitStatus.className = 'submit-status error';
      submitStatus.textContent = 'Channel is on your whitelist';
      return;
    }
    if (storageData.useCommunityList !== false) {
      const community = (storageData.communityBlacklist || []).map(h => h.replace(/^@/, '').toLowerCase());
      if (community.includes(normalizedHandle)) {
        submitStatus.className = 'submit-status error';
        submitStatus.textContent = 'Channel is already on the community list';
        return;
      }
    }

    // Show loading state
    submitStatus.className = 'submit-status loading';
    submitStatus.textContent = 'Submitting...';
    submitChannelBtn.disabled = true;

    try {
      const response = await fetch('https://api.aisloplist.com', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          channel_handle: channelHandle,
          video_url: videoUrl,
          username: username
        })
      });

      const responseData = await response.json().catch(() => ({}));

      if (response.ok) {
        submitStatus.className = 'submit-status success';
        submitStatus.textContent = responseData.message || 'Channel submitted successfully!';
        // Clear form and stored values
        submitChannelHandle.value = '';
        submitVideoUrl.value = '';
        browser.storage.local.remove(['submitFormChannelHandle', 'submitFormVideoUrl']);

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
        submitStatus.className = 'submit-status error';
        if (response.status === 502) {
          submitStatus.textContent = 'API Offline. Try again later.';
        } else if (response.status === 429) {
          submitStatus.textContent = 'Rate limit reached. Try again later.';
        } else if (response.status === 403) {
          submitStatus.textContent = 'Banned from submitting.';
        } else {
          submitStatus.textContent = responseData.message || `Submission failed (${response.status}). Please try again.`;
        }
      }
    } catch (error) {
      submitStatus.className = 'submit-status error';
      submitStatus.textContent = 'Network error. Please try again.';
    } finally {
      submitChannelBtn.disabled = false;
    }
  });

  // Move channel to a different list
  function moveChannel(channelId, targetList) {
    browser.storage.local.get(['blacklist', 'warnlist', 'whitelist']).then(result => {
      let blacklist = result.blacklist || [];
      let warnlist = result.warnlist || [];
      let whitelist = result.whitelist || [];

      // Remove from all lists
      blacklist = blacklist.filter(id => id !== channelId);
      warnlist = warnlist.filter(id => id !== channelId);
      whitelist = whitelist.filter(id => id !== channelId);

      // Add to target list
      if (targetList === 'blacklist') {
        blacklist.push(channelId);
      } else if (targetList === 'warnlist') {
        warnlist.push(channelId);
      } else if (targetList === 'whitelist') {
        whitelist.push(channelId);
      }

      browser.storage.local.set({ blacklist, warnlist, whitelist }).then(() => {
        showNotification(`Channel moved to ${targetList}`);
        loadSettings();
        notifyContentScript();
      });
    });
  }

  // Remove channel from a list
  function removeChannel(channelId, listType) {
    browser.storage.local.get([listType]).then(result => {
      const list = result[listType] || [];
      const updated = list.filter(id => id !== channelId);

      browser.storage.local.set({ [listType]: updated }).then(() => {
        showNotification('Channel removed');
        loadSettings();
        notifyContentScript();
      });
    });
  }

  // Add channel to a list
  function addChannel(channelHandle, listType) {
    // Trim whitespace
    channelHandle = channelHandle.trim();

    // Validate format: must start with @
    if (!channelHandle) {
      showNotification('Please enter a channel handle', 'error');
      return;
    }

    if (!channelHandle.startsWith('@')) {
      showNotification('Channel handle must start with @ (e.g., @channelname)', 'error');
      return;
    }

    // Validate handle is not empty after removing @
    if (channelHandle.length < 2) {
      showNotification('Please enter a valid channel handle after @', 'error');
      return;
    }

    // Canonical storage form: @-stripped, lowercased. Matches every other
    // write path (content script, context menu, auto-blocklist) so the same
    // channel can't end up stored in two different formats.
    channelHandle = channelHandle.substring(1).toLowerCase();

    browser.storage.local.get([listType]).then(result => {
      const list = result[listType] || [];

      // Check if already in list (case-insensitive against legacy entries)
      if (list.some(h => h.toLowerCase().replace(/^@/, '') === channelHandle)) {
        showNotification(`Channel already in ${listType}`, 'error');
        return;
      }

      // Add to list
      list.push(channelHandle);

      browser.storage.local.set({ [listType]: list }).then(() => {
        showNotification(`Channel added to ${listType}`);
        loadSettings();
        notifyContentScript();

        // Clear input field
        const inputId = `${listType}Input`;
        const input = document.getElementById(inputId);
        if (input) {
          input.value = '';
        }
      });
    });
  }

  // Add event listeners for add buttons
  document.getElementById('addToBlacklist').addEventListener('click', () => {
    const input = document.getElementById('blacklistInput');
    addChannel(input.value, 'blacklist');
  });

  document.getElementById('addToWarnlist').addEventListener('click', () => {
    const input = document.getElementById('warnlistInput');
    addChannel(input.value, 'warnlist');
  });

  document.getElementById('addToWhitelist').addEventListener('click', () => {
    const input = document.getElementById('whitelistInput');
    addChannel(input.value, 'whitelist');
  });

  // Allow Enter key to add channel
  document.getElementById('blacklistInput').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      addChannel(e.target.value, 'blacklist');
    }
  });

  document.getElementById('warnlistInput').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      addChannel(e.target.value, 'warnlist');
    }
  });

  document.getElementById('whitelistInput').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      addChannel(e.target.value, 'whitelist');
    }
  });

  // Clear all lists
  clearAllBtn.addEventListener('click', () => {
    if (confirm('Are you sure you want to clear all channel lists (blacklist, warnlist, and whitelist)?')) {
      browser.storage.local.set({
        blacklist: [],
        warnlist: [],
        whitelist: [],
        blockedChannels: [], // Legacy support
        videosHidden: 0
      }).then(() => {
        showNotification('All lists cleared');
        loadSettings();
        notifyContentScript();
      });
    }
  });

  // Export data
  exportDataBtn.addEventListener('click', () => {
    // Only export user data, not community lists (they're synced from GitHub)
    browser.storage.local.get([
      'username',
      'blacklist',
      'warnlist',
      'whitelist',
      'blockMode',
      'useCommunityList',
      'videosHidden',
      'darkMode',
      'blockedChannels' // Legacy support
    ]).then(data => {
      const dataStr = JSON.stringify(data, null, 2);
      const blob = new Blob([dataStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);

      const a = document.createElement('a');
      a.href = url;
      a.download = `ai-blocker-data-${Date.now()}.json`;
      a.click();

      URL.revokeObjectURL(url);
      showNotification('User data exported successfully');
    });
  });

  // Import handler is platform-specific — Chrome keeps it inline (FileReader +
  // drag-drop), Firefox opens import.html in a tab because its popup closes as
  // soon as a file picker opens. Implementation lives in popup-platform.js,
  // loaded before this script.
  initPlatformImport({
    importDataBtn,
    showNotification,
    loadDarkMode,
    loadSettings,
    notifyContentScript,
  });

  // More menu toggle
  moreBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    moreMenu.classList.toggle('show');
  });

  // Close more menu when clicking outside
  document.addEventListener('click', (e) => {
    if (!moreBtn.contains(e.target) && !moreMenu.contains(e.target)) {
      moreMenu.classList.remove('show');
    }
  });

  // Close more menu when clicking on menu items
  moreMenu.addEventListener('click', () => {
    moreMenu.classList.remove('show');
  });

  // Username modal handlers
  editUsernameBtn.addEventListener('click', () => {
    usernameModal.classList.add('show');
    usernameInput.focus();
  });

  cancelUsernameBtn.addEventListener('click', () => {
    usernameModal.classList.remove('show');
    // Reset input to stored value
    browser.storage.local.get(['username']).then(result => {
      usernameInput.value = result.username || '';
    });
  });

  saveUsernameBtn.addEventListener('click', () => {
    const username = usernameInput.value.trim();
    browser.storage.local.get(['anonymousSubmit']).then(result => {
      browser.storage.local.set({ username }).then(() => {
        showNotification('Username saved');
        updateSubmitUsernameDisplay(username, result.anonymousSubmit);
        usernameModal.classList.remove('show');
        notifyContentScript();
      });
    });
  });

  // Update submit username display
  function updateSubmitUsernameDisplay(username, isAnonymous) {
    if (submitUsername) {
      if (isAnonymous) {
        submitUsername.textContent = 'Anonymous';
      } else if (username) {
        submitUsername.textContent = username;
      } else {
        submitUsername.textContent = 'Not set';
      }
    }
  }

  // Notify content script to reload settings
  function notifyContentScript() {
    // Notify ALL YouTube tabs, not just the active one
    browser.tabs.query({ url: 'https://www.youtube.com/*' }).then(tabs => {
      tabs.forEach(tab => {
        browser.tabs.sendMessage(tab.id, { action: 'reloadSettings' }).catch(() => {
          // Ignore errors if content script is not loaded
        });
      });
    });
  }

  // When auto-blocklist is enabled, add the submitted channel to the personal
  // blocklist. Tracked in autoAddedBlocklist so it can be pruned once the
  // channel appears in the community list after syncing.
  async function autoBlocklistChannel(channelHandle) {
    const data = await browser.storage.local.get([
      'autoBlocklistOnSubmit', 'blacklist', 'warnlist', 'whitelist', 'autoAddedBlocklist'
    ]);
    if (!data.autoBlocklistOnSubmit) return;

    const handle = channelHandle.startsWith('@') ? channelHandle : '@' + channelHandle;
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
    notifyContentScript();
    loadSettings();
  }

  // Check if sync is needed and auto-sync if necessary
  function checkAndAutoSync() {
    browser.storage.local.get(['useCommunityList', 'lastSyncTime']).then(result => {
      // Only auto-sync if community list is enabled
      if (!result.useCommunityList) {
        return;
      }

      // Check if last sync was more than 24 hours ago (or never synced)
      const now = Date.now();
      const lastSync = result.lastSyncTime || 0;
      const hoursSinceLastSync = (now - lastSync) / (1000 * 60 * 60);

      if (hoursSinceLastSync >= 24) {
        // Trigger sync in background without showing UI feedback
        browser.runtime.sendMessage({ action: 'syncCommunityList' }).then(() => {
          // Reload settings to update counts
          loadSettings();
        });
      }
    });
  }

  // Listen for storage changes (e.g., when background sync completes)
  browser.storage.onChanged.addListener((changes, area) => {
    if (area === 'local') {
      // Refresh if community lists were updated, or if the personal lists
      // changed from another surface (banner, keyboard shortcut, context menu,
      // auto-blocklist) while the popup is open.
      if (changes.communityBlacklist || changes.communityMediumList || changes.lastSyncTime
          || changes.blacklist || changes.warnlist || changes.whitelist) {
        loadSettings();
      }
    }
  });

  // Initialize
  loadDarkMode();
  loadSettings();
  checkAndAutoSync();
});
