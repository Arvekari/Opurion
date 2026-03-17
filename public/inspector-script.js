(function() {
  let isInspectorActive = false;
  let inspectorStyle = null;
  let currentHighlight = null;
  let lastHealthSignature = '';
  let healthTimer = null;
  let mutationObserver = null;

  function postToParent(message) {
    window.parent.postMessage(message, '*');
  }

  function getOverlayText() {
    const viteOverlay = document.querySelector('vite-error-overlay');

    if (viteOverlay) {
      return (viteOverlay.shadowRoot ? viteOverlay.shadowRoot.textContent : viteOverlay.textContent || '').trim();
    }

    const overlayCandidate = document.querySelector('#vite-error-overlay, .vite-error-overlay, [data-vite-error-overlay]');
    return (overlayCandidate && overlayCandidate.textContent ? overlayCandidate.textContent : '').trim();
  }

  function looksLikePreviewError(text) {
    return /\[plugin:vite|vite:react-babel|failed to resolve import|unexpected token|pre-transform error|transform failed|parse5|internal server error|cannot find module/i.test(
      text || ''
    );
  }

  function getBodyText() {
    return ((document.body && (document.body.innerText || document.body.textContent)) || '').trim();
  }

  function getRootHasContent() {
    const root = document.querySelector('#root, #app, [data-reactroot], main');

    if (!root) {
      return false;
    }

    const text = (root.innerText || root.textContent || '').trim();
    return text.length > 0 || root.children.length > 0;
  }

  function sendPreviewHealth(status, reason, extra) {
    const payload = {
      status,
      reason,
      url: window.location.href,
      title: document.title || '',
      readyState: document.readyState,
      bodyText: getBodyText().slice(0, 4000),
      childElementCount: document.body ? document.body.children.length : 0,
      htmlSnippet: document.documentElement ? document.documentElement.outerHTML.slice(0, 4000) : '',
      errorText: getOverlayText().slice(0, 4000),
      ...(extra || {}),
    };

    const signature = JSON.stringify([payload.status, payload.reason, payload.url, payload.title, payload.bodyText, payload.errorText]);

    if (signature === lastHealthSignature) {
      return;
    }

    lastHealthSignature = signature;
    postToParent({ type: 'PREVIEW_HEALTH', payload: payload });
  }

  function inspectPreviewHealth(reason) {
    const overlayText = getOverlayText();
    const bodyText = getBodyText();
    const rootHasContent = getRootHasContent();
    const titleText = (document.title || '').trim();
    const combined = [overlayText, bodyText, titleText].filter(Boolean).join('\n');

    if (looksLikePreviewError(combined)) {
      sendPreviewHealth('error', reason, { errorText: combined.slice(0, 4000) });
      return;
    }

    if (document.readyState === 'complete' && !rootHasContent && bodyText.length === 0) {
      sendPreviewHealth('blank', reason);
      return;
    }

    if (document.readyState === 'complete') {
      sendPreviewHealth('ok', reason);
    }
  }

  function scheduleHealthCheck(reason, delay) {
    if (healthTimer) {
      window.clearTimeout(healthTimer);
    }

    healthTimer = window.setTimeout(function() {
      inspectPreviewHealth(reason);
    }, delay);
  }

  // Function to get relevant styles
  function getRelevantStyles(element) {
    const computedStyles = window.getComputedStyle(element);
    const relevantProps = [
      'display', 'position', 'width', 'height', 'margin', 'padding',
      'border', 'background', 'color', 'font-size', 'font-family',
      'text-align', 'flex-direction', 'justify-content', 'align-items'
    ];
    
    const styles = {};
    relevantProps.forEach(prop => {
      const value = computedStyles.getPropertyValue(prop);
      if (value) styles[prop] = value;
    });
    
    return styles;
  }

  // Function to create a readable element selector
  function createReadableSelector(element) {
    let selector = element.tagName.toLowerCase();
    
    // Add ID if present
    if (element.id) {
      selector += `#${element.id}`;
    }
    
    // Add classes if present
    let className = '';
    if (element.className) {
      if (typeof element.className === 'string') {
        className = element.className;
      } else if (element.className.baseVal !== undefined) {
        className = element.className.baseVal;
      } else {
        className = element.className.toString();
      }
      
      if (className.trim()) {
        const classes = className.trim().split(/\s+/).slice(0, 3); // Limit to first 3 classes
        selector += `.${classes.join('.')}`;
      }
    }
    
    return selector;
  }

  // Function to create element display text
  function createElementDisplayText(element) {
    const tagName = element.tagName.toLowerCase();
    let displayText = `<${tagName}`;
    
    // Add ID attribute
    if (element.id) {
      displayText += ` id="${element.id}"`;
    }
    
    // Add class attribute (limit to first 3 classes for readability)
    let className = '';
    if (element.className) {
      if (typeof element.className === 'string') {
        className = element.className;
      } else if (element.className.baseVal !== undefined) {
        className = element.className.baseVal;
      } else {
        className = element.className.toString();
      }
      
      if (className.trim()) {
        const classes = className.trim().split(/\s+/);
        const displayClasses = classes.length > 3 ? 
          classes.slice(0, 3).join(' ') + '...' : 
          classes.join(' ');
        displayText += ` class="${displayClasses}"`;
      }
    }
    
    // Add other important attributes
    const importantAttrs = ['type', 'name', 'href', 'src', 'alt', 'title'];
    importantAttrs.forEach(attr => {
      const value = element.getAttribute(attr);
      if (value) {
        const truncatedValue = value.length > 30 ? value.substring(0, 30) + '...' : value;
        displayText += ` ${attr}="${truncatedValue}"`;
      }
    });
    
    displayText += '>';
    
    // Add text content preview for certain elements
    const textElements = ['span', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'button', 'a', 'label'];
    if (textElements.includes(tagName) && element.textContent) {
      const textPreview = element.textContent.trim().substring(0, 50);
      if (textPreview) {
        displayText += textPreview.length < element.textContent.trim().length ? 
          textPreview + '...' : textPreview;
      }
    }
    
    displayText += `</${tagName}>`;
    
    return displayText;
  }

  // Function to create element info
  function createElementInfo(element) {
    const rect = element.getBoundingClientRect();
    
    return {
      tagName: element.tagName,
      className: getElementClassName(element),
      id: element.id || '',
      textContent: element.textContent?.slice(0, 100) || '',
      styles: getRelevantStyles(element),
      rect: {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
        top: rect.top,
        left: rect.left
      },
      // Add new readable formats
      selector: createReadableSelector(element),
      displayText: createElementDisplayText(element),
      elementPath: getElementPath(element)
    };
  }

  // Helper function to get element class name consistently
  function getElementClassName(element) {
    if (!element.className) return '';
    
    if (typeof element.className === 'string') {
      return element.className;
    } else if (element.className.baseVal !== undefined) {
      return element.className.baseVal;
    } else {
      return element.className.toString();
    }
  }

  // Function to get element path (breadcrumb)
  function getElementPath(element) {
    const path = [];
    let current = element;
    
    while (current && current !== document.body && current !== document.documentElement) {
      let pathSegment = current.tagName.toLowerCase();
      
      if (current.id) {
        pathSegment += `#${current.id}`;
      } else if (current.className) {
        const className = getElementClassName(current);
        if (className.trim()) {
          const firstClass = className.trim().split(/\s+/)[0];
          pathSegment += `.${firstClass}`;
        }
      }
      
      path.unshift(pathSegment);
      current = current.parentElement;
      
      // Limit path length
      if (path.length >= 5) break;
    }
    
    return path.join(' > ');
  }

  // Event handlers
  function handleMouseMove(e) {
    if (!isInspectorActive) return;
    
    const target = e.target;
    if (!target || target === document.body || target === document.documentElement) return;

    // Remove previous highlight
    if (currentHighlight) {
      currentHighlight.classList.remove('inspector-highlight');
    }
    
    // Add highlight to current element
    target.classList.add('inspector-highlight');
    currentHighlight = target;

    const elementInfo = createElementInfo(target);
    
    // Send message to parent
    postToParent({
      type: 'INSPECTOR_HOVER',
      elementInfo: elementInfo
    });
  }

  function handleClick(e) {
    if (!isInspectorActive) return;
    
    e.preventDefault();
    e.stopPropagation();
    
    const target = e.target;
    if (!target || target === document.body || target === document.documentElement) return;

    const elementInfo = createElementInfo(target);
    
    // Send message to parent
    postToParent({
      type: 'INSPECTOR_CLICK',
      elementInfo: elementInfo
    });
  }

  function handleMouseLeave() {
    if (!isInspectorActive) return;
    
    // Remove highlight
    if (currentHighlight) {
      currentHighlight.classList.remove('inspector-highlight');
      currentHighlight = null;
    }
    
    // Send message to parent
    postToParent({
      type: 'INSPECTOR_LEAVE'
    });
  }

  // Function to activate/deactivate inspector
  function setInspectorActive(active) {
    isInspectorActive = active;
    
    if (active) {
      // Add inspector styles
      if (!inspectorStyle) {
        inspectorStyle = document.createElement('style');
        inspectorStyle.textContent = `
          .inspector-active * {
            cursor: crosshair !important;
          }
          .inspector-highlight {
            outline: 2px solid #3b82f6 !important;
            outline-offset: -2px !important;
            background-color: rgba(59, 130, 246, 0.1) !important;
          }
        `;
        document.head.appendChild(inspectorStyle);
      }
      
      document.body.classList.add('inspector-active');
      
      // Add event listeners
      document.addEventListener('mousemove', handleMouseMove, true);
      document.addEventListener('click', handleClick, true);
      document.addEventListener('mouseleave', handleMouseLeave, true);
    } else {
      document.body.classList.remove('inspector-active');
      
      // Remove highlight
      if (currentHighlight) {
        currentHighlight.classList.remove('inspector-highlight');
        currentHighlight = null;
      }
      
      // Remove event listeners
      document.removeEventListener('mousemove', handleMouseMove, true);
      document.removeEventListener('click', handleClick, true);
      document.removeEventListener('mouseleave', handleMouseLeave, true);
      
      // Remove styles
      if (inspectorStyle) {
        inspectorStyle.remove();
        inspectorStyle = null;
      }
    }
  }

  // Listen for messages from parent
  window.addEventListener('message', function(event) {
    if (event.data.type === 'INSPECTOR_ACTIVATE') {
      setInspectorActive(event.data.active);
    }
  });

  window.addEventListener('error', function(event) {
    postToParent({
      type: 'PREVIEW_RUNTIME_ERROR',
      payload: {
        url: window.location.href,
        message: event.message || 'Preview runtime error',
        stack: event.error && event.error.stack ? event.error.stack : '',
        filename: event.filename || window.location.href,
        line: event.lineno,
        column: event.colno,
      }
    });
    scheduleHealthCheck('window-error', 50);
  });

  window.addEventListener('unhandledrejection', function(event) {
    const reason = event.reason || {};

    postToParent({
      type: 'PREVIEW_RUNTIME_ERROR',
      payload: {
        url: window.location.href,
        message: reason.message || String(reason) || 'Unhandled preview rejection',
        stack: reason.stack || '',
      }
    });
    scheduleHealthCheck('unhandled-rejection', 50);
  });

  document.addEventListener('DOMContentLoaded', function() {
    scheduleHealthCheck('dom-content-loaded', 250);
  });

  window.addEventListener('load', function() {
    scheduleHealthCheck('window-load', 900);
    window.setTimeout(function() {
      inspectPreviewHealth('window-load-settled');
    }, 1800);
  });

  if (document.documentElement && typeof MutationObserver !== 'undefined') {
    mutationObserver = new MutationObserver(function() {
      scheduleHealthCheck('dom-mutation', 300);
    });

    mutationObserver.observe(document.documentElement, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  }

  // Auto-inject if inspector is already active
  postToParent({ type: 'INSPECTOR_READY' });
  scheduleHealthCheck('script-injected', 500);
})();