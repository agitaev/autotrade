import Alpaca from '@alpacahq/alpaca-trade-api';
import { Account, Position } from '../types';
import { AlpacaAccount, AlpacaPosition } from './types/alpaca';

/**
 * Service for interacting with Alpaca Trading API
 *
 * Provides a clean interface for paper trading operations including:
 * - Account management and position retrieval
 * - Buy/sell order placement with automatic stop-loss support
 * - Market data and pricing information
 * - Order management and cancellation
 *
 * @example
 * ```typescript
 * const alpaca = new AlpacaService();
 * await alpaca.placeBuyOrder('AAPL', 10, 150.00);
 * const positions = await alpaca.getPositions();
 * ```
 */
export class AlpacaService {
	private readonly alpaca: Alpaca;

	/**
	 * Initialize Alpaca service with API credentials from environment variables
	 *
	 * Required environment variables:
	 * - ALPACA_API_KEY: Your Alpaca API key
	 * - ALPACA_SECRET_KEY: Your Alpaca secret key
	 * - ALPACA_BASE_URL: API endpoint (defaults to paper trading)
	 */
	constructor() {
		this.alpaca = new Alpaca({
			keyId: process.env.ALPACA_API_KEY!,
			secretKey: process.env.ALPACA_SECRET_KEY!,
			baseUrl:
				process.env.ALPACA_BASE_URL || 'https://paper-api.alpaca.markets',
			paper: true,
		});
	}

	/**
	 * Retrieve account information including buying power and equity
	 *
	 * @returns Promise resolving to account details
	 * @throws Error if account retrieval fails
	 */
	async getAccount(): Promise<Account> {
		try {
			const rawAccount: AlpacaAccount = await this.alpaca.getAccount();

			return {
				id: rawAccount.id,
				cash: rawAccount.cash,
				buyingPower: rawAccount.buying_power,
				equity: rawAccount.equity,
				lastEquity: rawAccount.last_equity,
			};
		} catch (error) {
			console.error('Error getting account:', error);
			throw new Error(`Failed to retrieve account information: ${error}`);
		}
	}

	/**
	 * Get current portfolio positions from Alpaca
	 *
	 * Note: Stop loss values are set to 0 and should be populated from external tracking
	 *
	 * @returns Promise resolving to array of current positions
	 * @throws Error if position retrieval fails
	 */
	async getPositions(): Promise<Position[]> {
		try {
			const positions: AlpacaPosition[] = await this.alpaca.getPositions();

			return positions.map((pos: AlpacaPosition) => ({
				ticker: pos.symbol,
				shares: parseInt(pos.qty, 10),
				buyPrice: parseFloat(pos.avg_entry_price),
				costBasis: parseFloat(pos.cost_basis),
				marketValue: parseFloat(pos.market_value),
				unrealizedIntradayPl: parseFloat(pos.unrealized_intraday_pl),
				stopLoss: 0,

				// Current pricing
				currentPrice: parseFloat(pos.current_price),
				lastdayPrice: parseFloat(pos.lastday_price),
				changeToday: parseFloat(pos.change_today),

				// P&L metrics
				unrealizedPl: parseFloat(pos.unrealized_pl),
				unrealizedPlPercent: parseFloat(pos.unrealized_plpc),
				unrealizedIntradayPlPercent: parseFloat(pos.unrealized_intraday_plpc),

				// Asset metadata
				assetId: pos.asset_id,
				exchange: pos.exchange,
				assetClass: pos.asset_class,
				side: pos.side,
				qtyAvailable: parseInt(pos.qty_available, 10),
				assetMarginable: pos.asset_marginable,
			}));
		} catch (error) {
			console.error('Error getting positions:', error);
			throw new Error(`Failed to retrieve positions: ${error}`);
		}
	}

	/**
	 * Place a market buy order with optional stop-loss
	 *
	 * Automatically places a stop-loss order 2 seconds after the buy order
	 * if stopLoss parameter is provided
	 *
	 * @param ticker - Stock symbol to purchase
	 * @param shares - Number of shares to buy
	 * @param stopLoss - Optional stop-loss price
	 * @returns Promise resolving to the buy order details
	 * @throws Error if order placement fails
	 */
	async placeBuyOrder(ticker: string, shares: number, stopLoss?: number) {
		try {
			// Place market buy order
			const buyOrder = await this.alpaca.createOrder({
				symbol: ticker,
				qty: shares,
				side: 'buy',
				type: 'market',
				time_in_force: 'day',
			});

			console.log(
				`✅ Buy order placed: ${shares} shares of ${ticker} (Order ID: ${buyOrder.id})`
			);

			// Place stop-loss order if specified
			if (stopLoss && stopLoss > 0) {
				await this._placeStopLossOrder(ticker, shares, stopLoss);
			}

			return buyOrder;
		} catch (error) {
			console.error(`❌ Error placing buy order for ${ticker}:`, error);
			throw new Error(`Failed to place buy order for ${ticker}: ${error}`);
		}
	}

