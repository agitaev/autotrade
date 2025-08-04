import { promises as fs } from 'fs';
import path from 'path';
import { createObjectCsvWriter } from 'csv-writer';
import csvParser from 'csv-parser';
import {
	Position,
	PortfolioUpdate,
	TradeLog,
	PortfolioMetrics,
	PortfolioHistoryPoint,
	PortfolioSummary,
	PositionSummary,
	ProcessingResult,
	TrackedPosition,
} from '../types';
import { AlpacaService } from './alpaca';
import { MarketDataService } from './yahoo';

/**
 * Comprehensive portfolio management service
 *
 * Handles all portfolio operations including position tracking, trade execution,
 * performance metrics calculation, and data persistence. Integrates with Alpaca
 * for live trading and maintains historical records in CSV format.
 *
 * Key responsibilities:
 * - Portfolio position management and tracking
 * - Trade execution with automatic logging
 * - Stop-loss monitoring and enforcement
 * - Performance metrics calculation (Sharpe, Sortino, drawdown)
 * - Data persistence and historical tracking
 * - Cash and buying power management
 *
 * @example
 * ```typescript
 * const manager = new PortfolioManager();
 * const portfolio = await manager.getCurrentPortfolio();
 * await manager.executeBuy('AAPL', 10, 150.00);
 * const metrics = await manager.getPortfolioMetrics();
 * ```
 */
export class PortfolioManager {
	private readonly alpaca: AlpacaService;
	private readonly marketData: MarketDataService;
	private readonly dataDir: string;
	private readonly portfolioFile: string;
	private readonly tradeLogFile: string;

	// Risk-free rate for Sharpe/Sortino calculations (4.5% annual)
	private readonly RISK_FREE_RATE = 0.045;
	private readonly TRADING_DAYS_PER_YEAR = 252;

	/**
	 * Initialize PortfolioManager with required services and file paths
	 *
	 * Automatically creates data directory structure if it doesn't exist
	 */
	constructor() {
		this.alpaca = new AlpacaService();
		this.marketData = new MarketDataService();
		this.dataDir = path.join(process.cwd(), 'data');
		this.portfolioFile = path.join(
			this.dataDir,
			'chatgpt_portfolio_update.csv'
		);
		this.tradeLogFile = path.join(this.dataDir, 'chatgpt_trade_log.csv');
		this._ensureDataDirectory();
	}

	/**
	 * Get current portfolio positions with merged stop-loss data
	 *
	 * Combines live positions from Alpaca with tracked stop-loss levels
	 * from local CSV storage to provide complete position information.
	 *
	 * @returns Promise resolving to array of current positions
	 *
	 * @example
	 * ```typescript
	 * const positions = await manager.getCurrentPortfolio();
	 * positions.forEach(pos => {
	 *   console.log(`${pos.ticker}: ${pos.shares} shares @ $${pos.buyPrice}`);
	 * });
	 * ```
	 */
	async getCurrentPortfolio(): Promise<Position[]> {
		try {
			console.log('📊 Retrieving current portfolio positions...');

			// Get live positions from Alpaca
			const alpacaPositions = await this.alpaca.getPositions();

			// Load tracked stop losses from CSV
			const trackedPositions = await this._loadTrackedPositions();

			// Merge live data with tracked stop losses
			const mergedPositions = alpacaPositions.map((pos) => {
				const tracked = trackedPositions.find((t) => t.ticker === pos.ticker);

				return {
					...pos,
					stopLoss: tracked?.stopLoss || 0,
				};
			});

			console.log(`✅ Retrieved ${mergedPositions.length} current positions`);
			return mergedPositions;
		} catch (error) {
			console.error('❌ Error getting current portfolio:', error);
			return [];
		}
	}

