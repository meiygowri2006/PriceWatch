# scraper/scraper.py
import re
import sys
import time
import traceback
from urllib.parse import urlparse

import requests
from bs4 import BeautifulSoup
from pymongo.errors import PyMongoError
from requests.exceptions import RequestException

from database import get_products_collection, verify_connection

SCRAPE_INTERVAL_SECONDS = 3600
REQUEST_TIMEOUT_SECONDS = 15

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/122.0.0.0 Safari/537.36"
    ),
    "Accept": (
        "text/html,application/xhtml+xml,application/xml;q=0.9,"
        "image/avif,image/webp,image/apng,*/*;q=0.8"
    ),
    "Accept-Language": "en-IN,en-US;q=0.9,en;q=0.8",
    "Accept-Encoding": "gzip, deflate, br",
    "Connection": "keep-alive",
    "Upgrade-Insecure-Requests": "1",
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
    "Sec-Fetch-User": "?1",
    "Cache-Control": "max-age=0",
    "DNT": "1",
}

AMAZON_PRICE_SELECTORS = [
    "span.a-price-whole",
    "span.a-offscreen",
    "#priceblock_ourprice",
    "#priceblock_dealprice",
    "span#priceblock_saleprice",
    "span.a-color-price",
]

FLIPKART_PRICE_SELECTORS = [
    "div.Nx9bqj.CxhGGd",
    "div._30jeq3._16Jk6d",
    "div._30jeq3",
    "div.CxhGGd",
    "div[class*='Nx9bqj']",
    "span[class*='_16Jk6d']",
]


def _is_valid_url(url: str) -> bool:
    try:
        parsed = urlparse(url)
        return parsed.scheme in ("http", "https") and bool(parsed.netloc)
    except Exception:
        return False


def _get_site_key(url: str) -> str | None:
    host = urlparse(url).netloc.lower()
    if "amazon" in host:
        return "amazon"
    if "flipkart" in host:
        return "flipkart"
    return None


def _build_request_headers(url: str) -> dict[str, str]:
    headers = HEADERS.copy()
    site = _get_site_key(url)

    if site == "amazon":
        headers["Referer"] = "https://www.amazon.in/"
    elif site == "flipkart":
        headers["Referer"] = "https://www.flipkart.com/"

    return headers


def clean_price(raw_text: str) -> float | None:
    """
    Strip currency symbols, commas, and whitespace, then convert to float.
    Returns None if the value cannot be parsed safely.
    """
    if not raw_text or not isinstance(raw_text, str):
        return None

    text = raw_text.strip()
    text = text.replace("\u20b9", "").replace("₹", "").replace("$", "").replace("€", "").replace("£", "")
    text = text.replace(",", "").replace(" ", "").replace("\xa0", "")

    match = re.search(r"(\d+(?:\.\d+)?)", text)
    if not match:
        return None

    try:
        value = float(match.group(1))
    except ValueError:
        return None

    if value <= 0:
        return None

    return value


def _extract_price_from_selectors(soup: BeautifulSoup, selectors: list[str]) -> float | None:
    for selector in selectors:
        try:
            element = soup.select_one(selector)
        except Exception:
            element = None

        if not element:
            continue

        for candidate in (
            element.get_text(strip=True),
            element.get("content", "").strip(),
            element.get("aria-label", "").strip(),
        ):
            price = clean_price(candidate)
            if price is not None:
                return price

    return None


def _scrape_amazon_price(soup: BeautifulSoup) -> float | None:
    return _extract_price_from_selectors(soup, AMAZON_PRICE_SELECTORS)


def _scrape_flipkart_price(soup: BeautifulSoup) -> float | None:
    price = _extract_price_from_selectors(soup, FLIPKART_PRICE_SELECTORS)
    if price is not None:
        return price

    # Fallback: meta tags sometimes expose offer price on Flipkart pages
    meta = soup.find("meta", {"property": "og:price:amount"})
    if meta and meta.get("content"):
        return clean_price(meta["content"])

    return None


