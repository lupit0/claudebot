"""Browser automation utilities with pydoll (primary) and Patchright (fallback).

Pydoll connects directly to Chrome via CDP (no WebDriver), providing:
- Native Cloudflare Turnstile bypass
- Built-in human-like interactions (Bezier mouse, natural typing)
- No chromedriver version matching needed
- No add_init_script DNS issues

Falls back to Patchright if pydoll is not installed.
"""

from __future__ import annotations

import asyncio
import logging
import os
import random
from contextlib import asynccontextmanager
from typing import AsyncGenerator, Optional

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Shared configuration
# ---------------------------------------------------------------------------

_USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Safari/605.1.15",
]

_VIEWPORTS = [
    {"width": 1920, "height": 1080},
    {"width": 1366, "height": 768},
    {"width": 1536, "height": 864},
    {"width": 1440, "height": 900},
    {"width": 1280, "height": 720},
]


def _get_proxy_pool() -> list[str]:
    """Get list of proxies for rotation."""
    pool = os.getenv("PROXY_POOL", "").strip()
    if not pool:
        single = os.getenv("PROXY_URL", "").strip()
        return [single] if single else []
    return [p.strip() for p in pool.split(",") if p.strip()]


def _pick_random_proxy() -> Optional[str]:
    """Pick a random proxy URL from the pool."""
    pool = _get_proxy_pool()
    return random.choice(pool) if pool else None


def _detect_locale_timezone() -> tuple[str, str]:
    """Detect locale/timezone matching VPS region.

    Uses BROWSER_LOCALE / BROWSER_TIMEZONE env vars if set,
    defaults to en-GB / Europe/London for EU VPS.
    """
    locale = os.getenv("BROWSER_LOCALE", "").strip()
    tz = os.getenv("BROWSER_TIMEZONE", "").strip()
    if locale and tz:
        return locale, tz
    return "en-GB", "Europe/London"


# ---------------------------------------------------------------------------
# Human-like behaviour helpers
# ---------------------------------------------------------------------------

async def human_delay(min_s: float = 1.0, max_s: float = 3.0):
    """Wait a random human-like duration."""
    await asyncio.sleep(random.uniform(min_s, max_s))


async def human_scroll(page, direction: str = "down", distance: int = 300):
    """Scroll the page in a human-like manner."""
    delta = distance if direction == "down" else -distance
    steps = random.randint(3, 6)
    for _ in range(steps):
        step_delta = delta // steps + random.randint(-20, 20)
        try:
            # Works for both PydollPageAdapter and Playwright page
            await page.mouse.wheel(0, step_delta)
        except (AttributeError, Exception):
            # Fallback: JS scroll
            try:
                await page.evaluate(f"window.scrollBy(0, {step_delta})")
            except Exception:
                pass
        await asyncio.sleep(random.uniform(0.05, 0.15))


# ---------------------------------------------------------------------------
# Pydoll page adapter — wraps pydoll's Tab to match Playwright's Page API
# so scrapers work unchanged
# ---------------------------------------------------------------------------

class _PydollMouseAdapter:
    """Minimal adapter for page.mouse.wheel() calls."""

    def __init__(self, tab):
        self._tab = tab

    async def wheel(self, x: float, y: float):
        await self._tab.execute_script(f"window.scrollBy({x}, {y})")


class _PydollElementAdapter:
    """Wraps pydoll WebElement to match Playwright element API."""

    def __init__(self, element):
        self._el = element

    async def inner_text(self) -> str:
        try:
            return await self._el.text
        except Exception:
            return ""

    async def click(self):
        await self._el.click()


