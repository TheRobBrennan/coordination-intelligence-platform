"""Fetch an org's landing page HTML with Playwright (handles JS-rendered sites).

Kept tiny and isolated so the rest of the pipeline can be tested against
recorded fixtures without a browser. Respect robots/ToS per org in production.
"""

from __future__ import annotations


async def fetch_html(url: str, *, timeout_ms: int = 20_000) -> str:
    from playwright.async_api import async_playwright

    async with async_playwright() as p:
        browser = await p.chromium.launch()
        try:
            page = await browser.new_page()
            await page.goto(url, timeout=timeout_ms, wait_until="domcontentloaded")
            return await page.content()
        finally:
            await browser.close()
