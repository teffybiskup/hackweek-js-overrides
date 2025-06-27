(function () {
  "use strict";

  const SCRIPT_NAME = "JS Overrides";
  const DISABLE_KEY = "__disable_js_overrides__";
  const SCRIPT_PREFIX = "override-script-";
  const MAX_RETRIES = 3;
  const RETRY_DELAY = 100;

  const log = {
    info: (msg) =>
      console.log(`[${SCRIPT_NAME}] ${new Date().toLocaleString()} - ${msg}`),
    warn: (msg) =>
      console.warn(`[${SCRIPT_NAME}] ${new Date().toLocaleString()} - ${msg}`),
    error: (msg) =>
      console.error(`[${SCRIPT_NAME}] ${new Date().toLocaleString()} - ${msg}`),
  };

  log.info("Starting script execution...");

  if (localStorage.getItem(DISABLE_KEY) === "true") {
    log.info("Overrides disabled for this tab");
    return;
  }

  /**
   * Safely parse cookies with error handling
   * @returns {Map<string, string>} Cookie map
   */
  const parseCookies = () => {
    const cookieMap = new Map();

    try {
      if (!document.cookie?.trim()) {
        log.info("No cookies found");
        return cookieMap;
      }

      document.cookie.split(";").forEach((cookieStr) => {
        const trimmed = cookieStr.trim();
        if (!trimmed) return;

        const equalIndex = trimmed.indexOf("=");
        if (equalIndex === -1) return;

        const key = trimmed.substring(0, equalIndex).trim();
        const value = trimmed.substring(equalIndex + 1);

        if (!key) return;

        try {
          cookieMap.set(key, decodeURIComponent(value));
        } catch (err) {
          log.warn(
            `Failed to decode cookie value for key "${key}": ${err.message}`,
          );
          cookieMap.set(key, value);
        }
      });
    } catch (err) {
      log.error(`Cookie parsing failed: ${err.message}`);
    }

    return cookieMap;
  };

  /**
   * Validate URL to prevent XSS and ensure it's safe to load
   * @param {string} url - URL to validate
   * @returns {boolean} Whether URL is valid and safe
   */
  const isValidUrl = (url) => {
    if (!url || typeof url !== "string") return false;

    try {
      const parsed = new URL(url);
      return ["http:", "https:"].includes(parsed.protocol);
    } catch {
      return false;
    }
  };

  /**
   * Check if key represents a valid override path
   * @param {string} key - Cookie key to validate
   * @returns {boolean} Whether key is valid for overrides
   */
  const isValidOverrideKey = (key) => {
    return (
      key && typeof key === "string" && key.includes("/") && key.length > 1
    );
  };

  /**
   * Load script with retry mechanism and error handling
   * @param {string} key - Override key
   * @param {string} url - Script URL
   * @param {number} attempt - Current attempt number
   */
  const loadScript = (key, url, attempt = 1) => {
    const scriptId = `${SCRIPT_PREFIX}${btoa(key).replace(/[+/=]/g, "")}`;

    if (document.getElementById(scriptId)) {
      log.info(`Script already loaded: ${key}`);
      return;
    }

    log.info(`Loading script (attempt ${attempt}): ${key} -> ${url}`);

    const script = document.createElement("script");
    script.id = scriptId;
    script.src = url;
    script.async = false;
    script.defer = false;
    script.crossOrigin = "anonymous";
    script.referrerPolicy = "no-referrer";

    const cleanup = () => {
      script.onload = null;
      script.onerror = null;
      script.onabort = null;
    };

    script.onload = () => {
      cleanup();
      log.info(`Successfully loaded: ${url}`);
    };

    script.onerror = (_event) => {
      cleanup();
      log.error(`Failed to load: ${url} (Network error)`);

      if (attempt < MAX_RETRIES) {
        setTimeout(() => {
          const failedScript = document.getElementById(scriptId);
          if (failedScript) {
            failedScript.remove();
          }
          loadScript(key, url, attempt + 1);
        }, RETRY_DELAY * attempt);
      } else {
        log.error(`Max retries exceeded for: ${url}`);
      }
    };

    script.onabort = () => {
      cleanup();
      log.warn(`Script loading aborted: ${url}`);
    };

    try {
      document.head.appendChild(script);
    } catch (err) {
      cleanup();
      log.error(`Failed to append script to DOM: ${err.message}`);
    }
  };

  /**
   * Process and inject override scripts
   */
  const injectScripts = () => {
    if (!document.head) {
      log.error("Document head not available");
      return;
    }

    const cookies = parseCookies();

    if (cookies.size === 0) {
      log.info("No cookies to process");
      return;
    }

    let processedCount = 0;
    let validOverrides = 0;

    cookies.forEach((url, key) => {
      processedCount++;

      if (!isValidOverrideKey(key)) {
        return;
      }

      if (!isValidUrl(url)) {
        log.warn(`Invalid URL for override "${key}": ${url}`);
        return;
      }

      validOverrides++;
      loadScript(key, url);
    });

    log.info(
      `Processed ${processedCount} cookies, found ${validOverrides} valid overrides`,
    );
  };

  /**
   * Initialize the script with DOM ready handling
   */
  const initialize = () => {
    if (document.head) {
      injectScripts();
    } else if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", injectScripts, {
        once: true,
      });
    } else {
      setTimeout(injectScripts, 0);
    }
  };

  try {
    initialize();
  } catch (err) {
    log.error(`Initialization failed: ${err.message}`);
  }
})();