class _PydollLocatorAdapter:
    """Minimal adapter for page.locator(selector).first pattern."""

    def __init__(self, tab, selector: str):
        self._tab = tab
        self._selector = selector
        self.first = self  # locator.first returns itself

    async def is_visible(self, timeout: int = 500) -> bool:
        try:
            el = await self._tab.query(
                self._selector,
                timeout=max(1, timeout // 1000),
                raise_exc=False,
            )
            if el is None:
                return False
            # Check visibility via JS
            result = await self._tab.execute_script(
                """
                const el = document.querySelector(arguments[0]);
                if (!el) return false;
                const style = window.getComputedStyle(el);
                return style.display !== 'none' && style.visibility !== 'hidden'
                    && el.offsetHeight > 0;
                """,
                return_by_value=True,
            )
            return bool(getattr(result, 'value', result))
        except Exception:
            return False

    async def click(self):
        try:
            el = await self._tab.query(self._selector, timeout=2, raise_exc=False)
            if el:
                await el.click()
        except Exception:
            pass


class PydollPageAdapter:
    """Wraps pydoll Tab to provide Playwright-compatible Page interface.

    This lets existing scrapers work unchanged when using pydoll as backend.
    """

    def __init__(self, tab, browser):
        self._tab = tab
        self._browser = browser
        self._url = ""
        self.mouse = _PydollMouseAdapter(tab)
        # Empty frames list — pydoll accesses iframes via CDP directly
        self.frames = []

    @property
    def url(self) -> str:
        return self._url

    @property
    def pydoll_tab(self):
        """Access the raw pydoll Tab for native CAPTCHA bypass."""
        return self._tab

    async def goto(self, url: str, wait_until: str = "domcontentloaded", **kwargs):
        """Navigate to URL. Maps to tab.go_to()."""
        await self._tab.go_to(url, timeout=60)
        self._url = url
        # Update URL in case of redirects
        try:
            self._url = await self._tab.current_url
        except Exception:
            pass

    async def content(self) -> str:
        """Get full page HTML."""
        try:
            return await self._tab.page_source
        except Exception:
            return ""

    async def evaluate(self, expression: str):
        """Execute JavaScript and return result."""
        try:
            result = await self._tab.execute_script(
                expression if "return " in expression else f"return ({expression})",
                return_by_value=True,
            )
            # Pydoll returns EvaluateResponse objects; extract the value
            if hasattr(result, 'value'):
                return result.value
            if hasattr(result, 'result') and hasattr(result.result, 'value'):
                return result.result.value
            return result
        except Exception as e:
            logger.debug(f"evaluate failed: {e}")
            return None

    async def query_selector_all(self, selector: str) -> list:
        """Find all elements matching selector."""
        try:
            elements = await self._tab.query(selector, find_all=True, raise_exc=False)
            if elements is None:
                return []
            if not isinstance(elements, list):
                return [_PydollElementAdapter(elements)]
            return [_PydollElementAdapter(el) for el in elements]
        except Exception:
            return []

    async def wait_for_selector(self, selector: str, timeout: int = 30000):
        """Wait for selector to appear. Timeout in ms."""
        # Try each selector if comma-separated
        selectors = [s.strip() for s in selector.split(",")]
        timeout_s = max(1, timeout // 1000)

        for sel in selectors:
            try:
                el = await self._tab.query(sel, timeout=timeout_s, raise_exc=False)
                if el is not None:
                    return _PydollElementAdapter(el)
            except Exception:
                continue

        raise TimeoutError(f"Selector not found within {timeout}ms: {selector}")

    async def inner_text(self, selector: str) -> str:
        """Get inner text of element matching selector."""
        try:
            result = await self._tab.execute_script(
                f"return document.querySelector('{selector}')?.innerText || ''",
                return_by_value=True,
            )
            val = getattr(result, 'value', result)
            if hasattr(val, 'value'):
                val = val.value
            return str(val) if val else ""
        except Exception:
            return ""

    async def screenshot(self, path: str = None, **kwargs):
        """Take a screenshot."""
        try:
            if path:
                await self._tab.take_screenshot(path=path)
            else:
                return await self._tab.take_screenshot(as_base64=True)
        except Exception as e:
            logger.debug(f"Screenshot failed: {e}")

    async def reload(self, wait_until: str = "domcontentloaded", **kwargs):
        """Reload the current page."""
        await self._tab.refresh()
        try:
            self._url = await self._tab.current_url
        except Exception:
            pass

    async def wait_for_url(self, pattern: str, timeout: int = 10000):
        """Wait for URL to match pattern (glob-style)."""
        import fnmatch
        deadline = asyncio.get_event_loop().time() + timeout / 1000
        while asyncio.get_event_loop().time() < deadline:
            try:
                current = await self._tab.current_url
                self._url = current
                if fnmatch.fnmatch(current, pattern):
                    return
            except Exception:
                pass
            await asyncio.sleep(0.5)

    def locator(self, selector: str):
        """Return a locator adapter for Playwright-style queries."""
        return _PydollLocatorAdapter(self._tab, selector)


# ---------------------------------------------------------------------------
# Browser creation — pydoll primary, patchright fallback
# ---------------------------------------------------------------------------

@asynccontextmanager
async def create_browser(
    headless: bool = True,
    proxy: Optional[dict] = None,
    slow_mo: int = 0,
    persistent_context_dir: Optional[str] = None,
) -> AsyncGenerator:
    """Create a browser instance for scraping.

    Tries pydoll (CDP-based, no WebDriver) first for better anti-detection.
    Falls back to Patchright if pydoll is not available.

    Yields (page, context) where page is a Playwright-compatible interface.
    """
    try:
        async with _create_pydoll_browser(headless, proxy) as result:
            yield result
            return
    except ImportError:
        logger.info("pydoll not installed, falling back to Patchright")
    except Exception as e:
        logger.warning(f"pydoll browser failed: {e}, falling back to Patchright")

    async with _create_patchright_browser(
        headless, proxy, slow_mo, persistent_context_dir
    ) as result:
        yield result


@asynccontextmanager
async def _create_pydoll_browser(
    headless: bool = True,
    proxy: Optional[dict] = None,
) -> AsyncGenerator:
    """Create browser using pydoll (direct CDP, no WebDriver)."""
    from pydoll.browser import Chrome
    from pydoll.browser.options import ChromiumOptions

    proxy_url = None
    if proxy and "server" in proxy:
        proxy_url = proxy["server"]
    elif proxy is None:
        proxy_url = _pick_random_proxy()

    locale, timezone = _detect_locale_timezone()
    viewport = random.choice(_VIEWPORTS)
    user_agent = random.choice(_USER_AGENTS)

    options = ChromiumOptions()
    options.headless = headless

    # Anti-detection args
    options.add_argument("--disable-blink-features=AutomationControlled")
    options.add_argument("--no-first-run")
    options.add_argument("--no-default-browser-check")
    options.add_argument("--disable-dev-shm-usage")
    options.add_argument("--disable-infobars")
    options.add_argument(f"--window-size={viewport['width']},{viewport['height']}")
    options.add_argument(f"--user-agent={user_agent}")
    options.add_argument(f"--lang={locale}")

    if proxy_url:
        options.add_argument(f"--proxy-server={proxy_url}")

    # Set language preferences to match locale
    options.set_accept_languages(f"{locale},{locale.split('-')[0]},en")
    options.block_notifications = True

    async with Chrome(options=options) as browser:
        tab = await browser.start(headless=headless)

        # Set timezone via CDP
        try:
            await tab.execute_script(
                f"""
                // Patch timezone for Intl.DateTimeFormat
                const _origDTF = Intl.DateTimeFormat;
                Intl.DateTimeFormat = function(locales, opts) {{
                    opts = opts || {{}};
                    if (!opts.timeZone) opts.timeZone = '{timezone}';
                    return new _origDTF(locales, opts);
                }};
                Object.setPrototypeOf(Intl.DateTimeFormat, _origDTF);
                """
            )
        except Exception:
            pass

        page = PydollPageAdapter(tab, browser)
        yield page, browser


@asynccontextmanager
async def _create_patchright_browser(
    headless: bool = True,
    proxy: Optional[dict] = None,
    slow_mo: int = 0,
    persistent_context_dir: Optional[str] = None,
) -> AsyncGenerator:
    """Fallback: create browser using Patchright (patched Playwright)."""
    try:
        from patchright.async_api import async_playwright
    except ImportError:
        logger.warning("Patchright not installed. Falling back to standard Playwright.")
        from playwright.async_api import async_playwright

    if proxy is None:
        proxy_url = _pick_random_proxy()
        proxy = {"server": proxy_url} if proxy_url else None

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
            merged = {**launch_args, **context_args}
            context = await p.chromium.launch_persistent_context(
                persistent_context_dir, **merged
            )
            page = context.pages[0] if context.pages else await context.new_page()
            try:
                yield page, context
            finally:
                await context.close()
        else:
            browser = await p.chromium.launch(**launch_args)
            context = await browser.new_context(**context_args)
            page = await context.new_page()
            try:
                yield page, context
            finally:
                await context.close()
                await browser.close()


# ---------------------------------------------------------------------------
# Cookie consent, challenge detection, and content waiting
# ---------------------------------------------------------------------------

async def dismiss_cookie_consent(page, timeout: int = 5000) -> bool:
    """Dismiss cookie consent dialogs (GDPR, CCPA, etc.).

    Works with both pydoll and Playwright page objects.
    """
    # Use JavaScript-based approach that works with any backend
    consent_texts = [
        "Accept all", "Accept All", "Reject all", "Reject All",
        "Accept", "Accept cookies", "Accept Cookies",
        "I agree", "I Agree", "Agree", "Allow all", "Allow All",
        "Allow cookies", "Got it", "OK", "Continue",
        "Tout accepter", "Alle akzeptieren", "Aceptar todo",
    ]

    # Try JS-based button clicking (works with both pydoll and patchright)
    for text in consent_texts:
        try:
            clicked = await page.evaluate(f"""() => {{
                const buttons = document.querySelectorAll('button, [role="button"], a.button');
                for (const btn of buttons) {{
                    const t = (btn.textContent || '').trim();
                    if (t === '{text}' || t.toLowerCase() === '{text.lower()}') {{
                        btn.click();
                        return true;
                    }}
                }}
                return false;
            }}""")
            if clicked:
                logger.info(f"Dismissed cookie consent via JS: '{text}'")
                await asyncio.sleep(random.uniform(0.5, 1.5))
                return True
        except Exception:
            continue

    # Try ID/class-based selectors via JS
    id_selectors = [
        "#acceptCookieButton",
        "#onetrust-accept-btn-handler",
        "#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll",
        "#didomi-notice-agree-button",
        ".cookie-consent-accept",
        "[data-testid='cookie-accept']",
        "[data-cookiebanner='accept_button']",
        ".cc-accept",
        ".cc-btn.cc-dismiss",
        ".consent-accept",
        ".dCnC-mod-close",
    ]
    for sel in id_selectors:
        try:
            clicked = await page.evaluate(f"""() => {{
                const el = document.querySelector('{sel}');
                if (el) {{ el.click(); return true; }}
                return false;
            }}""")
            if clicked:
                logger.info(f"Dismissed cookie consent via selector: {sel}")
                await asyncio.sleep(random.uniform(0.5, 1.5))
                return True
        except Exception:
            continue

    # Handle consent.google.com redirect
    try:
        current_url = page.url if isinstance(page.url, str) else await page.url
    except Exception:
        current_url = ""

    if "consent.google" in current_url:
        logger.info("On consent.google.com, clicking form button...")
        try:
            clicked = await page.evaluate("""() => {
                const btn = document.querySelector('form button') ||
                            document.querySelector('button');
                if (btn) { btn.click(); return true; }
                return false;
            }""")
            if clicked:
                logger.info("Dismissed consent.google.com")
                await asyncio.sleep(random.uniform(1.0, 2.0))
                try:
                    await page.wait_for_url("**/*google.com/travel/**", timeout=10000)
                except Exception:
                    pass
                return True
        except Exception:
            pass

    return False


async def detect_challenge(page) -> Optional[str]:
    """Check if the page shows a captcha or anti-bot challenge."""
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


async def try_bypass_cloudflare(page) -> bool:
    """Attempt to bypass Cloudflare Turnstile using pydoll's native bypass.

    Only works when the page adapter wraps a pydoll Tab.
    Returns True if bypass was attempted.
    """
    if not isinstance(page, PydollPageAdapter):
        return False

    tab = page.pydoll_tab
    try:
        await tab._bypass_cloudflare(time_to_wait_captcha=8)
        logger.info("Pydoll Cloudflare bypass attempted")
        await asyncio.sleep(2)
        return True
    except Exception as e:
        logger.debug(f"Cloudflare bypass failed: {e}")
        return False


async def wait_for_content(
    page, selector: str, timeout: int = 30000, max_retries: int = 2
) -> bool:
    """Wait for selector to appear, with CAPTCHA detection and auto-bypass.

    Uses pydoll's native Cloudflare bypass when available.
    """
    for attempt in range(1 + max_retries):
        try:
            await page.wait_for_selector(selector, timeout=timeout)
            return True
        except Exception:
            challenge = await detect_challenge(page)
            if challenge:
                if attempt < max_retries:
                    wait_seconds = 8 + attempt * 5

                    # Try pydoll's native Cloudflare bypass first
                    if "cloudflare" in challenge.lower() or "turnstile" in challenge.lower():
                        bypassed = await try_bypass_cloudflare(page)
                        if bypassed:
                            # Check if challenge resolved
                            still_challenged = await detect_challenge(page)
                            if not still_challenged:
                                logger.info("Cloudflare bypass succeeded!")
                                try:
                                    await page.wait_for_selector(selector, timeout=10000)
                                    return True
                                except Exception:
                                    pass

                    logger.info(
                        f"Challenge detected: {challenge}. "
                        f"Waiting {wait_seconds}s for auto-resolve "
                        f"(attempt {attempt + 1}/{1 + max_retries})..."
                    )
                    await asyncio.sleep(wait_seconds)

                    still_challenged = await detect_challenge(page)
                    if still_challenged:
                        logger.info(f"Challenge still present: {still_challenged}. Retrying...")
                        try:
                            await page.reload(wait_until="domcontentloaded")
                            await asyncio.sleep(random.uniform(3, 5))
                        except Exception:
                            pass
                    else:
                        logger.info("Challenge appears resolved.")
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