	/**
	 * Place a market sell order
	 *
	 * @param ticker - Stock symbol to sell
	 * @param shares - Number of shares to sell
	 * @returns Promise resolving to the sell order details
	 * @throws Error if order placement fails
	 */
	async placeSellOrder(ticker: string, shares: number) {
		try {
			const sellOrder = await this.alpaca.createOrder({
				symbol: ticker,
				qty: shares,
				side: 'sell',
				type: 'market',
				time_in_force: 'day',
			});

			console.log(
				`✅ Sell order placed: ${shares} shares of ${ticker} (Order ID: ${sellOrder.id})`
			);
			return sellOrder;
		} catch (error) {
			console.error(`❌ Error placing sell order for ${ticker}:`, error);
			throw new Error(`Failed to place sell order for ${ticker}: ${error}`);
		}
	}

	/**
	 * Get the latest trade price for a stock
	 *
	 * @param ticker - Stock symbol to get price for
	 * @returns Promise resolving to the latest trade price
	 * @throws Error if price retrieval fails
	 */
	async getLatestPrice(ticker: string): Promise<number> {
		try {
			const latestTrade = await this.alpaca.getLatestTrade(ticker);
			return latestTrade.Price;
		} catch (error) {
			console.error(`❌ Error getting latest price for ${ticker}:`, error);
			throw new Error(`Failed to get latest price for ${ticker}: ${error}`);
		}
	}

	/**
	 * Retrieve historical price bars for a stock
	 *
	 * @param ticker - Stock symbol to get bars for
	 * @param timeframe - Time interval (default: '1Day')
	 * @param limit - Maximum number of bars to retrieve (default: 100)
	 * @returns Promise resolving to historical bar data
	 * @throws Error if bar retrieval fails
	 */
	async getBars(
		ticker: string,
		timeframe: string = '1Day',
		limit: number = 100
	) {
		try {
			const bars = await this.alpaca.getBarsV2(ticker, {
				timeframe,
				limit,
			});
			return bars;
		} catch (error) {
			console.error(`❌ Error getting bars for ${ticker}:`, error);
			throw new Error(`Failed to get bars for ${ticker}: ${error}`);
		}
	}

	/**
	 * Cancel all open orders in the account
	 *
	 * Useful for emergency stops or end-of-day cleanup
	 *
	 * @returns Promise that resolves when all orders are cancelled
	 * @throws Error if order cancellation fails
	 */
	async cancelAllOrders(): Promise<void> {
		try {
			// @ts-expect-error
			const orders = await this.alpaca.getOrders({ status: 'open' });

			if (orders.length === 0) {
				console.log('📭 No open orders to cancel');
				return;
			}

			const cancellationPromises = orders.map((order: any) =>
				this.alpaca.cancelOrder(order.id)
			);

			await Promise.all(cancellationPromises);
			console.log(`🛑 Cancelled ${orders.length} open orders`);
		} catch (error) {
			console.error('❌ Error cancelling orders:', error);
			throw new Error(`Failed to cancel orders: ${error}`);
		}
	}

	/**
	 * Get market calendar information
	 *
	 * @returns Promise resolving to market calendar data
	 * @throws Error if calendar retrieval fails
	 */
	async getMarketCalendar() {
		try {
			return await this.alpaca.getCalendar();
		} catch (error) {
			console.error('❌ Error getting market calendar:', error);
			throw new Error(`Failed to get market calendar: ${error}`);
		}
	}

	/**
	 * Check if the market is currently open (simplified)
	 *
	 * Basic implementation that checks:
	 * - Monday through Friday (weekdays)
	 * - Between 9:00 AM and 4:00 PM ET
	 *
	 * Note: Does not account for market holidays or early closures
	 *
	 * @returns true if market appears to be open, false otherwise
	 */
	isMarketOpen(): boolean {
		const now = new Date();
		const day = now.getDay(); // 0 = Sunday, 6 = Saturday
		const hour = now.getHours();

		// Monday (1) through Friday (5), 9 AM to 4 PM ET
		return day >= 1 && day <= 5 && hour >= 9 && hour < 16;
	}

	/**
	 * Private helper method to place stop-loss orders
	 *
	 * @param ticker - Stock symbol
	 * @param shares - Number of shares
	 * @param stopLoss - Stop-loss price
	 * @private
	 */
	private async _placeStopLossOrder(
		ticker: string,
		shares: number,
		stopLoss: number
	): Promise<void> {
		try {
			// Wait for buy order to potentially fill
			await new Promise((resolve) => setTimeout(resolve, 2000));

			const stopLossOrder = await this.alpaca.createOrder({
				symbol: ticker,
				qty: shares,
				side: 'sell',
				type: 'stop',
				stop_price: stopLoss.toString(),
				time_in_force: 'gtc', // Good till cancelled
			});

			console.log(
				`🛡️ Stop-loss order placed: ${ticker} at $${stopLoss} (Order ID: ${stopLossOrder.id})`
			);
		} catch (error) {
			console.error(`⚠️  Failed to place stop-loss for ${ticker}:`, error);
			// Don't throw here - buy order was successful, stop-loss is secondary
		}
	}
}