	/**
	 * Process daily portfolio updates with stop-loss monitoring
	 *
	 * Updates all position prices, checks stop-loss triggers, executes
	 * automatic sells when needed, and logs all changes to CSV files.
	 *
	 * @param portfolio - Current portfolio positions
	 * @param cash - Available cash balance
	 * @returns Promise resolving to updated portfolio and cash
	 * @throws {Error} If processing fails
	 *
	 * @example
	 * ```typescript
	 * const { portfolio: updated, cash: newCash } = await manager.processPortfolio(
	 *   currentPositions,
	 *   availableCash
	 * );
	 * ```
	 */
	async processPortfolio(
		portfolio: Position[],
		cash: number
	): Promise<ProcessingResult> {
		const today = new Date().toISOString().split('T')[0];
		const results: PortfolioUpdate[] = [];
		let totalValue = 0;
		let totalPnl = 0;
		let updatedCash = cash;
		let updatedPortfolio = [...portfolio];

		console.log(
			`🔄 Processing ${portfolio.length} portfolio positions for ${today}...`
		);

		for (const position of portfolio) {
			try {
				const currentPrice = await this.alpaca.getLatestPrice(position.ticker);
				const value = currentPrice * position.shares;
				const pnl = (currentPrice - position.buyPrice) * position.shares;

				let action = 'HOLD';

				// Check for stop-loss trigger
				if (this._shouldTriggerStopLoss(currentPrice, position.stopLoss)) {
					action = 'SELL - Stop Loss Triggered';
					console.log(
						`🛑 Stop loss triggered for ${position.ticker}: $${currentPrice} <= $${position.stopLoss}`
					);

					await this.alpaca.placeSellOrder(position.ticker, position.shares);
					await this._logTrade({
						date: today,
						ticker: position.ticker,
						sharesSold: position.shares,
						sellPrice: currentPrice,
						costBasis: position.costBasis,
						pnl,
						reason: 'AUTOMATED SELL - STOPLOSS TRIGGERED',
					});

					updatedCash += value;
					updatedPortfolio = updatedPortfolio.filter(
						(p) => p.ticker !== position.ticker
					);
				} else {
					totalValue += value;
					totalPnl += pnl;
				}

				results.push({
					date: today,
					ticker: position.ticker,
					shares: position.shares,
					costBasis: position.buyPrice,
					stopLoss: position.stopLoss,
					currentPrice,
					totalValue: value,
					pnl,
					action,
					cashBalance: '',
					totalEquity: '',
				});
			} catch (error) {
				console.error(`❌ Error processing ${position.ticker}:`, error);
				results.push({
					date: today,
					ticker: position.ticker,
					shares: position.shares,
					costBasis: position.buyPrice,
					stopLoss: position.stopLoss,
					currentPrice: 'NO DATA',
					totalValue: 'NO DATA',
					pnl: 'NO DATA',
					action: 'ERROR',
					cashBalance: '',
					totalEquity: '',
				});
			}
		}

		// Add summary row
		results.push({
			date: today,
			ticker: 'TOTAL',
			shares: '',
			costBasis: '',
			stopLoss: '',
			currentPrice: '',
			totalValue,
			pnl: totalPnl,
			action: '',
			cashBalance: updatedCash,
			totalEquity: totalValue + updatedCash,
		});

		await this._savePortfolioUpdate(results);
		console.log(
			`✅ Portfolio processing completed. Total equity: $${(
				totalValue + updatedCash
			).toFixed(2)}`
		);

		return { portfolio: updatedPortfolio, cash: updatedCash };
	}

