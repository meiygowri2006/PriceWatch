# database.py
import os
from dotenv import load_dotenv
from pymongo import MongoClient
from pymongo.collection import Collection
from pymongo.database import Database

load_dotenv()

MONGO_URI = os.getenv("MONGO_URI")
MONGO_DB_NAME = os.getenv("MONGO_DB_NAME", "test")
PRODUCTS_COLLECTION = "products"

_client: MongoClient | None = None


def get_client() -> MongoClient:
    global _client
    if _client is None:
        if not MONGO_URI:
            raise ValueError("MONGO_URI is not set. Add it to scraper/.env")
        _client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=10000)
    return _client


def get_database() -> Database:
    return get_client()[MONGO_DB_NAME]


def get_products_collection() -> Collection:
    return get_database()[PRODUCTS_COLLECTION]


def verify_connection() -> None:
    get_client().admin.command("ping")
    print("🟢 Python successfully connected to MongoDB!")