def scrape_product_price(url: str) -> tuple[float | None, str | None]:
    """
    Scrape the current price from a supported e-commerce product page.
    Returns (price, error_message). On success, error_message is None.
    """
    if not url or not isinstance(url, str):
        return None, "Missing or invalid product URL"

    url = url.strip()
    if not _is_valid_url(url):
        return None, f"Malformed URL: {url}"

    site = _get_site_key(url)
    if site is None:
        return None, "Unsupported site. Only Amazon and Flipkart URLs are supported."

    try:
        response = requests.get(
            url,
            headers=_build_request_headers(url),
            timeout=REQUEST_TIMEOUT_SECONDS,
            allow_redirects=True,
        )
    except RequestException as exc:
        return None, f"Request failed: {exc}"

    if response.status_code == 404:
        return None, "Product page not found (404)"
    if response.status_code >= 400:
        return None, f"HTTP error {response.status_code}"

    try:
        soup = BeautifulSoup(response.text, "html.parser")

        if site == "amazon":
            price = _scrape_amazon_price(soup)
        else:
            price = _scrape_flipkart_price(soup)

        if price is None:
            return None, f"Price element not found on {site} page"

        return price, None
    except Exception as exc:
        return None, f"Unexpected scraping error: {exc}"


def update_all_product_prices() -> dict[str, int]:
    """
    Fetch every saved product, scrape its current price, and update MongoDB.
    Individual product failures are logged and skipped without stopping the loop.
    """
    collection = get_products_collection()
    products = list(
        collection.find(
            {"product_url": {"$exists": True, "$ne": ""}},
            {"product_name": 1, "product_url": 1, "current_price": 1},
        )
    )

    summary = {"total": len(products), "updated": 0, "failed": 0, "skipped": 0}

    if not products:
        print("No products found in the database.")
        return summary

    print(f"Found {len(products)} product(s) to scrape.\n")

    for product in products:
        product_id = product["_id"]
        product_name = product.get("product_name", "Unknown product")
        product_url = product.get("product_url", "").strip()

        print(f"Scraping: {product_name}")
        print(f"  URL: {product_url}")

        try:
            if not product_url:
                print("  🔴 Skipped: empty product URL\n")
                summary["skipped"] += 1
                continue

            price, error = scrape_product_price(product_url)
            if error:
                print(f"  🔴 Failed: {error}\n")
                summary["failed"] += 1
                continue

            result = collection.update_one(
                {"_id": product_id},
                {"$set": {"current_price": price}},
            )

            if result.modified_count:
                print(f"  🟢 Updated current_price to ₹{price:.2f}\n")
            else:
                print(f"  🟡 Price recorded as ₹{price:.2f} (no document change)\n")

            summary["updated"] += 1
        except PyMongoError as exc:
            print(f"  🔴 Database update failed: {exc}\n")
            summary["failed"] += 1
        except Exception as exc:
            print(f"  🔴 Unexpected error: {exc}\n")
            traceback.print_exc()
            summary["failed"] += 1

    return summary


def run_scrape_cycle() -> None:
    print(f"\n{'=' * 60}")
    print(f"Starting scrape cycle at {time.strftime('%Y-%m-%d %H:%M:%S UTC', time.gmtime())}")
    print(f"{'=' * 60}\n")

    try:
        verify_connection()
    except (PyMongoError, ValueError) as exc:
        print(f"🔴 MongoDB connection failed: {exc}")
        return

    try:
        summary = update_all_product_prices()
    except PyMongoError as exc:
        print(f"🔴 Database error during price update: {exc}")
        return
    except Exception as exc:
        print(f"🔴 Unexpected cycle error: {exc}")
        traceback.print_exc()
        return

    print("--- Summary ---")
    print(f"Total products: {summary['total']}")
    print(f"Successfully updated: {summary['updated']}")
    print(f"Failed: {summary['failed']}")
    print(f"Skipped: {summary['skipped']}")


def main() -> None:
    print("🚀 PriceWatch scraper worker started.")
    print(f"Scrape interval: {SCRAPE_INTERVAL_SECONDS} seconds ({SCRAPE_INTERVAL_SECONDS // 3600} hour(s))\n")

    while True:
        try:
            run_scrape_cycle()
        except Exception as exc:
            print(f"🔴 Critical error in scrape loop: {exc}")
            traceback.print_exc()

        print(f"\n⏳ Sleeping for {SCRAPE_INTERVAL_SECONDS} seconds before next cycle...\n")
        time.sleep(SCRAPE_INTERVAL_SECONDS)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n🛑 Scraper stopped by user.")
        sys.exit(0)