	/**
	 * Execute a buy order with automatic trade logging
	 *
	 * Places a market buy order through Alpaca, sets up stop-loss if provided,
	 * and logs the trade to the trade history file.
	 *
	 * @param ticker - Stock symbol to purchase
	 * @param shares - Number of shares to buy
	 * @param stopLoss - Stop-loss price (0 for no stop-loss)
	 * @throws {Error} If order execution fails
	 *
	 * @example
	 * ```typescript
	 * await manager.executeBuy('AAPL', 10, 145.50);
	 * ```
	 */
	async executeBuy(
		ticker: string,
		shares: number,
		stopLoss: number
	): Promise<{
		ticker: string;
		shares: number;
		price: number;
		totalValue: number;
		stopLoss: number;
	}> {
		if (!ticker || shares <= 0) {
			throw new Error(
				'Invalid buy parameters: ticker and shares must be valid'
			);
		}

		try {
			console.log(`💰 Executing BUY order: ${shares} shares of ${ticker}...`);

			const currentPrice = await this.alpaca.getLatestPrice(ticker);
			const cost = currentPrice * shares;

			// Validate sufficient buying power
			const account = await this.alpaca.getAccount();
			const buyingPower = parseFloat(account.buyingPower);

			if (cost > buyingPower) {
				throw new Error(
					`Insufficient buying power: Need $${cost.toFixed(
						2
					)}, have $${buyingPower.toFixed(2)}`
				);
			}

			await this.alpaca.placeBuyOrder(ticker, shares, stopLoss);

			await this._logTrade({
				date: new Date().toISOString().split('T')[0],
				ticker,
				sharesBought: shares,
				buyPrice: currentPrice,
				costBasis: cost,
				pnl: 0,
				reason: 'AI RECOMMENDATION - New position',
			});

			console.log(
				`✅ Buy order executed: ${shares} shares of ${ticker} at $${currentPrice.toFixed(
					2
				)}`
			);

			return {
				ticker,
				shares,
				price: currentPrice,
				totalValue: cost,
				stopLoss
			};
		} catch (error) {
			console.error(`❌ Error executing buy for ${ticker}:`, error);
			throw new Error(`Failed to execute buy order for ${ticker}: ${error}`);
		}
	}

	/**
	 * Execute a sell order with automatic trade logging
	 *
	 * Places a market sell order through Alpaca and logs the trade
	 * to the trade history file.
	 *
	 * @param ticker - Stock symbol to sell
	 * @param shares - Number of shares to sell
	 * @throws {Error} If order execution fails
	 *
	 * @example
	 * ```typescript
	 * await manager.executeSell('AAPL', 5);
	 * ```
	 */
	async executeSell(ticker: string, shares: number): Promise<{
		ticker: string;
		shares: number;
		price: number;
		totalValue: number;
	}> {
		if (!ticker || shares <= 0) {
			throw new Error(
				'Invalid sell parameters: ticker and shares must be valid'
			);
		}

		try {
			console.log(`💸 Executing SELL order: ${shares} shares of ${ticker}...`);

			const currentPrice = await this.alpaca.getLatestPrice(ticker);

			await this.alpaca.placeSellOrder(ticker, shares);

			await this._logTrade({
				date: new Date().toISOString().split('T')[0],
				ticker,
				sharesSold: shares,
				sellPrice: currentPrice,
				costBasis: 0, // Will be calculated from position history
				pnl: 0, // Will be calculated from position history
				reason: 'AI RECOMMENDATION - Position exit',
			});

			console.log(
				`✅ Sell order executed: ${shares} shares of ${ticker} at $${currentPrice.toFixed(
					2
				)}`
			);

			const totalValue = currentPrice * shares;
			return {
				ticker,
				shares,
				price: currentPrice,
				totalValue
			};
		} catch (error) {
			console.error(`❌ Error executing sell for ${ticker}:`, error);
			throw new Error(`Failed to execute sell order for ${ticker}: ${error}`);
		}
	}

	/**
	 * Calculate comprehensive portfolio performance metrics
	 *
	 * Computes key financial metrics including total return, Sharpe ratio,
	 * Sortino ratio, maximum drawdown, and win rate based on historical data.
	 *
	 * @returns Promise resolving to portfolio metrics
	 *
	 * @example
	 * ```typescript
	 * const metrics = await manager.getPortfolioMetrics();
	 * console.log(`Total Return: ${(metrics.totalReturn * 100).toFixed(2)}%`);
	 * console.log(`Sharpe Ratio: ${metrics.sharpeRatio.toFixed(3)}`);
	 * ```
	 */
	async getPortfolioMetrics(): Promise<PortfolioMetrics> {
		try {
			const historyData = await this._loadPortfolioHistory();

			// Try to calculate from historical data first
			if (historyData.length >= 2) {
				const equities = historyData
					.map((d) => d.totalEquity)
					.filter((e) => !isNaN(e) && e > 0);

				if (equities.length >= 2) {
					return this._calculateMetrics(equities);
				}
			}

			// Fallback to real-time metrics when historical data is insufficient
			console.log('⚠️ Insufficient historical data, calculating real-time metrics...');
			return await this._getRealTimeMetrics();
		} catch (error) {
			console.error('❌ Error calculating portfolio metrics:', error);
			return await this._getRealTimeMetrics();
		}
	}

