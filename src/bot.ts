import { AlpacaService } from './services/alpaca';
import { ChatGPTService } from './services/gpt';
import { GraphGenerator } from './services/graph';
import { PortfolioManager } from './services/manager';
import { MarketDataService } from './services/yahoo';
import {
	DailyUpdateResult,
	AIAnalysisResult,
	ResearchResult,
	ChatGPTDecision,
	PortfolioMetrics,
} from './types';
import { HealthCheckService } from './utils/healthcheck';
import { Logger } from './utils/logger';
import { NotificationService } from './utils/notifications';

/**
 * Comprehensive AI-powered trading bot for micro-cap stock investing
 *
 * Integrates multiple financial services to provide automated portfolio management
 * with AI-driven decision making. Supports both paper trading and live execution
 * with comprehensive risk management and reporting capabilities.
 *
 * Core Features:
 * - AI-powered portfolio analysis and trade recommendations
 * - Automated daily portfolio updates with stop-loss monitoring
 * - Real-time market data integration and analysis
 * - Performance tracking and reporting with interactive charts
 * - Deep research capabilities for individual stocks
 * - Risk management with micro-cap validation
 * - Notification system for trade alerts and summaries
 * - Emergency controls and safety mechanisms
 *
 * Services Integration:
 * - Alpaca API for brokerage operations and paper trading
 * - OpenAI ChatGPT for AI analysis and recommendations
 * - Yahoo Finance for market data and historical pricing
 * - Telegram for real-time notifications
 * - Local file system for data persistence and logging
 *
 * @example
 * ```typescript
 * const bot = new TradingBot();
 * await bot.initialize();
 *
 * // Run daily operations
 * await bot.runDailyUpdate();
 * const analysis = await bot.runAIAnalysis();
 *
 * // Generate reports
 * await bot.generateReport();
 *
 * // Emergency controls
 * await bot.emergencyStop();
 * ```
 */
export class TradingBot {
	private readonly alpaca: AlpacaService;
	private readonly chatGpt: ChatGPTService;
	private readonly portfolio: PortfolioManager;
	private readonly marketData: MarketDataService;
	private readonly graphGenerator: GraphGenerator;
	private readonly notifications: NotificationService;
	private readonly logger: Logger;
	private readonly healthCheck: HealthCheckService;

	private isInitialized: boolean = false;
	private lastUpdateTime?: Date;
	private lastAnalysisTime?: Date;

	/**
	 * Initialize trading bot with all required services
	 *
	 * Services are initialized lazily during the initialize() call to allow
	 * for proper error handling and configuration validation.
	 */
	constructor() {
		this.alpaca = new AlpacaService();
		this.chatGpt = new ChatGPTService();
		this.portfolio = new PortfolioManager();
		this.marketData = new MarketDataService();
		this.graphGenerator = new GraphGenerator();
		this.notifications = new NotificationService();
		this.healthCheck = new HealthCheckService();

		this.logger = new Logger({
			logToConsole: true,
			logToFile: true,
			minLogLevel: process.env.NODE_ENV === 'development' ? 'DEBUG' : 'INFO',
		});
	}

