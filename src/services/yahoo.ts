import yahooFinance from 'yahoo-finance2';
import { HistoricalDataPoint, MarketData } from '../types';

yahooFinance.suppressNotices(['yahooSurvey', 'ripHistorical']);

/**
 * Market data service for retrieving stock prices and financial information
 *
 * Provides comprehensive market data functionality including:
 * - Real-time stock quotes and pricing data
 * - Historical price data with configurable periods
 * - Market cap validation for micro-cap filtering
 * - Benchmark data for performance comparison
 * - Stock screening for micro-cap opportunities
 *
 * Uses Yahoo Finance as the primary data source with built-in error handling,
 * rate limiting, and data validation.
 *
 * @example
 * ```typescript
 * const marketData = new MarketDataService();
 * const quotes = await marketData.getMarketData(['AAPL', 'MSFT']);
 * const isMicroCap = await marketData.isMarketCap('ABEO');
 * const historical = await marketData.getHistoricalData('AAPL', '1y');
 * ```
 */
export class MarketDataService {
	// Constants for market cap thresholds and data limits
	private readonly DEFAULT_MICRO_CAP_LIMIT = 300_000_000; // $300M
	private readonly DEFAULT_MIN_VOLUME = 100_000;
	private readonly REQUEST_DELAY_MS = 100; // Delay between requests to avoid rate limiting

	/**
	 * Retrieve current market data for multiple symbols
	 *
	 * Fetches real-time quotes including current price, previous close, volume,
	 * and calculated percentage change. Handles errors gracefully by returning
	 * zero values for failed requests.
	 *
	 * @param symbols - Array of stock symbols to fetch data for
	 * @returns Promise resolving to array of market data objects
	 *
	 * @example
	 * ```typescript
	 * const data = await marketData.getMarketData(['AAPL', 'MSFT', 'GOOGL']);
	 * data.forEach(quote => {
	 *   console.log(`${quote.symbol}: $${quote.price} (${quote.percentChange.toFixed(2)}%)`);
	 * });
	 * ```
	 */
	async getMarketData(symbols: string[]): Promise<MarketData[]> {
		if (!symbols || symbols.length === 0) {
			console.warn('⚠️  No symbols provided for market data fetch');
			return [];
		}

		const results: MarketData[] = [];
		console.log(`📊 Fetching market data for ${symbols.length} symbols...`);

		for (const symbol of symbols) {
			try {
				await this._rateLimitDelay();

				const quote = await yahooFinance.quote(symbol);
				const currentPrice = this._safeNumber(quote?.regularMarketPrice, 0);
				const previousClose = this._safeNumber(
					quote?.regularMarketPreviousClose,
					currentPrice
				);
				const volume = this._safeNumber(quote?.regularMarketVolume, 0);

				const percentChange = this._calculatePercentChange(
					currentPrice,
					previousClose
				);

				results.push({
					symbol,
					price: currentPrice,
					previousClose,
					volume,
					percentChange,
				});

				console.log(
					`✅ ${symbol}: $${currentPrice.toFixed(2)} (${
						percentChange >= 0 ? '+' : ''
					}${percentChange.toFixed(2)}%)`
				);
			} catch (error) {
				console.error(`❌ Error fetching data for ${symbol}:`, error);
				results.push({
					symbol,
					price: 0,
					previousClose: 0,
					volume: 0,
					percentChange: 0,
				});
			}
		}

		return results;
	}

	/**
	 * Get benchmark market data for performance comparison
	 *
	 * Retrieves data for standard market benchmarks including S&P 500,
	 * Russell 2000, and relevant ETFs for micro-cap comparison.
	 *
	 * @returns Promise resolving to benchmark market data
	 *
	 * @example
	 * ```typescript
	 * const benchmarks = await marketData.getBenchmarkData();
	 * const sp500 = benchmarks.find(b => b.symbol === '^GSPC');
	 * console.log(`S&P 500: ${sp500?.percentChange.toFixed(2)}%`);
	 * ```
	 */
	async getBenchmarkData(): Promise<MarketData[]> {
		const benchmarks = ['^GSPC', '^RUT', 'IWO', 'XBI']; // S&P 500, Russell 2000, iShares Russell 2000 Growth, SPDR Biotech
		console.log('📈 Fetching benchmark data...');
		return this.getMarketData(benchmarks);
	}

