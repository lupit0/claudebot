"""Browser automation utilities using Patchright (undetected Playwright fork).

Patchright is a drop-in replacement for Playwright that patches CDP leaks,
navigator.webdriver, and other automation markers that anti-bot systems detect.
"""

from __future__ import annotations

import asyncio
import logging
import os
import random
from contextlib import asynccontextmanager
from typing import AsyncGenerator, Optional

logger = logging.getLogger(__name__)

# Realistic user agents — rotated per session to avoid fingerprinting
_USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Safari/605.1.15",
]

# Viewports — vary screen size to avoid same-fingerprint detection
_VIEWPORTS = [
    {"width": 1920, "height": 1080},
    {"width": 1366, "height": 768},
    {"width": 1536, "height": 864},
    {"width": 1440, "height": 900},
    {"width": 1280, "height": 720},
]

# EU locale/timezone pairs — must match VPS IP geolocation
_EU_LOCALES = [
    ("en-GB", "Europe/London"),
    ("en-GB", "Europe/London"),  # weighted — most likely for UK flight searches
    ("en-IE", "Europe/Dublin"),
    ("de-DE", "Europe/Berlin"),
    ("fr-FR", "Europe/Paris"),
    ("nl-NL", "Europe/Amsterdam"),
]


def _get_proxy_config() -> Optional[dict]:
    """Build proxy config from environment variables."""
    proxy_url = os.getenv("PROXY_URL", "").strip()
    if not proxy_url:
        return None
    return {"server": proxy_url}


def _get_proxy_pool() -> list[str]:
    """Get list of proxies for rotation."""
    pool = os.getenv("PROXY_POOL", "").strip()
    if not pool:
        single = os.getenv("PROXY_URL", "").strip()
        return [single] if single else []
    return [p.strip() for p in pool.split(",") if p.strip()]


def _pick_random_proxy() -> Optional[dict]:
    """Pick a random proxy from the pool."""
    pool = _get_proxy_pool()
    if not pool:
        return None
    return {"server": random.choice(pool)}


async def human_delay(min_s: float = 1.0, max_s: float = 3.0):
    """Wait a random human-like duration."""
    await asyncio.sleep(random.uniform(min_s, max_s))


async def human_type(page, selector: str, text: str, delay_range=(50, 150)):
    """Type text character by character with human-like delays."""
    element = page.locator(selector)
    await element.click()
    await asyncio.sleep(random.uniform(0.2, 0.5))
    for char in text:
        await element.press(char)
        await asyncio.sleep(random.uniform(delay_range[0], delay_range[1]) / 1000)