	/**
	 * Initialize trading bot and validate all service connections
	 *
	 * Performs comprehensive initialization including API connectivity tests,
	 * account validation, and service health checks. Must be called before
	 * any other bot operations.
	 *
	 * @throws {Error} If any critical service fails to initialize
	 *
	 * @example
	 * ```typescript
	 * try {
	 *   await bot.initialize();
	 *   console.log('Bot ready for trading');
	 * } catch (error) {
	 *   console.error('Initialization failed:', error);
	 * }
	 * ```
	 */
	async initialize(): Promise<void> {
		if (this.isInitialized) {
			await this.logger.warn(
				'Bot already initialized, skipping...',
				undefined,
				'TRADING_BOT'
			);
			return;
		}

		try {
			await this.logger.info(
				'Initializing ChatGPT Trading Bot...',
				{
					environment: process.env.NODE_ENV || 'production',
					tradingMode:
						process.env.ENABLE_AUTOMATED_TRADING === 'true'
							? 'LIVE'
							: 'SIMULATION',
				},
				'TRADING_BOT'
			);

			console.log('🤖 Initializing ChatGPT Trading Bot...');

			// Check critical service health
			const healthResult = await this.healthCheck.runHealthCheck();
			if (healthResult.overall === 'error') {
				const criticalFailures = healthResult.checks.filter(
					(c) => c.status === 'fail'
				);
				throw new Error(
					`Critical services unavailable: ${criticalFailures
						.map((c) => c.name)
						.join(', ')}`
				);
			}

			// Initialize Alpaca connection
			const account = await this.alpaca.getAccount();
			console.log(`✅ Connected to Alpaca - Account: ${account.id}`);

			const buyingPower = account.buyingPower || '0';
			console.log(`💰 Buying Power: $${buyingPower.toLocaleString()}`);

			// Check market status
			const isOpen = this.alpaca.isMarketOpen();
			console.log(`📈 Market Status: ${isOpen ? 'OPEN' : 'CLOSED'}`);

			// Test notification service
			const notificationStatus = this.notifications.getStatus();
			console.log(
				`📱 Notifications: ${
					notificationStatus.telegramConfigured
						? 'Configured'
						: 'Not configured'
				}`
			);

			this.isInitialized = true;

			await this.logger.info(
				'Trading bot initialized successfully',
				{
					accountId: account.id,
					buyingPower,
					marketOpen: isOpen,
					notificationsEnabled: notificationStatus.telegramConfigured,
				},
				'TRADING_BOT'
			);

			console.log('🚀 Bot initialized successfully!\n');
		} catch (error) {
			await this.logger.error(
				'Failed to initialize trading bot',
				{
					error: error instanceof Error ? error.message : String(error),
				},
				'TRADING_BOT'
			);

			console.error('❌ Failed to initialize bot:', error);
			throw new Error(`Bot initialization failed: ${error}`);
		}
	}

	/**
	 * Execute daily portfolio update workflow
	 *
	 * Performs comprehensive portfolio maintenance including position updates,
	 * stop-loss monitoring, market data retrieval, and performance calculation.
	 * Should be run once per trading day, typically after market close.
	 *
	 * @returns Promise resolving to daily update summary
	 * @throws {Error} If update workflow fails
	 *
	 * @example
	 * ```typescript
	 * const result = await bot.runDailyUpdate();
	 * console.log(`Updated ${result.portfolioCount} positions`);
	 * console.log(`Total equity: $${result.totalEquity}`);
	 * ```
	 */
	async runDailyUpdate(): Promise<DailyUpdateResult> {
		this._ensureInitialized();

		try {
			await this.logger.info(
				'Starting daily portfolio update',
				undefined,
				'TRADING_BOT'
			);
			console.log('📊 Running daily portfolio update...');

			const startTime = Date.now();

			// Get current portfolio state
			const currentPortfolio = await this.portfolio.getCurrentPortfolio();
			const cash = await this.portfolio.getCash();

			console.log(`📋 Current Positions: ${currentPortfolio.length}`);
			console.log(`💵 Available Cash: $${cash.toLocaleString()}`);

			// Process portfolio (check stop losses, update prices)
			const { portfolio: updatedPortfolio, cash: updatedCash } =
				await this.portfolio.processPortfolio(currentPortfolio, cash);

			// Get comprehensive market data
			const portfolioTickers = updatedPortfolio.map((p) => p.ticker);
			const benchmarkTickers = ['^GSPC', '^RUT', 'IWO', 'XBI'];
			const allTickers = [...portfolioTickers, ...benchmarkTickers];

			const marketData = await this.marketData.getMarketData(allTickers);

			// Display market data with formatting
			console.log('\n📈 Market Data:');
			marketData.forEach((data) => {
				const changeSymbol = data.percentChange >= 0 ? '+' : '';
				const changeColor = data.percentChange >= 0 ? '🟢' : '🔴';
				console.log(
					`${changeColor} ${data.symbol}: $${data.price.toFixed(2)} ` +
						`(${changeSymbol}${data.percentChange.toFixed(2)}%) ` +
						`Vol: ${data.volume.toLocaleString()}`
				);
			});

			// Calculate portfolio metrics
			const metrics = await this.portfolio.getPortfolioMetrics();

			console.log('\n📊 Portfolio Metrics:');
			console.log(`💰 Total Equity: $${metrics.totalEquity.toFixed(2)}`);
			console.log(
				`📈 Total Return: ${(metrics.totalReturn * 100).toFixed(2)}%`
			);
			console.log(`🎯 Sharpe Ratio: ${metrics.sharpeRatio.toFixed(3)}`);
			console.log(`🏆 Win Rate: ${(metrics.winRate * 100).toFixed(1)}%`);

			// Send daily summary notification
			await this._sendDailySummaryNotification(
				metrics,
				updatedPortfolio.length
			);

			const duration = Date.now() - startTime;
			this.lastUpdateTime = new Date();

			await this.logger.info(
				'Daily update completed successfully',
				{
					duration: `${duration}ms`,
					positions: updatedPortfolio.length,
					totalEquity: metrics.totalEquity,
					marketDataPoints: marketData.length,
				},
				'TRADING_BOT'
			);

			console.log(`\n✅ Daily update completed (${duration}ms)`);

			return {
				portfolioCount: updatedPortfolio.length,
				totalEquity: metrics.totalEquity,
				dayChange: metrics.totalReturn,
				cashBalance: updatedCash,
				processedTickers: portfolioTickers,
				marketDataPoints: marketData.length,
			};
		} catch (error) {
			await this.logger.error(
				'Daily update failed',
				{
					error: error instanceof Error ? error.message : String(error),
				},
				'TRADING_BOT'
			);

			console.error('❌ Error during daily update:', error);
			throw new Error(`Daily update failed: ${error}`);
		}
	}

