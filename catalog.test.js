import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCatalog, externalLinks, filterAndSort, numberOrNull } from './catalog.js';

test('builds active contract rows and matches CoinGecko only by exact assets', () => {
  const rows = buildCatalog({
    usdmInfo: { symbols: [
      { symbol: 'BTCUSDT', baseAsset: 'BTC', quoteAsset: 'USDT', contractType: 'PERPETUAL', status: 'TRADING' },
      { symbol: 'OLDUSDT', baseAsset: 'OLD', quoteAsset: 'USDT', contractType: 'PERPETUAL', status: 'BREAK' },
    ] },
    usdmTicker: [{ symbol: 'BTCUSDT', lastPrice: '100', quoteVolume: '2000', priceChangePercent: '3' }],
    coinmInfo: { symbols: [{ symbol: 'BTCUSD_PERP', baseAsset: 'BTC', quoteAsset: 'USD', contractType: 'PERPETUAL', contractStatus: 'TRADING' }] },
    coinmTicker: [{ symbol: 'BTCUSD_PERP', lastPrice: '101', baseVolume: '500' }],
    gecko: { tickers: [
      { symbol: 'BTCUSDT', base: 'BTC', target: 'USDT', coin_id: 'bitcoin', open_interest_usd: 123 },
      { symbol: 'BTCUSD_PERP', base: 'BTC', target: 'USDT', coin_id: 'wrong' },
    ] },
  });
  assert.equal(rows.length, 2);
  assert.equal(rows[0].coinGeckoId, 'bitcoin');
  assert.equal(rows[0].quoteVolume, 2000);
  assert.equal(rows[1].coinGeckoId, null);
  assert.equal(rows[1].quoteVolume, null);
  assert.equal(numberOrNull(''), null);
});

test('filters unavailable metrics and sorts null values last', () => {
  const rows = [
    { symbol: 'AUSDT', baseAsset: 'A', quoteAsset: 'USDT', market: 'USD-M', contractType: 'PERPETUAL', coinGeckoId: null, quoteVolume: 4, openInterestUsd: null },
    { symbol: 'BUSDT', baseAsset: 'B', quoteAsset: 'USDT', market: 'USD-M', contractType: 'PERPETUAL', coinGeckoId: 'b', quoteVolume: 10, openInterestUsd: 3 },
  ];
  const filters = { search: '', market: 'all', type: 'all', quote: 'all', gecko: 'all', minimumVolume: '', minimumOpenInterest: '', sort: 'openInterestUsd', direction: 'desc' };
  assert.deepEqual(filterAndSort(rows, filters).map(row => row.symbol), ['BUSDT', 'AUSDT']);
  assert.deepEqual(filterAndSort(rows, { ...filters, minimumOpenInterest: '0' }).map(row => row.symbol), ['BUSDT']);
  assert.equal(externalLinks(rows[1]).length, 3);
  assert.match(externalLinks(rows[1]).find(link => link.label === 'CMC lookup').url, /site%3Acoinmarketcap\.com%2Fcurrencies%2F/);
});