	/**
	 * Retrieve historical price data for a symbol
	 *
	 * Fetches historical OHLCV data for the specified period. Supports
	 * multiple time periods from 1 day to 1 year.
	 *
	 * @param symbol - Stock symbol to fetch historical data for
	 * @param period - Time period ('1d', '1w', '1m', '3m', '6m', '1y')
	 * @returns Promise resolving to array of historical data points
	 * @throws {Error} If symbol is invalid or data fetch fails
	 *
	 * @example
	 * ```typescript
	 * const history = await marketData.getHistoricalData('AAPL', '3m');
	 * const latestPrice = history[history.length - 1]?.close;
	 * console.log(`Latest close: $${latestPrice}`);
	 * ```
	 */
	async getHistoricalData(
		symbol: string,
		period: string = '1y'
	): Promise<HistoricalDataPoint[]> {
		if (!symbol || symbol.trim().length === 0) {
			throw new Error('Symbol is required for historical data fetch');
		}

		try {
			console.log(`📊 Fetching ${period} historical data for ${symbol}...`);

			const historical = await yahooFinance.historical(symbol, {
				period1: this._getPeriodStartDate(period),
				period2: new Date(),
				interval: '1d',
			});

			const mappedData = historical.map(
				(data): HistoricalDataPoint => ({
					date: data.date,
					close: this._safeNumber(data.close, 0),
					volume: this._safeNumber(data.volume, 0),
					high: this._safeNumber(data.high, 0),
					low: this._safeNumber(data.low, 0),
					open: this._safeNumber(data.open, 0),
				})
			);

			console.log(
				`✅ Retrieved ${mappedData.length} historical data points for ${symbol}`
			);
			return mappedData;
		} catch (error) {
			console.error(`❌ Error fetching historical data for ${symbol}:`, error);
			throw new Error(
				`Failed to fetch historical data for ${symbol}: ${error}`
			);
		}
	}

	/**
	 * Check if a stock meets micro-cap criteria based on market capitalization
	 *
	 * Validates that a stock's market cap is below the specified threshold
	 * (default $300M) to qualify as a micro-cap investment.
	 *
	 * @param symbol - Stock symbol to check
	 * @param maxMarketCap - Maximum market cap threshold (default: $300M)
	 * @returns Promise resolving to true if stock is a micro-cap
	 *
	 * @example
	 * ```typescript
	 * const isMicroCap = await marketData.isMarketCap('ABEO');
	 * if (isMicroCap) {
	 *   console.log('ABEO qualifies as micro-cap');
	 * }
	 * ```
	 */
	async isMarketCap(
		symbol: string,
		maxMarketCap: number = this.DEFAULT_MICRO_CAP_LIMIT
	): Promise<boolean> {
		if (!symbol || symbol.trim().length === 0) {
			console.warn('⚠️  Empty symbol provided for market cap check');
			return false;
		}

		try {
			await this._rateLimitDelay();

			const quote = await yahooFinance.quote(symbol);
			const marketCap = quote?.marketCap;

			if (!marketCap || marketCap <= 0) {
				console.warn(`⚠️  No market cap data available for ${symbol}`);
				return false;
			}

			const isMicroCap = marketCap <= maxMarketCap;
			const marketCapInMillions = marketCap / 1_000_000;

			console.log(
				`📊 ${symbol} market cap: $${marketCapInMillions.toFixed(1)}M - ${
					isMicroCap ? '✅ Micro-cap' : '❌ Too large'
				}`
			);
			return isMicroCap;
		} catch (error) {
			console.error(`❌ Error checking market cap for ${symbol}:`, error);
			return false;
		}
	}