	/**
	 * Execute AI-powered portfolio analysis and trading recommendations
	 *
	 * Leverages ChatGPT to analyze current portfolio state, market conditions,
	 * and generate actionable trading recommendations. Can execute trades
	 * automatically if ENABLE_AUTOMATED_TRADING is set to true.
	 *
	 * @returns Promise resolving to AI analysis results
	 * @throws {Error} If AI analysis fails
	 *
	 * @example
	 * ```typescript
	 * const result = await bot.runAIAnalysis();
	 * console.log(`${result.totalRecommendations} recommendations generated`);
	 * console.log(`${result.executedTrades} trades executed`);
	 * ```
	 */
	async runAIAnalysis(): Promise<AIAnalysisResult> {
		this._ensureInitialized();

		try {
			await this.logger.info(
				'Starting AI portfolio analysis',
				undefined,
				'TRADING_BOT'
			);
			console.log('🧠 Running AI portfolio analysis...');

			const startTime = Date.now();

			// Gather analysis data
			const currentPortfolio = await this.portfolio.getCurrentPortfolio();
			const cash = await this.portfolio.getCash();
			const metrics = await this.portfolio.getPortfolioMetrics();

			// Get relevant market data
			const portfolioTickers = currentPortfolio.map((p) => p.ticker);
			const analysisData = await this.marketData.getMarketData([
				...portfolioTickers,
				'^GSPC',
				'^RUT',
			]);

			// Get AI recommendations
			const decisions = await this.chatGpt.getPortfolioDecision(
				currentPortfolio,
				cash,
				metrics,
				analysisData
			);

			// Display recommendations
			console.log('\n🤖 AI Recommendations:');
			if (decisions.length === 0) {
				console.log('   No specific recommendations at this time.');
			} else {
				decisions.forEach((decision, index) => {
					console.log(
						`${index + 1}. ${decision.action} ${decision.ticker || 'Portfolio'}`
					);
					if (decision.shares) console.log(`   📊 Shares: ${decision.shares}`);
					if (decision.stopLoss)
						console.log(`   🛡️ Stop Loss: $${decision.stopLoss.toFixed(2)}`);
					console.log(`   💭 Reasoning: ${decision.reasoning}`);
					console.log('');
				});
			}

			// Execute trades if enabled
			let executedTrades = 0;
			let skippedTrades = 0;
			const tradingEnabled = process.env.ENABLE_AUTOMATED_TRADING === 'true';

			if (tradingEnabled) {
				const executionResult = await this._executeDecisions(decisions);
				executedTrades = executionResult.executed;
				skippedTrades = executionResult.skipped;
			} else {
				console.log(
					'⚠️ Automated trading disabled. Set ENABLE_AUTOMATED_TRADING=true to execute trades.'
				);
			}

			const duration = Date.now() - startTime;
			this.lastAnalysisTime = new Date();

			await this.logger.info(
				'AI analysis completed',
				{
					duration: `${duration}ms`,
					recommendations: decisions.length,
					executedTrades,
					skippedTrades,
					tradingEnabled,
				},
				'TRADING_BOT'
			);

			console.log(`\n✅ AI analysis completed (${duration}ms)`);

			return {
				recommendations: decisions,
				executedTrades,
				skippedTrades,
				tradingEnabled,
				totalRecommendations: decisions.length,
			};
		} catch (error) {
			await this.logger.error(
				'AI analysis failed',
				{
					error: error instanceof Error ? error.message : String(error),
				},
				'TRADING_BOT'
			);

			console.error('❌ Error during AI analysis:', error);
			throw new Error(`AI analysis failed: ${error}`);
		}
	}

