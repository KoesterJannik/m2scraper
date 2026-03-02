# Metin2 Market Scanner Analysis

Based on: [metin2-marketscanner](https://github.com/uzunbugra/metin2-marketscanner)

## How the Original Repo Works

### Backend (Python/FastAPI)
- **Framework**: FastAPI
- **Scraping**: Playwright + BeautifulSoup4
- **Database**: SQLite
- **ORM**: SQLAlchemy
- **Scheduling**: `schedule` library for automated scraping

### Frontend (Next.js)
- **Framework**: Next.js (React)
- **Styling**: Tailwind CSS
- **HTTP Client**: Axios
- **Charts**: Chart.js / react-chartjs-2

## Market Data Structure

### Servers
The original repo supports multiple Metin2 servers:
- **Marmara** (most common)
- Other servers can be added

### Market Item Structure
```typescript
interface MarketItem {
  id: string;
  name: string;
  price: number;        // in Yang (in-game currency)
  seller: string;
  server: string;
  listedAt: Date;
  category?: string;
}
```

## Endpoints & Data Fetching

### How Data is Fetched

1. **Web Scraping Approach** (Original Python):
   - Uses Playwright to navigate to Metin2 market pages
   - Parses HTML with BeautifulSoup
   - Extracts item listings, prices, seller info
   - Stores in SQLite database

2. **API Approach** (If Available):
   - Some Metin2 servers may provide API endpoints
   - Format: `https://market.metin2.gameforge.com/{server}/api/market`
   - Returns JSON data with market listings

### Typical Market URLs

```
https://market.metin2.gameforge.com/{server}/market
https://{server}.metin2.gameforge.com/market
```

### Can You Fetch All Market Data at Once?

**Yes, but with limitations:**

1. **Pagination**: Market listings are usually paginated
   - Need to fetch multiple pages
   - Each page contains ~20-50 items
   - Total pages vary by server activity

2. **Rate Limiting**: 
   - Servers may limit requests per minute
   - Need delays between requests (500ms-1s recommended)

3. **Server-Specific**:
   - Each server has separate market data
   - Need to fetch from each server individually
   - Can parallelize server requests

## Languages & Technologies

### Original Repo:
- **Backend**: Python 3.8+
- **Frontend**: TypeScript/JavaScript (Next.js)
- **Database**: SQLite

### Our Implementation:
- **Backend**: TypeScript/Node.js (Express)
- **Frontend**: TypeScript/React (React Router)
- **Database**: PostgreSQL
- **Scraping**: Cheerio (TypeScript equivalent of BeautifulSoup)

## Usage

### Run the MVP Script

```bash
# From backend directory
npm run market:fetch

# Or directly with tsx
tsx src/scripts/fetch-market-data.ts
```

### What the Script Does

1. **Fetches market data from all configured servers**
2. **Handles pagination** (fetches multiple pages)
3. **Parses HTML** using Cheerio
4. **Displays summary** with top items
5. **Handles errors** gracefully

### Configuration

Edit `src/scripts/fetch-market-data.ts` to:
- Add more servers to `SERVERS` object
- Adjust `METIN2_MARKET_BASE_URL` to actual market URL
- Update HTML selectors based on actual market page structure
- Modify `maxPages` for pagination depth

## Next Steps

1. **Inspect actual Metin2 market HTML**:
   - Open market page in browser
   - Inspect element to find correct CSS selectors
   - Update selectors in the script

2. **Add database storage**:
   - Store fetched items in PostgreSQL
   - Track price history over time
   - Enable search and filtering

3. **Create API endpoints**:
   - `/api/market/:server` - Get market data for server
   - `/api/market/:server/items` - Search/filter items
   - `/api/market/:server/history` - Price history

4. **Add scheduling**:
   - Use `node-cron` to run scraper periodically
   - Keep database updated with latest listings
