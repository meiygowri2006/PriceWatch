# scraper/scraper.py
import sys
from urllib.parse import urlparse

import requests
from bs4 import BeautifulSoup
from pymongo.errors import PyMongoError
from requests.exceptions import RequestException

from database import get_products_collection, verify_connection

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/120.0.0.0 Safari/537.36"
    ),
    "Accept-Language": "en-US, en;q=0.5",
}
REQUEST_TIMEOUT_SECONDS = 10


def _is_valid_url(url: str) -> bool:
    try:
        parsed = urlparse(url)
        return parsed.scheme in ("http", "https") and bool(parsed.netloc)
    except Exception:
        return False


def scrape_product_price(url: str) -> tuple[float | None, str | None]:
    """
    Scrape the current price from an Amazon India product page.
    Returns (price, error_message). On success, error_message is None.
    """
    if not url or not isinstance(url, str):
        return None, "Missing or invalid product URL"

    url = url.strip()
    if not _is_valid_url(url):
        return None, f"Malformed URL: {url}"

    try:
        response = requests.get(
            url,
            headers=HEADERS,
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
        price_element = soup.find("span", {"class": "a-price-whole"})

        if not price_element:
            return None, "Price element not found on page"

        price_text = price_element.get_text().strip()
        clean_price = "".join(c for c in price_text if c.isdigit() or c == ".")

        if clean_price.endswith("."):
            clean_price = clean_price[:-1]

        if not clean_price:
            return None, f"Could not parse price from text: {price_text!r}"

        return float(clean_price), None
    except ValueError as exc:
        return None, f"Invalid price format: {exc}"
    except Exception as exc:
        return None, f"Unexpected scraping error: {exc}"


def update_all_product_prices() -> dict[str, int]:
    """
    Fetch every saved product, scrape its current price, and update MongoDB.
    Broken URLs are logged and skipped without stopping the loop.
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

        if not product_url:
            print("  🔴 Skipped: empty product URL\n")
            summary["skipped"] += 1
            continue

        price, error = scrape_product_price(product_url)
        if error:
            print(f"  🔴 Failed: {error}\n")
            summary["failed"] += 1
            continue

        try:
            result = collection.update_one(
                {"_id": product_id},
                {"$set": {"current_price": price}},
            )
        except PyMongoError as exc:
            print(f"  🔴 Database update failed: {exc}\n")
            summary["failed"] += 1
            continue

        if result.modified_count:
            print(f"  🟢 Updated current_price to ₹{price}\n")
        else:
            print(f"  🟡 Price unchanged at ₹{price}\n")

        summary["updated"] += 1

    return summary


def main() -> int:
    try:
        verify_connection()
    except (PyMongoError, ValueError) as exc:
        print(f"🔴 MongoDB connection failed: {exc}")
        return 1

    try:
        summary = update_all_product_prices()
    except PyMongoError as exc:
        print(f"🔴 Database error during price update: {exc}")
        return 1

    print("--- Summary ---")
    print(f"Total products: {summary['total']}")
    print(f"Successfully updated: {summary['updated']}")
    print(f"Failed: {summary['failed']}")
    print(f"Skipped: {summary['skipped']}")

    return 0 if summary["failed"] == 0 and summary["skipped"] == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