	/**
	 * Generate comprehensive performance reports and charts
	 *
	 * Creates interactive HTML charts and exports portfolio data for analysis.
	 * Generates timestamped files in the data directory.
	 *
	 * @returns Promise that resolves when report generation is complete
	 * @throws {Error} If report generation fails
	 *
	 * @example
	 * ```typescript
	 * await bot.generateReport();
	 * // Creates files like:
	 * // ./data/performance_chart_2023-12-12.html
	 * // ./data/portfolio_export_2023-12-12.csv
	 * ```
	 */
	async generateReport(): Promise<void> {
		this._ensureInitialized();

		try {
			await this.logger.info(
				'Starting report generation',
				undefined,
				'TRADING_BOT'
			);
			console.log('📊 Generating performance report...');

			const dateStr = new Date().toISOString().split('T')[0];

			// Generate interactive chart
			const chartPath = `./data/performance_chart_${dateStr}.html`;
			await this.graphGenerator.generatePerformanceChart(chartPath);

			// Export portfolio data
			const dataPath = `./data/portfolio_export_${dateStr}.csv`;
			await this.graphGenerator.exportPortfolioData(dataPath);

			await this.logger.info(
				'Report generation completed',
				{
					chartPath,
					dataPath,
				},
				'TRADING_BOT'
			);

			console.log('✅ Report generation completed');
			console.log(`   📈 Chart: ${chartPath}`);
			console.log(`   📊 Data: ${dataPath}`);
		} catch (error) {
			await this.logger.error(
				'Report generation failed',
				{
					error: error instanceof Error ? error.message : String(error),
				},
				'TRADING_BOT'
			);

			console.error('❌ Error generating report:', error);
			throw new Error(`Report generation failed: ${error}`);
		}
	}

	/**
	 * Perform comprehensive deep research on current holdings and opportunities
	 *
	 * Analyzes current portfolio positions and screens for new micro-cap
	 * investment opportunities using AI-powered research capabilities.
	 *
	 * @returns Promise resolving to research summary
	 * @throws {Error} If research process fails
	 *
	 * @example
	 * ```typescript
	 * const research = await bot.runWeeklyDeepResearch();
	 * console.log(`Researched ${research.researchCount} stocks`);
	 * console.log(`Found ${research.screenedOpportunities.length} new opportunities`);
	 * ```
	 */
	async runWeeklyDeepResearch(): Promise<ResearchResult> {
		this._ensureInitialized();

		try {
			await this.logger.info(
				'Starting weekly deep research',
				undefined,
				'TRADING_BOT'
			);
			console.log('🔍 Running weekly deep research...');

			const startTime = Date.now();
			const currentPortfolio = await this.portfolio.getCurrentPortfolio();
			const currentTickers = currentPortfolio.map((p) => p.ticker);

			// Research current holdings
			console.log('\n📚 Research on Current Holdings:');
			const researchedTickers: string[] = [];

			for (const position of currentPortfolio) {
				try {
					console.log(`\n--- ${position.ticker} Deep Analysis ---`);
					const research = await this.chatGpt.getDeepResearch(position.ticker);
					console.log(research);
					researchedTickers.push(position.ticker);

					// Small delay to avoid rate limiting
					await new Promise((resolve) => setTimeout(resolve, 1000));
				} catch (error) {
					await this.logger.warn(
						`Research failed for ${position.ticker}`,
						{
							error: error instanceof Error ? error.message : String(error),
						},
						'TRADING_BOT'
					);
					console.error(`⚠️  Error researching ${position.ticker}:`, error);
				}
			}

			// Screen for new opportunities
			console.log('\n🔎 Screening for new micro-cap opportunities...');
			const screenedTickers = await this.marketData.screenMicroCaps();

			console.log(
				`📋 Found ${screenedTickers.length} potential opportunities:`
			);
			console.log(`   ${screenedTickers.join(', ')}`);

			// Deep research on top picks
			const topPicks = screenedTickers.slice(0, 3);
			console.log(`\n🎯 Deep research on top ${topPicks.length} picks...`);

			for (const ticker of topPicks) {
				try {
					console.log(`\n--- ${ticker} Opportunity Analysis ---`);
					const research = await this.chatGpt.getDeepResearch(ticker);
					console.log(research);

					// Small delay to avoid rate limiting
					await new Promise((resolve) => setTimeout(resolve, 1000));
				} catch (error) {
					await this.logger.warn(
						`Opportunity research failed for ${ticker}`,
						{
							error: error instanceof Error ? error.message : String(error),
						},
						'TRADING_BOT'
					);
					console.error(`⚠️  Error researching ${ticker}:`, error);
				}
			}

			const duration = Date.now() - startTime;
			const researchCount = researchedTickers.length + topPicks.length;

			await this.logger.info(
				'Weekly deep research completed',
				{
					duration: `${duration}ms`,
					currentHoldings: currentTickers.length,
					researchedTickers: researchedTickers.length,
					screenedOpportunities: screenedTickers.length,
					topPicks: topPicks.length,
					totalResearchCount: researchCount,
				},
				'TRADING_BOT'
			);

			console.log(`\n✅ Weekly deep research completed (${duration}ms)`);
			console.log(`📊 Total research reports: ${researchCount}`);

			return {
				currentHoldings: currentTickers,
				researchedTickers,
				screenedOpportunities: screenedTickers,
				topPicks,
				researchCount,
				success: true,
				duration: researchCount,
				timestamp: new Date(),
				totalResearchReports: 0,
			};
		} catch (error) {
			await this.logger.error(
				'Weekly research failed',
				{
					error: error instanceof Error ? error.message : String(error),
				},
				'TRADING_BOT'
			);

			console.error('❌ Error during deep research:', error);
			throw new Error(`Weekly research failed: ${error}`);
		}
	}