	/**
	 * Get current cash balance from Alpaca account
	 *
	 * @returns Promise resolving to available cash amount
	 *
	 * @example
	 * ```typescript
	 * const cash = await manager.getCash();
	 * console.log(`Available cash: $${cash.toFixed(2)}`);
	 * ```
	 */
	async getCash(): Promise<number> {
		try {
			const account = await this.alpaca.getAccount();
			return parseFloat(account.cash) || 0;
		} catch (error) {
			console.error('❌ Error getting cash balance:', error);
			return 0;
		}
	}

	/**
	 * Get available buying power from Alpaca account
	 *
	 * @returns Promise resolving to available buying power
	 */
	async getAvailableBuyingPower(): Promise<number> {
		try {
			const account = await this.alpaca.getAccount();
			return parseFloat(account.buyingPower) || 0;
		} catch (error) {
			console.error('❌ Error getting buying power:', error);
			return 0;
		}
	}

	/**
	 * Validate if a trade can be executed
	 *
	 * @param ticker - Stock symbol
	 * @param shares - Number of shares
	 * @param currentPrice - Current stock price
	 * @returns Promise resolving to true if trade is valid
	 */
	async validateTrade(
		ticker: string,
		shares: number,
		currentPrice: number
	): Promise<boolean> {
		try {
			const cost = shares * currentPrice;
			const buyingPower = await this.getAvailableBuyingPower();

			if (cost > buyingPower) {
				console.log(
					`❌ Insufficient buying power: Need $${cost.toFixed(
						2
					)}, have $${buyingPower.toFixed(2)}`
				);
				return false;
			}

			// Validate it's a micro-cap
			const isMicroCap = await this.marketData.isMarketCap(ticker);
			if (!isMicroCap) {
				console.log(`❌ ${ticker} is not a micro-cap stock`);
				return false;
			}

			return true;
		} catch (error) {
			console.error(`❌ Error validating trade for ${ticker}:`, error);
			return false;
		}
	}

	/**
	 * Get detailed portfolio summary with position breakdowns
	 *
	 * @returns Promise resolving to comprehensive portfolio summary
	 */
	async getPortfolioSummary(): Promise<PortfolioSummary> {
		try {
			const account = await this.alpaca.getAccount();
			const positions = await this.alpaca.getPositions();

			let totalValue = 0;
			const positionSummary: PositionSummary[] = [];

			for (const position of positions) {
				const currentPrice = position.marketValue / position.shares;
				const dayChange = position.unrealizedIntradayPl;
				const totalChange = position.unrealizedPl;

				positionSummary.push({
					currentPrice,
					dayChange,
					totalChange,
					ticker: position.ticker,
					shares: position.shares,
					avgCost: position.buyPrice,
					marketValue: position.marketValue,
					dayChangePercent: (dayChange / position.costBasis) * 100,
					totalChangePercent: (totalChange / position.costBasis) * 100,
				});

				totalValue += position.marketValue;
			}

			const totalCash = parseFloat(account.cash);
			const totalEquity = parseFloat(account.equity);
			const dayChange = totalEquity - parseFloat(account.lastEquity);
			const dayChangePercent =
				(dayChange / parseFloat(account.lastEquity)) * 100;

			return {
				totalValue,
				totalCash,
				totalEquity,
				dayChange,
				dayChangePercent,
				positions: positionSummary,
			};
		} catch (error) {
			console.error('❌ Error getting portfolio summary:', error);
			throw new Error(`Failed to get portfolio summary: ${error}`);
		}
	}

