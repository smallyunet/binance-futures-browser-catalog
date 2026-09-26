export const SOURCES = [
  { id: 'usdmInfo', label: 'USDⓈ-M contracts', url: 'https://fapi.binance.com/fapi/v1/exchangeInfo', required: true, kind: 'info' },
  { id: 'usdmTicker', label: 'USDⓈ-M 24h ticker', url: 'https://fapi.binance.com/fapi/v1/ticker/24hr', required: false, kind: 'ticker' },
  { id: 'coinmInfo', label: 'COIN-M contracts', url: 'https://dapi.binance.com/dapi/v1/exchangeInfo', required: true, kind: 'info' },
  { id: 'coinmTicker', label: 'COIN-M 24h ticker', url: 'https://dapi.binance.com/dapi/v1/ticker/24hr', required: false, kind: 'ticker' },
  { id: 'gecko', label: 'CoinGecko derivatives', url: 'https://api.coingecko.com/api/v3/derivatives/exchanges/binance_futures?include_tickers=all', required: false, kind: 'gecko' },
];

export function numberOrNull(value) {
  if (value === '' || value == null) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

const GECKO_CACHE_MS = 10 * 60 * 1000;

export async function fetchSource(source, { force = false } = {}) {
  const cacheKey = `binance-futures-catalog:${source.id}`;
  if (source.kind === 'gecko' && !force && typeof sessionStorage !== 'undefined') {
    try {
      const saved = JSON.parse(sessionStorage.getItem(cacheKey) ?? 'null');
      if (saved?.url === source.url && saved.expiresAt > Date.now() && Array.isArray(saved.value?.tickers)) return saved.value;
    } catch { /* Ignore unavailable or invalid browser storage. */ }
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(source.url, { signal: controller.signal, cache: source.kind === 'gecko' && !force ? 'default' : 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const value = await response.json();
    const valid = source.kind === 'info' ? Array.isArray(value?.symbols)
      : source.kind === 'ticker' ? Array.isArray(value)
      : Array.isArray(value?.tickers);
    if (!valid) throw new Error('Invalid response');
    if (source.kind === 'gecko' && typeof sessionStorage !== 'undefined') {
      try { sessionStorage.setItem(cacheKey, JSON.stringify({ url: source.url, expiresAt: Date.now() + GECKO_CACHE_MS, value })); }
      catch { /* Browser storage limits do not prevent a fresh response. */ }
    }
    return value;
  } finally {
    clearTimeout(timer);
  }
}

export function buildCatalog(values) {
  const geckoBySymbol = new Map();
  for (const ticker of values.gecko?.tickers ?? []) {
    const matches = geckoBySymbol.get(ticker.symbol) ?? [];
    matches.push(ticker);
    geckoBySymbol.set(ticker.symbol, matches);
  }

  const markets = [
    { market: 'USD-M', info: values.usdmInfo, tickers: values.usdmTicker },
    { market: 'COIN-M', info: values.coinmInfo, tickers: values.coinmTicker },
  ];
  return markets.flatMap(({ market, info, tickers }) => {
    const tickerBySymbol = new Map((tickers ?? []).map(ticker => [ticker.symbol, ticker]));
    return (info?.symbols ?? [])
      .filter(symbol => (symbol.status ?? symbol.contractStatus) === 'TRADING')
      .map(symbol => {
        const ticker = tickerBySymbol.get(symbol.symbol);
        const matches = (geckoBySymbol.get(symbol.symbol) ?? []).filter(candidate =>
          candidate.base === symbol.baseAsset && candidate.target === symbol.quoteAsset);
        const gecko = matches.length === 1 ? matches[0] : null;
        return {
          market,
          symbol: symbol.symbol,
          baseAsset: symbol.baseAsset,
          quoteAsset: symbol.quoteAsset,
          contractType: symbol.contractType,
          onboardDate: numberOrNull(symbol.onboardDate),
          deliveryDate: symbol.contractType === 'PERPETUAL' ? null : numberOrNull(symbol.deliveryDate),
          lastPrice: numberOrNull(ticker?.lastPrice),
          priceChangePercent: numberOrNull(ticker?.priceChangePercent),
          quoteVolume: market === 'USD-M' ? numberOrNull(ticker?.quoteVolume) : null,
          coinGeckoId: gecko?.coin_id ?? null,
          openInterestUsd: numberOrNull(gecko?.open_interest_usd),
          fundingRate: numberOrNull(gecko?.funding_rate),
          geckoLastTraded: numberOrNull(gecko?.last_traded),
          binanceUrl: typeof gecko?.trade_url === 'string' && gecko.trade_url.startsWith('https://www.binance.com/')
            ? gecko.trade_url
            : market === 'USD-M' ? `https://www.binance.com/en/futures/${encodeURIComponent(symbol.symbol)}` : null,
        };
      });
  });
}

export function filterAndSort(rows, filters) {
  const search = filters.search.trim().toLowerCase();
  const minimumVolume = numberOrNull(filters.minimumVolume);
  const minimumOpenInterest = numberOrNull(filters.minimumOpenInterest);
  const result = rows.filter(row => {
    if (search && !`${row.symbol} ${row.baseAsset} ${row.quoteAsset} ${row.coinGeckoId ?? ''}`.toLowerCase().includes(search)) return false;
    if (filters.market !== 'all' && row.market !== filters.market) return false;
    if (filters.type !== 'all' && row.contractType !== filters.type) return false;
    if (filters.quote !== 'all' && row.quoteAsset !== filters.quote) return false;
    if (filters.gecko === 'matched' && !row.coinGeckoId) return false;
    if (filters.gecko === 'unmatched' && row.coinGeckoId) return false;
    if (minimumVolume !== null && (row.quoteVolume === null || row.quoteVolume < minimumVolume)) return false;
    if (minimumOpenInterest !== null && (row.openInterestUsd === null || row.openInterestUsd < minimumOpenInterest)) return false;
    return true;
  });
  const direction = filters.direction === 'asc' ? 1 : -1;
  result.sort((a, b) => {
    const left = a[filters.sort];
    const right = b[filters.sort];
    if (left == null && right == null) return a.symbol.localeCompare(b.symbol);
    if (left == null) return 1;
    if (right == null) return -1;
    const difference = typeof left === 'string' ? left.localeCompare(right) : left - right;
    return difference * direction || a.symbol.localeCompare(b.symbol);
  });
  return result;
}

export function externalLinks(row) {
  const token = encodeURIComponent(row.baseAsset);
  return [
    row.binanceUrl && { label: 'Binance', url: row.binanceUrl },
    { label: 'CoinGecko', url: row.coinGeckoId
      ? `https://www.coingecko.com/en/coins/${encodeURIComponent(row.coinGeckoId)}`
      : `https://www.coingecko.com/en/search?query=${token}` },
    { label: 'CMC lookup', url: `https://www.google.com/search?q=${encodeURIComponent(`site:coinmarketcap.com/currencies/ ${row.baseAsset}`)}` },
    { label: 'DexScreener', url: `https://dexscreener.com/search?q=${token}` },
  ].filter(Boolean);
}