	/**
	 * Emergency stop - immediately cancel all open orders
	 *
	 * Provides immediate halt of all trading activity by cancelling
	 * all pending orders. Use in emergency situations or when immediate
	 * trading cessation is required.
	 *
	 * @returns Promise that resolves when all orders are cancelled
	 * @throws {Error} If emergency stop fails
	 *
	 * @example
	 * ```typescript
	 * // In case of emergency
	 * await bot.emergencyStop();
	 * console.log('All trading halted');
	 * ```
	 */
	async emergencyStop(): Promise<void> {
		try {
			await this.logger.warn(
				'Emergency stop initiated',
				undefined,
				'TRADING_BOT'
			);
			console.log('🛑 Emergency stop initiated - cancelling all orders...');

			await this.alpaca.cancelAllOrders();

			await this.logger.info(
				'Emergency stop completed - all orders cancelled',
				undefined,
				'TRADING_BOT'
			);
			console.log('✅ All orders cancelled - trading halted');

			// Send emergency notification
			await this.notifications.sendAlert(
				'Emergency Stop Activated',
				'All trading orders have been cancelled. Trading bot is in emergency stop mode.',
				'warning'
			);
		} catch (error) {
			await this.logger.error(
				'Emergency stop failed',
				{
					error: error instanceof Error ? error.message : String(error),
				},
				'TRADING_BOT'
			);

			console.error('❌ Error during emergency stop:', error);
			throw new Error(`Emergency stop failed: ${error}`);
		}
	}

	/**
	 * Get portfolio manager instance
	 *
	 * Provides access to the portfolio manager for external operations.
	 * Mainly used by analysis services that need direct portfolio access.
	 *
	 * @returns Portfolio manager instance
	 * @throws {Error} If bot is not initialized
	 */
	getPortfolioManager(): PortfolioManager {
		this._ensureInitialized();
		return this.portfolio;
	}

	/**
	 * Get current bot status and statistics
	 *
	 * @returns Comprehensive bot status information
	 */
	getBotStatus(): {
		initialized: boolean;
		lastUpdate?: Date;
		lastAnalysis?: Date;
		tradingEnabled: boolean;
		environment: string;
	} {
		return {
			initialized: this.isInitialized,
			lastUpdate: this.lastUpdateTime,
			lastAnalysis: this.lastAnalysisTime,
			tradingEnabled: process.env.ENABLE_AUTOMATED_TRADING === 'true',
			environment: process.env.NODE_ENV || 'production',
		};
	}

	/**
	 * Get last analysis time for intraday scheduling logic
	 */
	getLastAnalysisTime(): Date | undefined {
		return this.lastAnalysisTime;
	}