async def human_scroll(page, direction: str = "down", distance: int = 300):
    """Scroll the page in a human-like manner."""
    delta = distance if direction == "down" else -distance
    # Scroll in small increments
    steps = random.randint(3, 6)
    for _ in range(steps):
        await page.mouse.wheel(0, delta // steps + random.randint(-20, 20))
        await asyncio.sleep(random.uniform(0.05, 0.15))


def _detect_locale_timezone() -> tuple[str, str]:
    """Detect locale/timezone that matches the VPS region.

    Uses BROWSER_LOCALE / BROWSER_TIMEZONE env vars if set,
    otherwise defaults to en-GB / Europe/London (safe for most EU VPS).
    NEVER use US locale/timezone from an EU IP — anti-bot systems check this.
    """
    locale = os.getenv("BROWSER_LOCALE", "").strip()
    tz = os.getenv("BROWSER_TIMEZONE", "").strip()
    if locale and tz:
        return locale, tz
    # Default to UK English — safe for EU VPS doing UK flight searches
    return "en-GB", "Europe/London"


@asynccontextmanager
async def create_browser(
    headless: bool = True,
    proxy: Optional[dict] = None,
    slow_mo: int = 0,
    persistent_context_dir: Optional[str] = None,
) -> AsyncGenerator:
    """Create an undetected browser instance using Patchright.

    Patchright patches Playwright to avoid detection:
    - Fixes Runtime.enable CDP leak
    - Sets navigator.webdriver = false
    - Removes HeadlessChrome user-agent flag
    - Handles other automation markers

    Additional stealth measures applied here:
    - Locale/timezone matching the VPS region (EU, not US)
    - Randomized viewport and user-agent per session
    - Chrome launch flags to disable automation markers

    Args:
        headless: Run without a visible window (use Xvfb on servers).
        proxy: Proxy config dict with 'server' key.
        slow_mo: Milliseconds to slow down operations (for debugging).
        persistent_context_dir: Path to store browser profile for cookie persistence.
    """
    try:
        from patchright.async_api import async_playwright
    except ImportError:
        logger.warning(
            "Patchright not installed. Falling back to standard Playwright. "
            "Install with: pip install patchright"
        )
        from playwright.async_api import async_playwright

    if proxy is None:
        proxy = _pick_random_proxy()

    locale, timezone_id = _detect_locale_timezone()
    user_agent = random.choice(_USER_AGENTS)
    viewport = random.choice(_VIEWPORTS)

    launch_args = {
        "headless": headless,
        "slow_mo": slow_mo,
        "args": [
            "--disable-blink-features=AutomationControlled",
            "--disable-features=IsolateOrigins,site-per-process",
            "--no-first-run",
            "--no-default-browser-check",
            "--disable-dev-shm-usage",
            "--disable-infobars",
            f"--window-size={viewport['width']},{viewport['height']}",
        ],
    }
    if proxy:
        launch_args["proxy"] = proxy

    context_args = {
        "viewport": viewport,
        "locale": locale,
        "timezone_id": timezone_id,
        "user_agent": user_agent,
    }

    async with async_playwright() as p:
        if persistent_context_dir:
            # Persistent context preserves cookies/localStorage across sessions
            # Merge context args into launch args for persistent context
            merged = {**launch_args, **context_args}
            context = await p.chromium.launch_persistent_context(
                persistent_context_dir, **merged
            )
            page = context.pages[0] if context.pages else await context.new_page()
            try:
                # Apply stealth JS patches
                await _apply_stealth(page)
                yield page, context
            finally:
                await context.close()
        else:
            browser = await p.chromium.launch(**launch_args)
            context = await browser.new_context(**context_args)
            page = await context.new_page()
            try:
                # Apply stealth JS patches
                await _apply_stealth(page)
                yield page, context
            finally:
                await context.close()
                await browser.close()


async def _apply_stealth(page) -> None:
    """Apply additional stealth JavaScript patches beyond what Patchright provides."""
    try:
        await page.add_init_script("""
            // Override navigator.webdriver (belt-and-suspenders with Patchright)
            Object.defineProperty(navigator, 'webdriver', { get: () => undefined });

            // Override navigator.plugins to look like a real browser
            Object.defineProperty(navigator, 'plugins', {
                get: () => [1, 2, 3, 4, 5]
            });

            // Override navigator.languages
            Object.defineProperty(navigator, 'languages', {
                get: () => ['en-GB', 'en']
            });

            // Fix chrome.runtime to exist (Chromium automation detection)
            if (!window.chrome) { window.chrome = {}; }
            if (!window.chrome.runtime) { window.chrome.runtime = {}; }

            // Override permissions API
            const originalQuery = window.navigator.permissions?.query;
            if (originalQuery) {
                window.navigator.permissions.query = (parameters) => (
                    parameters.name === 'notifications' ?
                        Promise.resolve({ state: Notification.permission }) :
                        originalQuery(parameters)
                );
            }
        """)
    except Exception as e:
        logger.debug(f"Could not apply stealth script: {e}")


async def dismiss_cookie_consent(page, timeout: int = 5000) -> bool:
    """Attempt to dismiss cookie consent dialogs (GDPR, CCPA, etc.).

    Tries multiple common consent button patterns used by:
    - Google (consent.google.com)
    - OneTrust, CookieBot, TrustArc
    - Kayak, Skyscanner, and other travel sites
    - Generic EU consent banners

    Returns True if a consent dialog was found and dismissed.
    """
    # Comprehensive list of selectors for consent buttons across sites
    consent_selectors = [
        # Google consent (consent.google.com iframe or redirect)
        "button:has-text('Accept all')",
        "button:has-text('Accept All')",
        "button:has-text('Reject all')",
        "button:has-text('Reject All')",
        "button:has-text('Tout accepter')",  # French
        "button:has-text('Alle akzeptieren')",  # German
        "button:has-text('Aceptar todo')",  # Spanish
        "button:has-text('Accetta tutto')",  # Italian
        # Generic consent patterns
        "button:has-text('Accept')",
        "button:has-text('Accept cookies')",
        "button:has-text('Accept Cookies')",
        "button:has-text('I agree')",
        "button:has-text('I Agree')",
        "button:has-text('Agree')",
        "button:has-text('Allow all')",
        "button:has-text('Allow All')",
        "button:has-text('Allow cookies')",
        "button:has-text('Got it')",
        "button:has-text('OK')",
        "button:has-text('Continue')",
        # ID / class based selectors
        "#acceptCookieButton",
        "#onetrust-accept-btn-handler",
        "#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll",
        ".cookie-consent-accept",
        "[data-testid='cookie-accept']",
        "[data-cookiebanner='accept_button']",
        ".cc-accept",
        ".cc-btn.cc-dismiss",
        ".consent-accept",
        ".js-consent-accept",
        # Travel site specific
        ".dCnC-mod-close",  # Kayak
        "#didomi-notice-agree-button",  # Skyscanner/Didomi
        ".RxNS-button-content:has-text('OK')",  # Kayak variant
    ]

    for selector in consent_selectors:
        try:
            btn = page.locator(selector).first
            if await btn.is_visible(timeout=500):
                await btn.click()
                logger.info(f"Dismissed cookie consent via: {selector}")
                await asyncio.sleep(random.uniform(0.5, 1.5))
                return True
        except Exception:
            continue

    # Check for Google's consent.google.com iframe
    try:
        frames = page.frames
        for frame in frames:
            if "consent.google" in (frame.url or ""):
                for selector in [
                    "button:has-text('Accept all')",
                    "button:has-text('Accept All')",
                    "button:has-text('Reject all')",
                    "button:has-text('Accept')",
                    "button:has-text('Agree')",
                ]:
                    try:
                        btn = frame.locator(selector).first
                        if await btn.is_visible(timeout=500):
                            await btn.click()
                            logger.info(f"Dismissed Google consent iframe via: {selector}")
                            await asyncio.sleep(random.uniform(0.5, 1.5))
                            return True
                    except Exception:
                        continue
    except Exception:
        pass

    # Check if page redirected to consent.google.com
    if "consent.google" in page.url:
        logger.info("Detected consent.google.com redirect, looking for buttons...")
        for selector in [
            "button:has-text('Accept all')",
            "button:has-text('Accept All')",
            "button:has-text('Reject all')",
            "button:has-text('Accept')",
            "form button",
        ]:
            try:
                btn = page.locator(selector).first
                if await btn.is_visible(timeout=2000):
                    await btn.click()
                    logger.info(f"Dismissed consent.google.com via: {selector}")
                    await asyncio.sleep(random.uniform(1.0, 2.0))
                    # Wait for redirect back to the original site
                    try:
                        await page.wait_for_url("**/*google.com/travel/**", timeout=10000)
                    except Exception:
                        pass
                    return True
            except Exception:
                continue

    return False


async def detect_challenge(page) -> Optional[str]:
    """Check if the page is showing a captcha or anti-bot challenge.

    Returns the challenge type string if detected, None otherwise.
    """
    try:
        content = await page.content()
    except Exception:
        return None

    lower = content.lower()
    challenges = [
        ("cf-challenge", "Cloudflare"),
        ("cf-turnstile", "Cloudflare Turnstile"),
        ("captcha", "CAPTCHA"),
        ("recaptcha", "reCAPTCHA"),
        ("hcaptcha", "hCaptcha"),
        ("verify you are human", "Human verification"),
        ("checking your browser", "Browser check"),
        ("just a moment", "Cloudflare JS challenge"),
        ("datadome", "DataDome"),
        ("perimeterx", "PerimeterX"),
        ("px-captcha", "PerimeterX CAPTCHA"),
        ("geo.captcha-delivery", "DataDome CAPTCHA"),
    ]
    for indicator, name in challenges:
        if indicator in lower:
            return name
    return None


async def wait_for_content(
    page, selector: str, timeout: int = 30000, max_retries: int = 2
) -> bool:
    """Wait for a selector to appear, with captcha detection and retry.

    If a JS-based challenge (Cloudflare "just a moment") is detected,
    waits for it to auto-resolve before retrying. Many challenges
    resolve automatically in 5-15 seconds without user interaction.

    Args:
        page: The browser page.
        selector: CSS selector to wait for.
        timeout: Max time per attempt in ms.
        max_retries: Number of times to retry after challenge detection.

    Returns True if content was found.
    """
    for attempt in range(1 + max_retries):
        try:
            await page.wait_for_selector(selector, timeout=timeout)
            return True
        except Exception:
            challenge = await detect_challenge(page)
            if challenge:
                if attempt < max_retries:
                    # Many JS challenges (Cloudflare, DataDome) auto-resolve
                    # if you wait. Give it time before retrying.
                    wait_seconds = 8 + attempt * 5  # 8s, 13s
                    logger.info(
                        f"Challenge detected: {challenge}. "
                        f"Waiting {wait_seconds}s for auto-resolve "
                        f"(attempt {attempt + 1}/{1 + max_retries})..."
                    )
                    await asyncio.sleep(wait_seconds)

                    # Check if challenge resolved itself
                    still_challenged = await detect_challenge(page)
                    if still_challenged:
                        logger.info(f"Challenge still present: {still_challenged}. Retrying...")
                        # Try reloading the page — sometimes triggers a different
                        # challenge path that succeeds
                        try:
                            await page.reload(wait_until="domcontentloaded")
                            await asyncio.sleep(random.uniform(3, 5))
                        except Exception:
                            pass
                    else:
                        logger.info("Challenge appears resolved. Checking for content...")
                        # Challenge gone — try the selector one more time
                        try:
                            await page.wait_for_selector(selector, timeout=10000)
                            return True
                        except Exception:
                            pass
                else:
                    logger.warning(
                        f"Anti-bot challenge persists after {max_retries} retries: {challenge}. "
                        "Try setting PROXY_URL to a residential proxy."
                    )
                    # Take debug screenshot
                    try:
                        os.makedirs("screenshots", exist_ok=True)
                        await page.screenshot(
                            path=f"screenshots/challenge_{challenge.lower().replace(' ', '_')}.png"
                        )
                        logger.info("Challenge screenshot saved to screenshots/")
                    except Exception:
                        pass
                    return False
            else:
                logger.warning(f"Timeout waiting for selector: {selector}")
                return False

    return False
