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

    launch_args = {
        "headless": headless,
        "slow_mo": slow_mo,
        "args": [
            "--disable-blink-features=AutomationControlled",
            "--disable-features=IsolateOrigins,site-per-process",
            "--no-first-run",
            "--no-default-browser-check",
        ],
    }
    if proxy:
        launch_args["proxy"] = proxy

    async with async_playwright() as p:
        if persistent_context_dir:
            # Persistent context preserves cookies/localStorage across sessions
            context = await p.chromium.launch_persistent_context(
                persistent_context_dir, **launch_args
            )
            page = context.pages[0] if context.pages else await context.new_page()
            try:
                yield page, context
            finally:
                await context.close()
        else:
            browser = await p.chromium.launch(**launch_args)
            context = await browser.new_context(
                viewport={"width": 1366, "height": 768},
                locale="en-US",
                timezone_id="America/New_York",
            )
            page = await context.new_page()
            try:
                yield page, context
            finally:
                await context.close()
                await browser.close()


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


async def wait_for_content(page, selector: str, timeout: int = 30000) -> bool:
    """Wait for a selector to appear, handling potential challenges."""
    try:
        await page.wait_for_selector(selector, timeout=timeout)
        return True
    except Exception:
        # Check if we hit a CAPTCHA or challenge page
        content = await page.content()
        challenge_indicators = [
            "cf-challenge",
            "captcha",
            "verify you are human",
            "checking your browser",
            "just a moment",
            "datadome",
            "perimeterx",
        ]
        for indicator in challenge_indicators:
            if indicator.lower() in content.lower():
                logger.warning(
                    f"Anti-bot challenge detected ({indicator}). "
                    "Consider using a residential proxy or waiting."
                )
                return False
        logger.warning(f"Timeout waiting for selector: {selector}")
        return False