	/**
	 * Execute continuous trading with comprehensive research and loss control
	 *
	 * Performs intensive market research every minute during trading hours:
	 * - Analyzes current portfolio positions for stop-loss adjustments
	 * - Screens for new micro-cap opportunities
	 * - Implements dynamic loss control based on market conditions
	 * - Executes trades only when high-confidence opportunities exist
	 *
	 * @returns Promise resolving to continuous trading results
	 * @throws {Error} If continuous trading analysis fails
	 */
	async runContinuousTrading(): Promise<AIAnalysisResult> {
		this._ensureInitialized();

		try {
			await this.logger.info(
				'Starting continuous trading analysis',
				undefined,
				'TRADING_BOT'
			);
			console.log('🔍 Running continuous market research and analysis...');

			const startTime = Date.now();

			// 1. Get current portfolio and market state
			console.log('   📋 Step 1: Fetching current portfolio data...');
			const currentPortfolio = await this.portfolio.getCurrentPortfolio();
			const cash = await this.portfolio.getCash();
			const metrics = await this.portfolio.getPortfolioMetrics();

			console.log(`   📊 Portfolio: ${currentPortfolio.length} positions, $${cash.toFixed(2)} cash`);
			console.log(`   💰 Total Equity: $${metrics.totalEquity?.toFixed(2) || 'N/A'}`);
			console.log(`   📈 Total Return: ${(metrics.totalReturn * 100)?.toFixed(2) || 'N/A'}%`);

			// 2. Comprehensive market analysis
			console.log('   📈 Step 2: Fetching market data...');
			const portfolioTickers = currentPortfolio.map((p) => p.ticker);
			const benchmarkTickers = ['^GSPC', '^RUT', 'IWO', 'XBI'];
			console.log(`   🎯 Analyzing ${portfolioTickers.length} portfolio tickers + ${benchmarkTickers.length} benchmarks`);
			
			const analysisData = await this.marketData.getMarketData([
				...portfolioTickers,
				...benchmarkTickers,
			]);
			
			console.log(`   ✅ Market data retrieved for ${analysisData.length} symbols`);

			// 3. Check existing positions for loss control
			console.log('   🛡️ Step 3: Performing loss control analysis...');
			await this._performLossControlAnalysis(currentPortfolio, analysisData);

			// 4. Screen for new opportunities if we have cash
			console.log('   💵 Step 4: Checking for new investment opportunities...');
			let newOpportunities: string[] = [];
			if (cash > 1000) {
				console.log(`   💰 Cash available: $${cash.toFixed(2)} - screening for micro-caps...`);
				newOpportunities = await this.marketData.screenMicroCaps();
				console.log(`   📋 Found ${newOpportunities.length} potential new opportunities`);
			} else {
				console.log(`   💸 Low cash ($${cash.toFixed(2)}) - skipping opportunity screening`);
			}

			// 5. Get AI recommendations including new opportunities
			console.log('   🤖 Step 5: Getting AI trading recommendations...');
			const allTickers = [...portfolioTickers, ...newOpportunities.slice(0, 5)]; // Limit to top 5 new opportunities
			console.log(`   🎯 AI analyzing ${allTickers.length} total symbols for trading decisions`);
			
			const enhancedAnalysisData = await this.marketData.getMarketData(allTickers);
			console.log('   📊 Enhanced market data retrieved, consulting AI...');
			
			const decisions = await this.chatGpt.getPortfolioDecision(
				currentPortfolio,
				cash,
				metrics,
				enhancedAnalysisData
			);
			
			console.log(`   🧠 AI analysis complete - generated ${decisions.length} recommendations`);

			// 6. Display recommendations
			console.log('\n🤖 AI Trading Recommendations:');
			if (decisions.length === 0) {
				console.log('   No trading opportunities identified at this time.');
			} else {
				decisions.forEach((decision, index) => {
					console.log(
						`${index + 1}. ${decision.action} ${decision.ticker || 'Portfolio'}`
					);
					if (decision.shares) console.log(`   📊 Shares: ${decision.shares}`);
					if (decision.stopLoss)
						console.log(`   🛡️ Stop Loss: $${decision.stopLoss.toFixed(2)}`);
					console.log(`   💭 Reasoning: ${decision.reasoning}`);
					console.log('');
				});
			}

			// 7. Execute trades if enabled
			console.log('   ⚡ Step 6: Trade execution phase...');
			let executedTrades = 0;
			let skippedTrades = 0;
			const tradingEnabled = process.env.ENABLE_AUTOMATED_TRADING === 'true';
			
			console.log(`   🎛️ Trading enabled: ${tradingEnabled ? '✅ YES' : '❌ NO'}`);

			if (tradingEnabled && decisions.length > 0) {
				console.log(`   🚀 Executing ${decisions.length} trading decisions...`);
				const executionResult = await this._executeDecisions(decisions);
				executedTrades = executionResult.executed;
				skippedTrades = executionResult.skipped;
				console.log(`   ✅ Execution complete: ${executedTrades} executed, ${skippedTrades} skipped`);
			} else if (!tradingEnabled) {
				console.log('   ⚠️ Automated trading disabled. Set ENABLE_AUTOMATED_TRADING=true to execute trades.');
			} else {
				console.log('   ℹ️ No trades to execute - AI found no opportunities at this time');
			}

			const duration = Date.now() - startTime;
			this.lastAnalysisTime = new Date();

			await this.logger.info(
				'Continuous trading analysis completed',
				{
					duration: `${duration}ms`,
					portfolioPositions: currentPortfolio.length,
					newOpportunities: newOpportunities.length,
					recommendations: decisions.length,
					executedTrades,
					skippedTrades,
					tradingEnabled,
				},
				'TRADING_BOT'
			);

			console.log(`✅ Continuous analysis completed (${duration}ms) - ${executedTrades} trades executed`);

			return {
				recommendations: decisions,
				executedTrades,
				skippedTrades,
				tradingEnabled,
				totalRecommendations: decisions.length,
			};
		} catch (error) {
			await this.logger.error(
				'Continuous trading analysis failed',
				{
					error: error instanceof Error ? error.message : String(error),
				},
				'TRADING_BOT'
			);

			console.error('❌ Error during continuous trading analysis:', error);
			throw new Error(`Continuous trading analysis failed: ${error}`);
		}
	}