	/**
	 * Display formatted portfolio status in console
	 */
	async displayPortfolioStatus(): Promise<void> {
		try {
			const summary = await this.getPortfolioSummary();

			console.log('\n📊 === PORTFOLIO STATUS ===');
			console.log('='.repeat(50));
			console.log(
				`💰 Total Equity: $${summary.totalEquity.toLocaleString(undefined, {
					minimumFractionDigits: 2,
					maximumFractionDigits: 2,
				})}`
			);
			console.log(
				`💵 Cash: $${summary.totalCash.toLocaleString(undefined, {
					minimumFractionDigits: 2,
					maximumFractionDigits: 2,
				})}`
			);
			console.log(
				`📈 Positions Value: $${summary.totalValue.toLocaleString(undefined, {
					minimumFractionDigits: 2,
					maximumFractionDigits: 2,
				})}`
			);

			const changeSymbol = summary.dayChange >= 0 ? '+' : '';
			const changeColor = summary.dayChange >= 0 ? '🟢' : '🔴';
			console.log(
				`${changeColor} Day Change: ${changeSymbol}$${summary.dayChange.toLocaleString(
					undefined,
					{ minimumFractionDigits: 2, maximumFractionDigits: 2 }
				)} (${changeSymbol}${summary.dayChangePercent.toFixed(2)}%)`
			);

			if (summary.positions.length > 0) {
				console.log('\n📋 CURRENT POSITIONS:');
				console.log('-'.repeat(80));
				console.log(
					'Ticker  | Shares |  Avg Cost |  Current  | Market Val |  Day P&L  | Total P&L'
				);
				console.log('-'.repeat(80));

				for (const pos of summary.positions) {
					const dayChangeSymbol = pos.dayChange >= 0 ? '+' : '';
					const totalChangeSymbol = pos.totalChange >= 0 ? '+' : '';

					console.log(
						`${pos.ticker.padEnd(7)} | ${pos.shares
							.toString()
							.padStart(6)} | ` +
							`$${pos.avgCost.toFixed(2).padStart(8)} | $${pos.currentPrice
								.toFixed(2)
								.padStart(8)} | ` +
							`$${pos.marketValue.toLocaleString().padStart(9)} | ` +
							`${dayChangeSymbol}$${pos.dayChange.toFixed(2).padStart(8)} | ` +
							`${totalChangeSymbol}$${pos.totalChange.toFixed(2).padStart(8)}`
					);
				}
				console.log('-'.repeat(80));
			} else {
				console.log('\n📝 No current positions');
			}

			console.log('='.repeat(50));
		} catch (error) {
			console.error('❌ Error displaying portfolio status:', error);
		}
	}

	/**
	 * Ensure data directory exists
	 *
	 * @private
	 */
	private async _ensureDataDirectory(): Promise<void> {
		try {
			await fs.mkdir(this.dataDir, { recursive: true });
		} catch (error) {
			console.error('❌ Error creating data directory:', error);
		}
	}

	/**
	 * Load tracked positions from CSV file
	 *
	 * @private
	 * @returns Promise resolving to tracked positions array
	 */
	private async _loadTrackedPositions(): Promise<TrackedPosition[]> {
		try {
			const data = await fs.readFile(this.portfolioFile, 'utf8');
			const rows = data.split('\n').slice(1);

			const positions: TrackedPosition[] = [];

			for (const row of rows) {
				const trimmedRow = row.trim();
				if (trimmedRow) {
					const cols = trimmedRow.split(',');

					if (cols[1] && cols[1] !== 'TOTAL') {
						const shares = parseInt(cols[2], 10) || 0;
						const buyPrice = parseFloat(cols[3]) || 0;

						positions.push({
							shares,
							buyPrice,
							ticker: cols[1],
							stopLoss: parseFloat(cols[4]) || 0,
							costBasis: buyPrice * shares,
						});
					}
				}
			}

			return positions;
		} catch (error) {
			// File doesn't exist or is empty - return empty array
			return [];
		}
	}

