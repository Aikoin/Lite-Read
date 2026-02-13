document.addEventListener('DOMContentLoaded', () => {
  const fontSizeInput = document.getElementById('fontSize');
  const lineHeightInput = document.getElementById('lineHeight');
  const letterSpacingInput = document.getElementById('letterSpacing');
  const panguToggle = document.getElementById('panguToggle');
  
  const fontSizeVal = document.getElementById('fontSizeVal');
  const lineHeightVal = document.getElementById('lineHeightVal');
  const letterSpacingVal = document.getElementById('letterSpacingVal');
  
  const resetBtn = document.getElementById('resetBtn');
  const savePresetBtn = document.getElementById('savePresetBtn');
  const loadPresetBtn = document.getElementById('loadPresetBtn');

  // Define current version
  const LITE_READ_VERSION = 2;

  // Debounce utility to prevent performance issues
  function debounce(func, wait) {
    let timeout;
    return function(...args) {
      clearTimeout(timeout);
      timeout = setTimeout(() => func.apply(this, args), wait);
    };
  }

  // Helper to update visual progress of slider
  function updateSliderVisual(input) {
    const min = parseFloat(input.min);
    const max = parseFloat(input.max);
    const val = parseFloat(input.value);
    const percent = (val - min) * 100 / (max - min);
    input.style.setProperty('--percent', percent + '%');
  }

  // Helper to update text values
  function updateTextValues() {
    // Font Size: 0 is "Default", otherwise show relative change (e.g. "+2px" or "-2px")
    const fs = parseFloat(fontSizeInput.value);
    if (fs === 0) {
        fontSizeVal.textContent = '默认';
        fontSizeVal.style.color = '#8E8E93';
    } else {
        fontSizeVal.textContent = (fs > 0 ? '+' : '') + fs + 'px';
        fontSizeVal.style.color = '#007AFF'; // Highlight change
    }

    // Line Height: 0 is "Default"
    const lh = parseFloat(lineHeightInput.value);
    if (lh === 0) {
        lineHeightVal.textContent = '默认';
        lineHeightVal.style.color = '#8E8E93';
    } else {
        lineHeightVal.textContent = (lh > 0 ? '+' : '') + lh + 'px';
        lineHeightVal.style.color = '#007AFF';
    }

    // Letter Spacing: 0 is "Default"
    const ls = parseFloat(letterSpacingInput.value);
    if (ls === 0) {
        letterSpacingVal.textContent = '默认';
        letterSpacingVal.style.color = '#8E8E93';
    } else {
        letterSpacingVal.textContent = (ls > 0 ? '+' : '') + ls + 'px';
        letterSpacingVal.style.color = '#007AFF';
    }
    
    // Update visual progress for all sliders
    updateSliderVisual(fontSizeInput);
    updateSliderVisual(lineHeightInput);
    updateSliderVisual(letterSpacingInput);
  }

  // Initialize: Get styles from active tab
  chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
    if (tabs[0]) {
      const tabId = tabs[0].id;
      
      chrome.tabs.sendMessage(tabId, {action: "getStyles"}, (response) => {
        // Handle if script not injected or error
        if (chrome.runtime.lastError || !response) {
          // If no styles yet, just use defaults (0, 0, 0) which are set in HTML
          console.log("No existing styles found, using defaults");
          updateTextValues(); // Initialize visuals for defaults
        } else {
          // Check version and force upgrade if needed
          if (!response.version || response.version < LITE_READ_VERSION) {
            console.log("Old content script detected, upgrading...");
            injectScripts(tabId, () => {
                // Re-fetch styles after injection
                chrome.tabs.sendMessage(tabId, {action: "getStyles"}, (newResponse) => {
                    if (newResponse) {
                        applyStylesToUI(newResponse);
                    }
                });
            });
          } else {
            applyStylesToUI(response);
          }
        }
      });
    }
  });

  function applyStylesToUI(response) {
      if (response.fontSize !== undefined) fontSizeInput.value = parseFloat(response.fontSize);
      if (response.lineHeight !== undefined) lineHeightInput.value = parseFloat(response.lineHeight);
      if (response.letterSpacing !== undefined) letterSpacingInput.value = parseFloat(response.letterSpacing);
      if (response.pangu !== undefined) panguToggle.checked = response.pangu;
      updateTextValues();
  }

  function injectScripts(tabId, callback) {
      chrome.scripting.executeScript({
        target: {tabId: tabId},
        files: ['pangu.min.js', 'content.js']
      }, () => {
        if (chrome.runtime.lastError) {
          console.error("Injection failed: " + chrome.runtime.lastError.message);
        } else {
          console.log("Scripts injected/upgraded successfully");
          if (callback) callback();
        }
      });
  }

  // Send to tab with a short delay for responsiveness
  const sendToTab = debounce((settings) => {
    chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
      if (tabs[0]) {
        const tabId = tabs[0].id;
        
        // Helper to send message
        const sendMessage = () => {
          chrome.tabs.sendMessage(tabId, {
            action: "updateStyles",
            ...settings
          }, (response) => {
            // Check if script is not injected OR if version is old
            if (chrome.runtime.lastError || (response && (!response.version || response.version < LITE_READ_VERSION))) {
              console.log("Script issue detected (missing or old), injecting now...");
              injectScripts(tabId, () => {
                  // Retry sending message after injection
                  setTimeout(() => {
                    chrome.tabs.sendMessage(tabId, {
                      action: "updateStyles",
                      ...settings
                    });
                  }, 50);
              });
            }
          });
        };

        sendMessage();
      }
    });
  }, 50);

  function updateUI() {
    updateTextValues();

    const settings = {
      fontSize: fontSizeInput.value,
      lineHeight: lineHeightInput.value,
      letterSpacing: letterSpacingInput.value,
      pangu: panguToggle.checked
    };

    // Note: We NO LONGER save to storage.sync on every update
    // This allows per-tab settings without overwriting global state
    sendToTab(settings);
  }

  fontSizeInput.addEventListener('input', updateUI);
  lineHeightInput.addEventListener('input', updateUI);
  letterSpacingInput.addEventListener('input', updateUI);
  panguToggle.addEventListener('change', updateUI);

  resetBtn.addEventListener('click', () => {
    // Reset to 0 (Default)
    fontSizeInput.value = 0;
    lineHeightInput.value = 0;
    letterSpacingInput.value = 0;
    panguToggle.checked = false;
    updateUI();
  });

  // Save Preset
  savePresetBtn.addEventListener('click', () => {
    const settings = {
      fontSize: fontSizeInput.value,
      lineHeight: lineHeightInput.value,
      letterSpacing: letterSpacingInput.value,
      pangu: panguToggle.checked
    };
    
    chrome.storage.sync.set({userPreset: settings}, () => {
      // Visual feedback
      const originalText = savePresetBtn.textContent;
      savePresetBtn.textContent = "已保存";
      setTimeout(() => {
        savePresetBtn.textContent = originalText;
      }, 1500);
    });
  });

  // Load Preset
  loadPresetBtn.addEventListener('click', () => {
    chrome.storage.sync.get(['userPreset'], (result) => {
      if (result.userPreset) {
        fontSizeInput.value = result.userPreset.fontSize;
        lineHeightInput.value = result.userPreset.lineHeight;
        letterSpacingInput.value = result.userPreset.letterSpacing;
        if (result.userPreset.pangu !== undefined) {
            panguToggle.checked = result.userPreset.pangu;
        }
        updateUI(); // This updates text and sends to tab
        
        // Visual feedback
        const originalText = loadPresetBtn.textContent;
        loadPresetBtn.textContent = "已应用";
        setTimeout(() => {
          loadPresetBtn.textContent = originalText;
        }, 1500);
      } else {
        // Visual feedback for no preset
        const originalText = loadPresetBtn.textContent;
        loadPresetBtn.textContent = "无预设";
        setTimeout(() => {
          loadPresetBtn.textContent = originalText;
        }, 1500);
      }
    });
  });
});
