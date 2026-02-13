// Version control for hot-update
const LITE_READ_VERSION = 9;

// Allow re-injection if version is newer, or first injection
if (typeof window.liteReadVersion === 'undefined' || window.liteReadVersion < LITE_READ_VERSION) {
  window.liteReadInjected = true;
  window.liteReadVersion = LITE_READ_VERSION;

  // WeakMap to store original COMPUTED styles for reversibility
  // Key: DOM Node, Value: { fontSize: '16px', lineHeight: '24px', letterSpacing: 'normal' }
  if (typeof window.liteReadOriginalStyles === 'undefined') {
      window.liteReadOriginalStyles = new WeakMap();
  }
  
  // Track if pangu is currently applied
  if (typeof window.liteReadPanguApplied === 'undefined') {
      window.liteReadPanguApplied = false;
  }

  // Track if we have applied ANY style adjustments
  if (typeof window.liteReadStylesApplied === 'undefined') {
      window.liteReadStylesApplied = false;
  }
  
  // Store current state for popup sync
  if (typeof window.liteReadState === 'undefined') {
      window.liteReadState = {
          fontSizeDelta: 0,
          lineHeightDelta: 0,
          letterSpacingDelta: 0
      };
  }

  // WeakMap to store original text for Pangu reversibility
  if (typeof window.liteReadOriginalTextMap === 'undefined') {
      window.liteReadOriginalTextMap = new WeakMap();
  }

  // Pangu logic: Apply spacing (Keep existing logic)
  function applyPangu() {
      if (typeof pangu === 'undefined' && typeof window.pangu === 'undefined') {
          console.warn('Lite Read: Pangu.js not loaded yet');
          return;
      }
      
      const panguLib = window.pangu || pangu;
      
      const walker = document.createTreeWalker(
          document.body,
          NodeFilter.SHOW_TEXT,
          {
              acceptNode: function(node) {
                  const parentTag = node.parentNode.tagName.toLowerCase();
                  if (['script', 'style', 'textarea', 'pre', 'code'].includes(parentTag)) {
                      return NodeFilter.FILTER_REJECT;
                  }
                  if (!node.nodeValue.trim()) {
                      return NodeFilter.FILTER_REJECT;
                  }
                  return NodeFilter.FILTER_ACCEPT;
              }
          }
      );

      const nodesToUpdate = [];
      let currentNode;
      while (currentNode = walker.nextNode()) {
          nodesToUpdate.push(currentNode);
      }

      nodesToUpdate.forEach(node => {
          const originalText = node.nodeValue;
          const newText = panguLib.spacing(originalText);
          
          if (originalText !== newText) {
              // Store original if not already stored
              if (!window.liteReadOriginalTextMap.has(node)) {
                  window.liteReadOriginalTextMap.set(node, originalText);
              }
              node.nodeValue = newText;
          }
      });
      
      window.liteReadPanguApplied = true;
  }

  // Pangu logic: Revert spacing
  function revertPangu() {
      const walker = document.createTreeWalker(
          document.body,
          NodeFilter.SHOW_TEXT,
          null
      );

      let currentNode;
      while (currentNode = walker.nextNode()) {
          if (window.liteReadOriginalTextMap.has(currentNode)) {
              const originalText = window.liteReadOriginalTextMap.get(currentNode);
              if (currentNode.nodeValue !== originalText) {
                  currentNode.nodeValue = originalText;
              }
              // Optional: Clear map entry? Better keep it in case user toggles again
              // window.liteReadOriginalTextMap.delete(currentNode);
          }
      }
      
      window.liteReadPanguApplied = false;
  }

  // Helper to get numeric value from px string
  function parsePx(str) {
      if (!str) return 0;
      return parseFloat(str.replace('px', '')) || 0;
  }

  // Helper to parse line-height which can be 'normal', number, or 'px'
  function parseLineHeight(str, fontSize) {
      if (str === 'normal') return fontSize * 1.2; // Default browser approx
      if (str.endsWith('px')) return parseFloat(str.replace('px', ''));
      // If it's a raw number (multiplier)
      const val = parseFloat(str);
      if (!isNaN(val)) return fontSize * val;
      return fontSize * 1.2; // Fallback
  }

  // CORE LOGIC: Apply styles via Inline Styles (style attribute)
  function applyRelativeStyles(fontSizeDelta, lineHeightDelta, letterSpacingDelta) {
      // Selector for text elements
      // Added 'div' back BUT with a filter for text nodes to cover Zhihu sidebar etc.
      // We process divs separately or include them and check content
      // Expanded selector to include inline elements like b, strong, i, em, mark, etc.
      // Added custom tag 'markerow8' for specific highlighter extension support
      const selector = 'p, span, li, a, h1, h2, h3, h4, h5, h6, td, th, blockquote, pre, code, div, b, strong, i, em, mark, small, label, markerow8';
      const elements = document.querySelectorAll(selector);

      elements.forEach(el => {
          // Filter: For DIVs, we only want to style them if they directly contain text
          if (el.tagName.toLowerCase() === 'div') {
              let hasDirectText = false;
              for (let i = 0; i < el.childNodes.length; i++) {
                  if (el.childNodes[i].nodeType === Node.TEXT_NODE && el.childNodes[i].nodeValue.trim().length > 0) {
                      hasDirectText = true;
                      break;
                  }
              }
              if (!hasDirectText) return; // Skip layout divs
          }
          
          // 1. Snapshot original styles if not present
          if (!window.liteReadOriginalStyles.has(el)) {
              const computed = window.getComputedStyle(el);
              window.liteReadOriginalStyles.set(el, {
                  fontSize: computed.fontSize,
                  lineHeight: computed.lineHeight,
                  letterSpacing: computed.letterSpacing,
                  display: computed.display, // Store display property
                  // Also store original inline style to restore perfectly
                  originalInlineStyle: el.getAttribute('style')
              });
          }

          const original = window.liteReadOriginalStyles.get(el);
          const origFs = parsePx(original.fontSize);
          
          // Calculate new Font Size
          // fontSizeDelta is int (e.g. +2, -1)
          const newFs = origFs + fontSizeDelta;
          
          // Calculate new Line Height
          // lineHeightDelta is INT (e.g. +10px, -5px). 
          // We need original line height in px
          const origLhPx = parseLineHeight(original.lineHeight, origFs);
          
          // New Line Height (px) = Old Line Height (px) + Delta (px)
          let newLhPx = origLhPx + lineHeightDelta;
          
          // Safety check: Line height shouldn't be smaller than font size generally, or at least reasonable
          if (isNaN(newLhPx) || newLhPx <= 0) newLhPx = newFs * 1.0; 
          
          // Calculate new Letter Spacing
          // letterSpacingDelta is float (e.g. +0.5).
          let origLs = 0;
          if (original.letterSpacing !== 'normal') {
              origLs = parsePx(original.letterSpacing);
          }
          const newLs = origLs + letterSpacingDelta;

          // Apply to inline style
          if (newFs > 0) el.style.setProperty('font-size', `${newFs}px`, 'important');
          
          // For inline elements (span, a, b, strong, etc.), line-height often doesn't work as expected
          // unless they are inline-block or block. 
          // If the element is inline, we might need to force it to inline-block to accept line-height,
          // BUT changing display type can break layout (e.g. breaking text flow).
          // Safer bet: Only apply line-height if it's NOT an inline element, OR if the user explicitly wants to force it.
          // However, for "Zhihu directory", usually they are blocks or inline-blocks.
          // If it is 'inline', line-height applies to the line box, but might not increase the element's height visually in the way expected.
          // Let's try applying it regardless, but if it's a known inline element that resists, we might need to be careful.
          // Actually, `line-height` applies to inline elements but it specifies the "height of the line box", not the element box.
          // So it SHOULD work for spacing lines apart.
          
          if (newLhPx > 0) el.style.setProperty('line-height', `${newLhPx}px`, 'important');
          el.style.setProperty('letter-spacing', `${newLs}px`, 'important');
          
          // REMOVED: height/min-height injection which caused layout collapse
      });
      
      window.liteReadStylesApplied = true;
  }

  // CORE LOGIC: Reset styles
  function resetStyles() {
      if (!window.liteReadStylesApplied) return;

      // Ensure we clean up ALL elements we might have touched, including the expanded list
      const selector = 'p, span, li, a, h1, h2, h3, h4, h5, h6, td, th, blockquote, pre, code, div, b, strong, i, em, mark, small, label, markerow8';
      const elements = document.querySelectorAll(selector);

      elements.forEach(el => {
          if (window.liteReadOriginalStyles.has(el)) {
              const original = window.liteReadOriginalStyles.get(el);
              
              // Restore: Removing properties we added is cleaner than setting to computed value
              el.style.removeProperty('font-size');
              el.style.removeProperty('line-height');
              el.style.removeProperty('letter-spacing');
              el.style.removeProperty('height');
              el.style.removeProperty('min-height');
              
              // If original inline style was empty, remove style attr to be clean
              if (!original.originalInlineStyle) {
                  if (el.getAttribute('style') === '') {
                      el.removeAttribute('style');
                  }
              }
          }
      });
      
      window.liteReadStylesApplied = false;
  }

  // Mutation Observer to handle dynamic content (SPA)
  if (typeof window.liteReadObserver === 'undefined') {
      const observer = new MutationObserver((mutations) => {
          // Check if we have active styles to apply
          const isDefault = (window.liteReadState.fontSizeDelta === 0) && 
                            (Math.abs(window.liteReadState.lineHeightDelta) < 0.01) && 
                            (Math.abs(window.liteReadState.letterSpacingDelta) < 0.01);
                            
          if (!isDefault) {
              // Debounce re-application slightly to avoid performance hit on heavy updates
              if (window.liteReadApplyTimeout) clearTimeout(window.liteReadApplyTimeout);
              window.liteReadApplyTimeout = setTimeout(() => {
                  applyRelativeStyles(
                      window.liteReadState.fontSizeDelta, 
                      window.liteReadState.lineHeightDelta, 
                      window.liteReadState.letterSpacingDelta
                  );
              }, 100);
          }
      });
      
      observer.observe(document.body, {
          childList: true,
          subtree: true
      });
      window.liteReadObserver = observer;
  }

  // Define or redefine the update function
  window.liteReadUpdateStyles = function(fontSizeDelta, lineHeightDelta, letterSpacingDelta, panguStatus) {
    const root = document.documentElement;
    
    // Update state
    window.liteReadState = {
        fontSizeDelta: parseInt(fontSizeDelta),
        lineHeightDelta: parseFloat(lineHeightDelta),
        letterSpacingDelta: parseFloat(letterSpacingDelta)
    };
    
    // Check if we are in "Default Mode"
    const isDefault = (window.liteReadState.fontSizeDelta === 0) && 
                      (Math.abs(window.liteReadState.lineHeightDelta) < 0.01) && 
                      (Math.abs(window.liteReadState.letterSpacingDelta) < 0.01);

    // Handle Pangu
    if (panguStatus !== undefined) {
        root.setAttribute('data-lite-read-pangu', String(panguStatus));
        if (panguStatus === true && !window.liteReadPanguApplied) {
            applyPangu();
        } else if (panguStatus === false && window.liteReadPanguApplied) {
            revertPangu();
        }
    }

    if (isDefault) {
        resetStyles();
    } else {
        applyRelativeStyles(
            window.liteReadState.fontSizeDelta, 
            window.liteReadState.lineHeightDelta, 
            window.liteReadState.letterSpacingDelta
        );
    }
  };

  // Setup message listener
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "updateStyles") {
      window.liteReadUpdateStyles(request.fontSize, request.lineHeight, request.letterSpacing, request.pangu);
      sendResponse({
          status: "success", 
          version: LITE_READ_VERSION
      });
      return true; 
    } else if (request.action === "getStyles") {
      const root = document.documentElement;
      const panguStatus = root.getAttribute('data-lite-read-pangu') === 'true';
      
      sendResponse({
        fontSize: window.liteReadState.fontSizeDelta,
        lineHeight: window.liteReadState.lineHeightDelta,
        letterSpacing: window.liteReadState.letterSpacingDelta,
        pangu: panguStatus,
        version: LITE_READ_VERSION
      });
    }
  });
}