	/**
	 * Perform intelligent loss control analysis on current positions
	 *
	 * Analyzes each position for:
	 * - Dynamic stop-loss adjustments based on volatility
	 * - Trailing stop-loss implementation
	 * - Risk-based position sizing
	 * - Market sentiment impact on holdings
	 *
	 * @private
	 * @param currentPortfolio - Current portfolio positions
	 * @param marketData - Current market data for analysis
	 */
	private async _performLossControlAnalysis(
		currentPortfolio: any[],
		marketData: any[]
	): Promise<void> {
		if (currentPortfolio.length === 0) {
			console.log('📊 No positions to analyze for loss control');
			return;
		}

		console.log('🛡️ Performing loss control analysis on current positions...');

		for (const position of currentPortfolio) {
			try {
				const tickerData = marketData.find(d => d.symbol === position.ticker);
				if (!tickerData) continue;

				const currentPrice = tickerData.price;
				const percentChange = tickerData.percentChange;
				const unrealizedPL = position.unrealizedPl || 0;
				const unrealizedPLPercent = position.unrealizedPlPercent || 0;

				console.log(`\n🔍 Analyzing ${position.ticker}:`);
				console.log(`   Current: $${currentPrice.toFixed(2)} (${percentChange >= 0 ? '+' : ''}${percentChange.toFixed(2)}%)`);
				console.log(`   P&L: $${unrealizedPL.toFixed(2)} (${unrealizedPLPercent >= 0 ? '+' : ''}${unrealizedPLPercent.toFixed(2)}%)`);

				// Dynamic stop-loss logic
				let recommendedAction = 'HOLD';
				let reasoning = 'Position within acceptable risk parameters';

				// Aggressive loss control rules
				if (unrealizedPLPercent < -10) {
					recommendedAction = 'SELL';
					reasoning = 'Position down >10% - cut losses to preserve capital';
				} else if (unrealizedPLPercent < -5 && percentChange < -3) {
					recommendedAction = 'SELL';
					reasoning = 'Position declining with negative daily momentum';
				} else if (unrealizedPLPercent > 15) {
					// Take partial profits on big winners
					recommendedAction = 'PARTIAL_SELL';
					reasoning = 'Strong gains - consider taking partial profits';
				} else if (unrealizedPLPercent > 5 && percentChange < -5) {
					// Trailing stop logic
					recommendedAction = 'TIGHTEN_STOP';
					reasoning = 'Profitable position with negative momentum - tighten stop-loss';
				}

				console.log(`   🎯 Recommendation: ${recommendedAction}`);
				console.log(`   💭 Reasoning: ${reasoning}`);

				// Log the analysis for AI consideration
				await this.logger.info(
					'Loss control analysis',
					{
						ticker: position.ticker,
						currentPrice,
						percentChange,
						unrealizedPL,
						unrealizedPLPercent,
						recommendation: recommendedAction,
						reasoning
					},
					'TRADING_BOT'
				);

			} catch (error) {
				console.error(`❌ Error analyzing ${position.ticker}:`, error);
			}
		}

		console.log('✅ Loss control analysis completed\n');
	}