	/**
	 * Save portfolio updates to CSV file
	 *
	 * @private
	 * @param updates - Array of portfolio updates to save
	 */
	private async _savePortfolioUpdate(
		updates: PortfolioUpdate[]
	): Promise<void> {
		try {
			const csvWriter = createObjectCsvWriter({
				path: this.portfolioFile,
				header: [
					{ id: 'date', title: 'Date' },
					{ id: 'ticker', title: 'Ticker' },
					{ id: 'shares', title: 'Shares' },
					{ id: 'costBasis', title: 'Cost Basis' },
					{ id: 'stopLoss', title: 'Stop Loss' },
					{ id: 'currentPrice', title: 'Current Price' },
					{ id: 'totalValue', title: 'Total Value' },
					{ id: 'pnl', title: 'PnL' },
					{ id: 'action', title: 'Action' },
					{ id: 'cashBalance', title: 'Cash Balance' },
					{ id: 'totalEquity', title: 'Total Equity' },
				],
				append: true,
			});

			await csvWriter.writeRecords(updates);
		} catch (error) {
			console.error('❌ Error saving portfolio update:', error);
		}
	}

	/**
	 * Log trade to CSV file
	 *
	 * @private
	 * @param trade - Trade information to log
	 */
	private async _logTrade(trade: TradeLog): Promise<void> {
		try {
			const csvWriter = createObjectCsvWriter({
				path: this.tradeLogFile,
				header: [
					{ id: 'date', title: 'Date' },
					{ id: 'ticker', title: 'Ticker' },
					{ id: 'sharesBought', title: 'Shares Bought' },
					{ id: 'buyPrice', title: 'Buy Price' },
					{ id: 'costBasis', title: 'Cost Basis' },
					{ id: 'pnl', title: 'PnL' },
					{ id: 'reason', title: 'Reason' },
					{ id: 'sharesSold', title: 'Shares Sold' },
					{ id: 'sellPrice', title: 'Sell Price' },
				],
				append: true,
			});

			await csvWriter.writeRecords([trade]);
		} catch (error) {
			console.error('❌ Error logging trade:', error);
		}
	}

	/**
	 * Load portfolio history from CSV file
	 *
	 * @private
	 * @returns Promise resolving to portfolio history array
	 */
	private async _loadPortfolioHistory(): Promise<PortfolioHistoryPoint[]> {
		return new Promise((resolve, reject) => {
			const results: PortfolioHistoryPoint[] = [];

			if (!require('fs').existsSync(this.portfolioFile)) {
				resolve([]);
				return;
			}

			require('fs')
				.createReadStream(this.portfolioFile)
				.pipe(csvParser())
				.on('data', (data: any) => {
					if (data.Ticker === 'TOTAL' && data['Total Equity']) {
						const equity = parseFloat(data['Total Equity']);
						if (!isNaN(equity)) {
							results.push({
								date: data.Date,
								totalEquity: equity,
							});
						}
					}
				})
				.on('end', () => resolve(results))
				.on('error', reject);
		});
	}

	/**
	 * Check if stop-loss should be triggered
	 *
	 * @private
	 * @param currentPrice - Current stock price
	 * @param stopLoss - Stop-loss price
	 * @returns True if stop-loss should trigger
	 */
	private _shouldTriggerStopLoss(
		currentPrice: number,
		stopLoss: number
	): boolean {
		return stopLoss > 0 && currentPrice <= stopLoss;
	}

	/**
	 * Calculate portfolio metrics from equity history
	 *
	 * @private
	 * @param equities - Array of equity values
	 * @returns Calculated portfolio metrics
	 */
	private _calculateMetrics(equities: number[]): PortfolioMetrics {
		const returns = equities
			.slice(1)
			.map((equity, i) => (equity - equities[i]) / equities[i]);

		const totalReturn =
			(equities[equities.length - 1] - equities[0]) / equities[0];
		const avgReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length;
		const stdDev = Math.sqrt(
			returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) /
				returns.length
		);

		const dailyRiskFreeRate = this.RISK_FREE_RATE / this.TRADING_DAYS_PER_YEAR;
		const sharpeRatio =
			stdDev !== 0 ? (avgReturn - dailyRiskFreeRate) / stdDev : 0;

		const negativeReturns = returns.filter((r) => r < 0);
		const downDev =
			negativeReturns.length > 0
				? Math.sqrt(
						negativeReturns.reduce((sum, r) => sum + Math.pow(r, 2), 0) /
							negativeReturns.length
				  )
				: 0;
		const sortinoRatio =
			downDev !== 0 ? (avgReturn - dailyRiskFreeRate) / downDev : 0;

