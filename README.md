# 🟢 PriceWatch

**An Enterprise-Grade Automated E-Commerce Price Tracking Engine.**

PriceWatch allows users to monitor product prices across major e-commerce platforms (like Amazon and Flipkart). Users can create an account, paste a product URL, set a target price, and let the automated Python scraping engine track the current price. 

## ✨ Features
* **Secure Authentication:** JWT-based session management with modern Google Identity Services (OAuth 2.0) and standard Email/Password login.
* **Interactive Dashboard:** A clean, MongoDB-inspired light theme with a dynamic Vanilla JS single-page application (SPA) feel.
* **Automated Scraping:** A dedicated Python engine that fetches live HTML data to update product prices in the database.
* **Full CRUD Capabilities:** Users can add trackers, view their tracking "Wallet", and securely delete their accounts (along with their orphaned data).

---

## 🛠️ Tech Stack
This project is separated into a modular microservice architecture:
* **Frontend:** HTML5, CSS3, Vanilla JavaScript (No Frameworks)
* **Backend API:** Node.js, Express.js
* **Database:** MongoDB Atlas (via Mongoose)
* **Web Scraper:** Python 3, BeautifulSoup4
* **Authentication:** `@google/oauth2-client`, `bcryptjs`, `jsonwebtoken`

---

## 🚀 Local Development Setup

### Prerequisites
* [Node.js](https://nodejs.org/) (v16+)
* [Python](https://www.python.org/) (v3.8+)
* A [MongoDB Atlas](https://www.mongodb.com/cloud/atlas) Cluster
* A [Google Cloud Console](https://console.cloud.google.com/) Project (for OAuth)

### 1. Clone the Repository
```bash
git clone [https://github.com/yourusername/pricewatch.git](https://github.com/yourusername/pricewatch.git)
cd pricewatch