	/**
	 * Screen for micro-cap stocks with minimum volume requirements
	 *
	 * Filters a predefined list of potential micro-cap stocks based on
	 * market cap and volume criteria. Returns symbols that meet both
	 * the micro-cap threshold and minimum trading volume.
	 *
	 * @param minVolume - Minimum daily trading volume required
	 * @returns Promise resolving to array of qualified ticker symbols
	 *
	 * @example
	 * ```typescript
	 * const microCaps = await marketData.screenMicroCaps(50000);
	 * console.log(`Found ${microCaps.length} qualifying micro-cap stocks`);
	 * microCaps.forEach(ticker => console.log(`- ${ticker}`));
	 * ```
	 */
	async screenMicroCaps(
		minVolume: number = this.DEFAULT_MIN_VOLUME
	): Promise<string[]> {
		const potentialTickers = [
			'ABEO',
			'IINN',
			'ACTU',
			'HMHC',
			'MYSZ',
			'BLIN',
			'DTIL',
			'ETON',
			'GBNH',
			'HCDI',
			'IMPL',
			'IZEA',
			'KTRA',
			'LCTX',
			'MDWD',
			'NAOV',
			'ONCS',
			'PAVM',
			'RKDA',
			'SGMO',
			'TRVN',
			'UONE',
			'VBIV',
			'WISA',
			'ADMP',
			'ADTX',
			'AEMD',
			'AGLE',
			'AIMD',
			'ALVR',
			'AMRN',
			'ANAB',
			'ARTL',
			'ASLN',
			'AVCO',
			'BCEL',
			'BCLI',
			'BDSI',
			'BFRI',
			'BGNE',
		];

		const validTickers: string[] = [];
		console.log(
			`🔍 Screening ${potentialTickers.length} potential micro-cap stocks...`
		);
		console.log(
			`📊 Criteria: Market cap < $${(
				this.DEFAULT_MICRO_CAP_LIMIT / 1_000_000
			).toFixed(0)}M, Volume > ${minVolume.toLocaleString()}`
		);

		for (const ticker of potentialTickers) {
			try {
				const [isMicroCap, marketData] = await Promise.all([
					this.isMarketCap(ticker),
					this.getMarketData([ticker]),
				]);

				const hasVolume = marketData[0] && marketData[0].volume >= minVolume;

				if (isMicroCap && hasVolume) {
					validTickers.push(ticker);
					console.log(
						`✅ ${ticker} qualified: Volume ${marketData[0].volume.toLocaleString()}`
					);
				} else if (!isMicroCap) {
					console.log(`❌ ${ticker} market cap too large`);
				} else if (!hasVolume) {
					console.log(
						`❌ ${ticker} volume too low: ${
							marketData[0]?.volume?.toLocaleString() || 'N/A'
						}`
					);
				}

				// Small delay between checks to avoid overwhelming the API
				await this._rateLimitDelay();
			} catch (error) {
				console.warn(`⚠️  Error screening ${ticker}, skipping: ${error}`);
				continue;
			}
		}

		console.log(
			`🎯 Screening complete: ${validTickers.length} stocks qualified`
		);
		console.log(`📋 Qualified tickers: ${validTickers.join(', ')}`);

		return validTickers;
	}

	/**
	 * Validate if a symbol exists and has valid market data
	 *
	 * @param symbol - Stock symbol to validate
	 * @returns Promise resolving to true if symbol is valid
	 *
	 * @example
	 * ```typescript
	 * const isValid = await marketData.validateSymbol('AAPL');
	 * if (!isValid) console.log('Invalid symbol');
	 * ```
	 */
	async validateSymbol(symbol: string): Promise<boolean> {
		if (!symbol || symbol.trim().length === 0) {
			return false;
		}

		try {
			const quote = await yahooFinance.quote(symbol);
			return (
				quote !== null &&
				quote.regularMarketPrice !== undefined &&
				quote.regularMarketPrice > 0
			);
		} catch (error) {
			console.warn(`⚠️  Symbol validation failed for ${symbol}:`, error);
			return false;
		}
	}

	/**
	 * Get the start date for a given period
	 *
	 * @private
	 * @param period - Period string ('1d', '1w', etc.)
	 * @returns Date object representing the start date
	 */
	private _getPeriodStartDate(period: string): Date {
		const now = new Date();
		const msPerDay = 24 * 60 * 60 * 1000;

		switch (period.toLowerCase()) {
			case '1d':
				return new Date(now.getTime() - msPerDay);
			case '1w':
				return new Date(now.getTime() - 7 * msPerDay);
			case '1m':
				return new Date(now.getTime() - 30 * msPerDay);
			case '3m':
				return new Date(now.getTime() - 90 * msPerDay);
			case '6m':
				return new Date(now.getTime() - 180 * msPerDay);
			case '1y':
			default:
				return new Date(now.getTime() - 365 * msPerDay);
		}
	}

	/**
	 * Calculate percentage change between two values
	 *
	 * @private
	 * @param current - Current value
	 * @param previous - Previous value
	 * @returns Percentage change
	 */
	private _calculatePercentChange(current: number, previous: number): number {
		if (previous === 0 || !isFinite(current) || !isFinite(previous)) {
			return 0;
		}
		return ((current - previous) / previous) * 100;
	}

	/**
	 * Safely convert value to number with fallback
	 *
	 * @private
	 * @param value - Value to convert
	 * @param defaultValue - Default value if conversion fails
	 * @returns Converted number or default
	 */
	private _safeNumber(value: any, defaultValue: number = 0): number {
		if (value === null || value === undefined) {
			return defaultValue;
		}

		const converted = Number(value);
		return isFinite(converted) ? converted : defaultValue;
	}

	/**
	 * Add delay between API requests to avoid rate limiting
	 *
	 * @private
	 */
	private async _rateLimitDelay(): Promise<void> {
		await new Promise((resolve) => setTimeout(resolve, this.REQUEST_DELAY_MS));
	}
}