		let maxDrawdown = 0;
		let peak = equities[0];
		for (const equity of equities) {
			if (equity > peak) peak = equity;
			const drawdown = (peak - equity) / peak;
			if (drawdown > maxDrawdown) maxDrawdown = drawdown;
		}

		const winRate = returns.filter((r) => r > 0).length / returns.length;

		return {
			totalEquity: equities[equities.length - 1],
			totalReturn,
			sharpeRatio,
			sortinoRatio,
			maxDrawdown,
			winRate,
		};
	}

	/**
	 * Get empty metrics object for error cases
	 *
	 * @private
	 * @returns Empty portfolio metrics
	 */
	/**
	 * Calculate real-time portfolio metrics from current positions and cash
	 * @private
	 */
	private async _getRealTimeMetrics(): Promise<PortfolioMetrics> {
		try {
			// Get current positions and cash
			const positions = await this.getCurrentPortfolio();
			const cash = await this.getCash();
			
			// Also get account data for backup total equity
			const account = await this.alpaca.getAccount();
			
			console.log(`🔍 Real-time metrics calculation:`);
			console.log(`   📊 Positions: ${positions.length}`);
			console.log(`   💵 Cash: $${cash.toFixed(2)}`);
			
			// Calculate total market value of positions
			const totalPositionValue = positions.reduce((sum, pos) => {
				const posValue = pos.marketValue || pos.currentPrice * pos.shares || 0;
				console.log(`   📈 ${pos.ticker}: $${posValue.toFixed(2)} (${pos.shares} shares @ $${pos.currentPrice?.toFixed(2) || 'N/A'})`);
				return sum + posValue;
			}, 0);
			
			console.log(`   💰 Total Position Value: $${totalPositionValue.toFixed(2)}`);
			
			// Total equity = cash + position values (or use Alpaca's equity if our calculation is wrong)
			let totalEquity = cash + totalPositionValue;
			const alpacaEquity = parseFloat(account.equity) || 0;
			
			console.log(`   🏦 Calculated Total Equity: $${totalEquity.toFixed(2)}`);
			console.log(`   🏦 Alpaca Total Equity: $${alpacaEquity.toFixed(2)}`);
			
			// Use Alpaca's equity if it's significantly different (more reliable)
			if (Math.abs(totalEquity - alpacaEquity) > 100 && alpacaEquity > 0) {
				console.log(`   ⚠️  Using Alpaca's equity value (significant difference detected)`);
				totalEquity = alpacaEquity;
			}
			
			// Calculate total unrealized P&L
			const totalUnrealizedPL = positions.reduce((sum, pos) => {
				const pl = pos.unrealizedPl || 0;
				return sum + pl;
			}, 0);
			
			// Calculate total cost basis
			const totalCostBasis = positions.reduce((sum, pos) => {
				const basis = pos.costBasis || pos.buyPrice * pos.shares || 0;
				return sum + basis;
			}, 0);
			
			console.log(`   📊 Total Unrealized P&L: $${totalUnrealizedPL.toFixed(2)}`);
			console.log(`   💸 Total Cost Basis: $${totalCostBasis.toFixed(2)}`);
			
			// Simple return calculation based on unrealized P&L
			let totalReturn = 0;
			if (totalCostBasis > 0) {
				totalReturn = totalUnrealizedPL / totalCostBasis;
			}
			
			console.log(`   📈 Total Return: ${(totalReturn * 100).toFixed(2)}%`);
			
			// For now, set advanced metrics to 0 (would need historical data for proper calculation)
			return {
				totalEquity,
				totalReturn,
				sharpeRatio: 0,
				sortinoRatio: 0,
				maxDrawdown: 0,
				winRate: 0,
			};
		} catch (error) {
			console.error('❌ Error calculating real-time metrics:', error);
			return this._getEmptyMetrics();
		}
	}

	private _getEmptyMetrics(): PortfolioMetrics {
		return {
			totalEquity: 0,
			totalReturn: 0,
			sharpeRatio: 0,
			sortinoRatio: 0,
			maxDrawdown: 0,
			winRate: 0,
		};
	}
}
