# Binance Futures Browser Catalog

A static GitHub Pages experiment that requests Binance Futures public market data directly from the visitor's browser. No server or API keys are used.

## Data and completeness

- Binance USDⓈ-M and COIN-M `exchangeInfo` provide the active contract universe.
- Binance 24-hour ticker endpoints provide last price, 24-hour change, and USDⓈ-M quote volume.
- CoinGecko's Binance Futures derivatives endpoint optionally adds coin links, open interest, and funding rates when contract symbol, base asset, and quote asset match uniquely. CoinGecko does **not** determine the full contract universe.
- If either Binance `exchangeInfo` request fails, the page labels its data **Partial**. Failed tickers leave their metrics blank. CoinGecko failures leave its metrics blank.
- COIN-M 24-hour volume is intentionally blank because Binance's `baseVolume` is in base-asset units and is not comparable to USDⓈ-M quote volume.
- Access depends on the visitor's network and Binance's availability and access rules. This experiment does not bypass provider restrictions.
- CoinMarketCap has no verified token search URL for direct linking, so its per-token lookup opens a Google search restricted to CoinMarketCap currency pages. Symbol matches should be checked before relying on an asset identity.

The page makes requests on load and on Refresh. CoinGecko results are reused for up to ten minutes in browser session storage; Refresh fetches a new result. Other sources use the page's two-minute in-memory cache. No credentials or user data are stored or transmitted by the site.

The contract list supports text search, market/type/quote and supplemental-data filters, minimum volume and open-interest thresholds, CSV export, and sorting by clicking any sortable column heading. Click the same heading again to reverse its direction. On narrow screens, scroll the table horizontally to reach more columns.

## Run locally

```sh
npm run serve
```

Open `http://localhost:4173/` in a browser. `npm test` checks the catalog normalization and filtering helpers.

## Publish

GitHub Pages serves the `main` branch root. The public site is at `https://smallyunet.github.io/binance-futures-browser-catalog/`.