	/**
	 * Execute trading decisions with validation and error handling
	 *
	 * @private
	 * @param decisions - Array of trading decisions from AI
	 * @returns Execution summary
	 */
	private async _executeDecisions(decisions: ChatGPTDecision[]): Promise<{
		executed: number;
		skipped: number;
	}> {
		console.log('🔄 Executing AI trading decisions...');

		let executed = 0;
		let skipped = 0;

		for (const decision of decisions) {
			try {
				if (
					decision.action === 'BUY' &&
					decision.ticker &&
					decision.shares &&
					decision.stopLoss
				) {
					// Validate micro-cap status
					const isMicroCap = await this.marketData.isMarketCap(decision.ticker);
					if (!isMicroCap) {
						console.log(
							`⚠️  Skipping ${decision.ticker} - not a micro-cap stock`
						);
						skipped++;
						continue;
					}

					const buyResult = await this.portfolio.executeBuy(
						decision.ticker,
						decision.shares,
						decision.stopLoss
					);

					// Send trade notification with actual execution data
					await this.notifications.sendTradeAlert({
						type: 'BUY',
						ticker: buyResult.ticker,
						shares: buyResult.shares,
						price: buyResult.price,
						totalValue: buyResult.totalValue,
						reason: decision.reasoning,
						stopLoss: buyResult.stopLoss,
					});

					console.log(
						`✅ Executed BUY: ${buyResult.shares} shares of ${buyResult.ticker} at $${buyResult.price.toFixed(2)} (Total: $${buyResult.totalValue.toFixed(2)})`
					);
					executed++;
				} else if (
					decision.action === 'SELL' &&
					decision.ticker &&
					decision.shares
				) {
					const sellResult = await this.portfolio.executeSell(decision.ticker, decision.shares);

					// Send trade notification with actual execution data
					await this.notifications.sendTradeAlert({
						type: 'SELL',
						ticker: sellResult.ticker,
						shares: sellResult.shares,
						price: sellResult.price,
						totalValue: sellResult.totalValue,
						reason: decision.reasoning,
					});

					console.log(
						`✅ Executed SELL: ${sellResult.shares} shares of ${sellResult.ticker} at $${sellResult.price.toFixed(2)} (Total: $${sellResult.totalValue.toFixed(2)})`
					);
					executed++;
				} else {
					console.log(
						`ℹ️  Skipping incomplete decision: ${decision.action} ${
							decision.ticker || 'unknown'
						}`
					);
					skipped++;
				}

				// Longer delay between trades to avoid API rate limits
				await new Promise((resolve) => setTimeout(resolve, 3000));
			} catch (error) {
				await this.logger.error(
					`Trade execution failed`,
					{
						action: decision.action,
						ticker: decision.ticker,
						error: error instanceof Error ? error.message : String(error),
					},
					'TRADING_BOT'
				);

				console.error(
					`❌ Error executing ${decision.action} for ${decision.ticker}:`,
					error
				);
				skipped++;
			}
		}

		console.log(
			`✅ Trading execution completed: ${executed} executed, ${skipped} skipped`
		);
		return { executed, skipped };
	}

	/**
	 * Send daily summary notification
	 *
	 * @private
	 */
	private async _sendDailySummaryNotification(
		metrics: PortfolioMetrics,
		positionCount: number
	): Promise<void> {
		try {
			await this.notifications.sendDailySummary({
				totalEquity: metrics.totalEquity,
				dayChange: metrics.totalReturn * metrics.totalEquity, // Approximate daily change
				dayChangePercent: metrics.totalReturn * 100,
				positions: positionCount,
				trades: 0, // Would need to track daily trades
			});
		} catch (error) {
			await this.logger.warn(
				'Failed to send daily summary notification',
				{
					error: error instanceof Error ? error.message : String(error),
				},
				'TRADING_BOT'
			);
		}
	}

	/**
	 * Ensure bot is initialized before operations
	 *
	 * @private
	 * @throws {Error} If bot is not initialized
	 */
	private _ensureInitialized(): void {
		if (!this.isInitialized) {
			throw new Error('Trading bot not initialized. Call initialize() first.');
		}
	}
}
