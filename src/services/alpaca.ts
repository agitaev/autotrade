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
	private lastApiCall: number = 0;
	private readonly minApiDelay: number = 100; // Minimum 100ms between API calls

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
	 * Rate limiting helper to prevent API rate limit errors
	 * @private
	 */
	private async rateLimit(): Promise<void> {
		const now = Date.now();
		const timeSinceLastCall = now - this.lastApiCall;
		
		if (timeSinceLastCall < this.minApiDelay) {
			const delay = this.minApiDelay - timeSinceLastCall;
			console.log(`⏳ Rate limiting: waiting ${delay}ms...`);
			await new Promise(resolve => setTimeout(resolve, delay));
		}
		
		this.lastApiCall = Date.now();
	}

	/**
	 * Execute API call with exponential backoff retry logic
	 * @private
	 */
	private async retryWithBackoff<T>(
		apiCall: () => Promise<T>,
		maxRetries: number = 3,
		baseDelay: number = 1000
	): Promise<T> {
		let lastError: Error;
		
		for (let attempt = 0; attempt <= maxRetries; attempt++) {
			try {
				return await apiCall();
			} catch (error) {
				lastError = error as Error;
				
				// Don't retry on validation errors (our own checks)
				if (error instanceof Error && error.message.includes('Cannot sell')) {
					throw error;
				}
				
				// Don't retry on the last attempt
				if (attempt === maxRetries) {
					break;
				}
				
				// Calculate exponential backoff delay
				const delay = baseDelay * Math.pow(2, attempt);
				console.log(`⚠️  API call failed (attempt ${attempt + 1}/${maxRetries + 1}), retrying in ${delay}ms...`);
				console.log(`   Error: ${error instanceof Error ? error.message : String(error)}`);
				
				await new Promise(resolve => setTimeout(resolve, delay));
			}
		}
		
		throw lastError!;
	}

	/**
	 * Retrieve account information including buying power and equity
	 *
	 * @returns Promise resolving to account details
	 * @throws Error if account retrieval fails
	 */
	async getAccount(): Promise<Account> {
		try {
			await this.rateLimit();
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
			await this.rateLimit();
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
			// Check for conflicting orders (wash trade prevention)
			await this.rateLimit();
			const existingOrders = await this.getOrdersBySymbol(ticker, 'open');
			const conflictingOrders = existingOrders.filter((order: any) => order.side === 'sell');
			
			if (conflictingOrders.length > 0) {
				console.log(`⚠️  Found ${conflictingOrders.length} conflicting sell orders for ${ticker}`);
				console.log(`🛑 Cancelling conflicting orders to prevent wash trade detection...`);
				
				// Cancel conflicting sell orders
				for (const order of conflictingOrders) {
					try {
						await this.rateLimit();
						await this.alpaca.cancelOrder(order.id);
						console.log(`   ✅ Cancelled sell order ${order.id}`);
					} catch (cancelError) {
						console.warn(`   ⚠️  Failed to cancel order ${order.id}:`, cancelError);
					}
				}
				
				// Wait for cancellations to process
				console.log(`⏳ Waiting 3 seconds for order cancellations to process...`);
				await new Promise(resolve => setTimeout(resolve, 3000));
			}

			// Use retry logic with rate limiting for order placement
			const buyOrder = await this.retryWithBackoff(async () => {
				await this.rateLimit();
				return await this.alpaca.createOrder({
					symbol: ticker,
					qty: shares,
					side: 'buy',
					type: 'market',
					time_in_force: 'day',
				});
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
			
			// Handle specific API errors
			if (error instanceof Error && error.message.includes('422')) {
				throw new Error(`Failed to place buy order for ${ticker}: Invalid order parameters or insufficient buying power`);
			} else if (error instanceof Error && error.message.includes('429')) {
				throw new Error(`Failed to place buy order for ${ticker}: Rate limit exceeded - please try again later`);
			} else if (error instanceof Error && error.message.includes('403')) {
				// Check if it's a wash trade error
				const errorString = String(error);
				if (errorString.includes('wash trade') || errorString.includes('opposite side')) {
					throw new Error(`Failed to place buy order for ${ticker}: Wash trade detected - conflicting orders exist. Try again after existing orders complete.`);
				}
				throw new Error(`Failed to place buy order for ${ticker}: Permission denied (403)`);
			}
			
			throw new Error(`Failed to place buy order for ${ticker}: ${error}`);
		}
	}

	/**
	 * Place a market sell order
	 *
	 * Automatically handles conflicting orders (like stop-loss orders) by cancelling
	 * them before placing the new sell order.
	 *
	 * @param ticker - Stock symbol to sell
	 * @param shares - Number of shares to sell
	 * @returns Promise resolving to the sell order details
	 * @throws Error if order placement fails
	 */
	async placeSellOrder(ticker: string, shares: number) {
		try {
			// Rate limit API calls
			await this.rateLimit();
			
			// Validate that we actually own shares of this stock
			const positions = await this.getPositions();
			const position = positions.find(p => p.ticker === ticker);
			
			if (!position || position.shares < shares) {
				throw new Error(`Cannot sell ${shares} shares of ${ticker}: ${position ? `only own ${position.shares} shares` : 'no position found'}`);
			}
			
			// Check for conflicting orders (wash trade prevention)
			const existingOrders = await this.getOrdersBySymbol(ticker, 'open');
			const conflictingBuyOrders = existingOrders.filter((order: any) => order.side === 'buy');
			const conflictingSellOrders = existingOrders.filter((order: any) => order.side === 'sell');
			
			// Cancel conflicting buy orders first (wash trade prevention)
			if (conflictingBuyOrders.length > 0) {
				console.log(`⚠️  Found ${conflictingBuyOrders.length} conflicting buy orders for ${ticker}`);
				console.log(`🛑 Cancelling conflicting buy orders to prevent wash trade detection...`);
				
				for (const order of conflictingBuyOrders) {
					try {
						await this.rateLimit();
						await this.alpaca.cancelOrder(order.id);
						console.log(`   ✅ Cancelled buy order ${order.id}`);
					} catch (cancelError) {
						console.warn(`   ⚠️  Failed to cancel order ${order.id}:`, cancelError);
					}
				}
			}
			
			// Cancel duplicate sell orders
			if (conflictingSellOrders.length > 0) {
				console.log(`⚠️  Found ${conflictingSellOrders.length} existing sell orders for ${ticker}, cancelling them...`);
				
				for (const order of conflictingSellOrders) {
					try {
						await this.rateLimit();
						await this.alpaca.cancelOrder(order.id);
						console.log(`   ✅ Cancelled duplicate sell order ${order.id}`);
					} catch (cancelError) {
						console.warn(`   ⚠️  Failed to cancel order ${order.id}:`, cancelError);
					}
				}
			}
			
			// Wait for cancellations to process if any were made
			if (conflictingBuyOrders.length > 0 || conflictingSellOrders.length > 0) {
				console.log(`⏳ Waiting 3 seconds for order cancellations to process...`);
				await new Promise(resolve => setTimeout(resolve, 3000));
			}

			// Use retry logic with rate limiting for sell order
			const sellOrder = await this.retryWithBackoff(async () => {
				await this.rateLimit();
				return await this.alpaca.createOrder({
					symbol: ticker,
					qty: shares,
					side: 'sell',
					type: 'market',
					time_in_force: 'day',
				});
			});

			console.log(
				`✅ Sell order placed: ${shares} shares of ${ticker} (Order ID: ${sellOrder.id})`
			);
			return sellOrder;
		} catch (error) {
			console.error(`❌ Error placing sell order for ${ticker}:`, error);
			
			// Handle specific API errors
			if (error instanceof Error && error.message.includes('422')) {
				throw new Error(`Failed to place sell order for ${ticker}: Invalid order (may not own shares or insufficient quantity)`);
			} else if (error instanceof Error && error.message.includes('429')) {
				throw new Error(`Failed to place sell order for ${ticker}: Rate limit exceeded - please try again later`);
			} else if (error instanceof Error && error.message.includes('403')) {
				// Check if it's a wash trade error
				const errorString = String(error);
				if (errorString.includes('wash trade') || errorString.includes('opposite side')) {
					throw new Error(`Failed to place sell order for ${ticker}: Wash trade detected - conflicting orders exist. Try again after existing orders complete.`);
				}
				throw new Error(`Failed to place sell order for ${ticker}: Permission denied (403)`);
			} else if (error instanceof Error && error.message.includes('Cannot sell')) {
				// Re-throw our validation errors as-is
				throw error;
			}
			
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
	 * Get orders by symbol and status
	 *
	 * @param symbol - Stock symbol to filter orders
	 * @param status - Order status (default: 'open')
	 * @returns Promise resolving to array of orders for the symbol
	 * @throws Error if order retrieval fails
	 */
	async getOrdersBySymbol(symbol: string, status: string = 'open'): Promise<any[]> {
		try {
			// @ts-expect-error
			const orders = await this.alpaca.getOrders({ 
				status: status,
				symbols: symbol 
			});
			return orders;
		} catch (error) {
			console.error(`❌ Error getting orders for ${symbol}:`, error);
			throw new Error(`Failed to get orders for ${symbol}: ${error}`);
		}
	}

	/**
	 * Check if there are existing sell orders for a symbol
	 *
	 * @param symbol - Stock symbol to check
	 * @returns Promise resolving to true if sell orders exist
	 * @throws Error if order check fails
	 */
	async hasExistingSellOrders(symbol: string): Promise<boolean> {
		try {
			const orders = await this.getOrdersBySymbol(symbol, 'open');
			return orders.some((order: any) => order.side === 'sell');
		} catch (error) {
			console.error(`❌ Error checking sell orders for ${symbol}:`, error);
			return false; // Default to false to allow order placement
		}
	}

	/**
	 * Cancel orders for a specific symbol
	 *
	 * @param symbol - Stock symbol
	 * @param side - Optional order side filter ('buy' or 'sell')
	 * @returns Promise that resolves when orders are cancelled
	 * @throws Error if order cancellation fails
	 */
	async cancelOrdersBySymbol(symbol: string, side?: 'buy' | 'sell'): Promise<number> {
		try {
			const orders = await this.getOrdersBySymbol(symbol, 'open');
			const ordersToCancel = side ? 
				orders.filter((order: any) => order.side === side) : 
				orders;
			
			if (ordersToCancel.length === 0) {
				console.log(`📭 No ${side || ''} orders to cancel for ${symbol}`);
				return 0;
			}

			const cancellationPromises = ordersToCancel.map((order: any) =>
				this.alpaca.cancelOrder(order.id)
			);

			await Promise.all(cancellationPromises);
			console.log(`🛑 Cancelled ${ordersToCancel.length} ${side || ''} orders for ${symbol}`);
			return ordersToCancel.length;
		} catch (error) {
			console.error(`❌ Error cancelling orders for ${symbol}:`, error);
			throw new Error(`Failed to cancel orders for ${symbol}: ${error}`);
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
	 * Check if the market is currently open (timezone-aware)
	 *
	 * Checks market hours in US Eastern Time:
	 * - Monday through Friday (weekdays)
	 * - Between 9:30 AM and 4:00 PM ET
	 *
	 * Note: Does not account for market holidays or early closures
	 *
	 * @returns true if market appears to be open, false otherwise
	 */
	isMarketOpen(): boolean {
		// Get current time in US Eastern Time using proper timezone conversion
		const now = new Date();
		
		// Use proper timezone conversion
		const etHour = parseInt(now.toLocaleString('en-US', { 
			timeZone: 'America/New_York', 
			hour: '2-digit', 
			hour12: false 
		}));
		const etMinute = parseInt(now.toLocaleString('en-US', { 
			timeZone: 'America/New_York', 
			minute: '2-digit' 
		}));
		const etDay = now.toLocaleDateString('en-US', { 
			timeZone: 'America/New_York', 
			weekday: 'short' 
		});
		
		// Convert day name to number (Monday = 1, Friday = 5)
		const dayMap: Record<string, number> = {
			'Sun': 0, 'Mon': 1, 'Tue': 2, 'Wed': 3, 'Thu': 4, 'Fri': 5, 'Sat': 6
		};
		const dayNum = dayMap[etDay] || 0;
		
		// Monday (1) through Friday (5)
		if (dayNum < 1 || dayNum > 5) {
			return false;
		}
		
		// Market hours: 9:30 AM to 4:00 PM ET
		const marketOpenTime = 9 * 60 + 30; // 9:30 AM in minutes
		const marketCloseTime = 16 * 60; // 4:00 PM in minutes
		const currentTime = etHour * 60 + etMinute;
		
		// Debug logging
		console.log(`🕐 Market Check - ET: ${etHour}:${etMinute.toString().padStart(2, '0')} ${etDay} | Open: ${currentTime >= marketOpenTime && currentTime < marketCloseTime}`);
		
		return currentTime >= marketOpenTime && currentTime < marketCloseTime;
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

			// Check for conflicting orders before placing stop-loss (wash trade prevention)
			await this.rateLimit();
			const existingOrders = await this.getOrdersBySymbol(ticker, 'open');
			const conflictingOrders = existingOrders.filter((order: any) => 
				order.side === 'sell' && (order.type === 'stop' || order.type === 'market')
			);
			
			if (conflictingOrders.length > 0) {
				console.log(`⚠️  Found ${conflictingOrders.length} conflicting sell orders for ${ticker} stop-loss`);
				console.log(`🛑 Cancelling conflicting orders to prevent wash trade detection...`);
				
				// Cancel conflicting sell orders
				for (const order of conflictingOrders) {
					try {
						await this.rateLimit();
						await this.alpaca.cancelOrder(order.id);
						console.log(`   ✅ Cancelled conflicting sell order ${order.id} for stop-loss placement`);
					} catch (cancelError) {
						console.warn(`   ⚠️  Failed to cancel order ${order.id}:`, cancelError);
					}
				}
				
				// Wait for cancellations to process
				console.log(`⏳ Waiting 3 seconds for order cancellations to process...`);
				await new Promise(resolve => setTimeout(resolve, 3000));
			}

			// Use retry logic with rate limiting for stop-loss order
			const stopLossOrder = await this.retryWithBackoff(async () => {
				await this.rateLimit();
				return await this.alpaca.createOrder({
					symbol: ticker,
					qty: shares,
					side: 'sell',
					type: 'stop',
					stop_price: stopLoss.toString(),
					time_in_force: 'gtc', // Good till cancelled
				});
			});

			console.log(
				`🛡️ Stop-loss order placed: ${ticker} at $${stopLoss} (Order ID: ${stopLossOrder.id})`
			);
		} catch (error) {
			console.error(`⚠️  Failed to place stop-loss for ${ticker}:`, error);
			
			// Handle specific wash trade errors
			if (error instanceof Error && error.message.includes('403')) {
				const errorString = String(error);
				if (errorString.includes('wash trade') || errorString.includes('opposite side')) {
					console.error(`   💥 Wash trade detected for ${ticker} stop-loss - existing conflicting orders may still be processing`);
					console.error(`   💡 Suggestion: Manual stop-loss placement may be needed after existing orders complete`);
				}
			}
			
			// Don't throw here - buy order was successful, stop-loss is secondary
		}
	}
}
