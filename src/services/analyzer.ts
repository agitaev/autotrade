import dotenv from 'dotenv';
import { TradingBot } from '../bot';
import { PortfolioManager } from './manager';
import { Logger } from '../utils/logger';
import { NotificationService } from '../utils/notifications';
import { AnalysisResult } from './types/analyzer';

dotenv.config();

/**
 * AI Analysis Service for comprehensive portfolio analysis
 *
 * Provides a structured approach to running AI-driven portfolio analysis
 * with proper resource management, error handling, and result tracking.
 *
 * Features:
 * - Automated portfolio data updates
 * - AI-powered trading recommendations
 * - Performance metrics calculation
 * - Notification delivery
 * - Comprehensive logging and error handling
 * - Resource cleanup and graceful shutdown
 *
 * @example
 * ```typescript
 * const analysisService = new AIAnalysisService();
 * const result = await analysisService.runFullAnalysis();
 *
 * if (result.success) {
 *   console.log('Analysis completed successfully');
 * } else {
 *   console.error('Analysis failed:', result.error);
 * }
 * ```
 */
export class AIAnalysisService {
	private readonly logger: Logger;
	private readonly notifications: NotificationService;
	private bot?: TradingBot;
	private portfolioManager?: PortfolioManager;
	private isInitialized: boolean = false;

	/**
	 * Initialize AI Analysis Service
	 *
	 * @param config - Optional configuration overrides
	 */
	constructor(config?: {
		logLevel?: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';
		enableNotifications?: boolean;
	}) {
		this.logger = new Logger({
			logToConsole: true,
			logToFile: true,
			minLogLevel:
				config?.logLevel ||
				(process.env.NODE_ENV === 'development' ? 'DEBUG' : 'INFO'),
		});

		this.notifications =
			config?.enableNotifications !== false
				? new NotificationService()
				: (null as any);

		this._setupGracefulShutdown();
	}

	/**
	 * Initialize the trading bot and portfolio manager
	 *
	 * @returns Promise that resolves when initialization is complete
	 * @throws Error if initialization fails
	 */
	async initialize(): Promise<void> {
		if (this.isInitialized) {
			await this.logger.debug(
				'Service already initialized, skipping...',
				undefined,
				'AI_ANALYSIS'
			);
			return;
		}

		try {
			await this.logger.info(
				'Initializing AI Analysis Service...',
				undefined,
				'AI_ANALYSIS'
			);

			// Initialize trading bot
			this.bot = new TradingBot();
			await this.bot.initialize();

			// Get portfolio manager reference
			this.portfolioManager = this.bot.getPortfolioManager();

			this.isInitialized = true;

			await this.logger.info(
				'AI Analysis Service initialized successfully',
				{
					tradingEnabled: process.env.ENABLE_AUTOMATED_TRADING === 'true',
					environment: process.env.NODE_ENV || 'production',
				},
				'AI_ANALYSIS'
			);
		} catch (error) {
			await this.logger.error(
				'Failed to initialize AI Analysis Service',
				{
					error: error instanceof Error ? error.message : String(error),
				},
				'AI_ANALYSIS'
			);
			throw new Error(`Initialization failed: ${error}`);
		}
	}

	/**
	 * Run complete AI analysis workflow
	 *
	 * @returns Promise resolving to analysis results
	 */
	async runFullAnalysis(): Promise<AnalysisResult> {
		const startTime = Date.now();
		const analysisDate = new Date().toISOString().split('T')[0];

		await this.logger.info(
			'Starting full AI portfolio analysis',
			{
				date: analysisDate,
				tradingEnabled: process.env.ENABLE_AUTOMATED_TRADING === 'true',
			},
			'AI_ANALYSIS'
		);

		console.log('🧠 Starting AI portfolio analysis...');
		console.log(`📅 Analysis Date: ${analysisDate}`);
		console.log(
			`🤖 Trading Mode: ${
				process.env.ENABLE_AUTOMATED_TRADING === 'true' ? 'LIVE' : 'SIMULATION'
			}`
		);
		console.log('='.repeat(60));

		try {
			// Ensure service is initialized
			if (!this.isInitialized) {
				console.log('🚀 Initializing trading bot...');
				await this.initialize();
			}

			// Step 1: Update portfolio data
			console.log('\n📊 Step 1: Updating portfolio data...');
			await this._updatePortfolioData();

			// Step 2: Run AI analysis
			console.log('\n🤖 Step 2: Running AI analysis and recommendations...');
			const analysisResults = await this._runAIAnalysis();

			// Step 3: Calculate performance metrics
			console.log('\n📈 Step 3: Calculating performance metrics...');
			const metrics = await this._calculateMetrics();

			// Step 4: Send notifications
			console.log('\n📱 Step 4: Sending notifications...');
			await this._sendNotifications(analysisResults, metrics);

			// Success summary
			const duration = Date.now() - startTime;
			await this._logSuccessfulCompletion(duration, metrics);

			return {
				success: true,
				duration,
				metrics,
				recommendations: analysisResults?.recommendations || [],
			};
		} catch (error) {
			const duration = Date.now() - startTime;
			const step = this._determineFailureStep(error);

			await this._handleAnalysisFailure(error, duration, step);

			return {
				success: false,
				duration,
				error: error instanceof Error ? error.message : String(error),
				step,
			};
		}
	}

	/**
	 * Run only portfolio data update
	 *
	 * @returns Promise that resolves when update is complete
	 */
	async updatePortfolioOnly(): Promise<void> {
		if (!this.isInitialized) {
			await this.initialize();
		}

		console.log('📊 Updating portfolio data...');
		await this._updatePortfolioData();
		console.log('✅ Portfolio update completed');
	}

	/**
	 * Run only AI analysis (without portfolio update)
	 *
	 * @returns Promise resolving to analysis results
	 */
	async runAIAnalysisOnly(): Promise<any> {
		if (!this.isInitialized) {
			await this.initialize();
		}

		console.log('🤖 Running AI analysis...');
		const results = await this._runAIAnalysis();
		console.log('✅ AI analysis completed');

		return results;
	}

	/**
	 * Get current portfolio metrics
	 *
	 * @returns Promise resolving to portfolio metrics
	 */
	async getPortfolioMetrics(): Promise<any> {
		if (!this.isInitialized) {
			await this.initialize();
		}

		if (!this.portfolioManager) {
			throw new Error('Portfolio manager not available');
		}

		return await this.portfolioManager.getPortfolioMetrics();
	}

	/**
	 * Clean up resources and shutdown gracefully
	 */
	async shutdown(): Promise<void> {
		await this.logger.info(
			'Shutting down AI Analysis Service...',
			undefined,
			'AI_ANALYSIS'
		);

		// Add any cleanup logic here (close connections, etc.)
		this.isInitialized = false;
		this.bot = undefined;
		this.portfolioManager = undefined;

		await this.logger.info(
			'AI Analysis Service shutdown complete',
			undefined,
			'AI_ANALYSIS'
		);
	}

	/**
	 * Check if service is properly initialized
	 *
	 * @returns True if service is ready for operations
	 */
	isReady(): boolean {
		return this.isInitialized && !!this.bot && !!this.portfolioManager;
	}

	/**
	 * Get service status information
	 *
	 * @returns Status object with initialization and configuration details
	 */
	getStatus(): {
		initialized: boolean;
		tradingEnabled: boolean;
		environment: string;
		botReady: boolean;
		portfolioManagerReady: boolean;
	} {
		return {
			initialized: this.isInitialized,
			tradingEnabled: process.env.ENABLE_AUTOMATED_TRADING === 'true',
			environment: process.env.NODE_ENV || 'production',
			botReady: !!this.bot,
			portfolioManagerReady: !!this.portfolioManager,
		};
	}

	/**
	 * Update portfolio data
	 *
	 * @private
	 */
	private async _updatePortfolioData(): Promise<void> {
		if (!this.bot) {
			throw new Error('Trading bot not initialized');
		}

		const updateStartTime = Date.now();
		await this.bot.runDailyUpdate();

		const updateDuration = Date.now() - updateStartTime;
		await this.logger.info(
			'Portfolio data updated',
			{
				duration: `${updateDuration}ms`,
			},
			'AI_ANALYSIS'
		);

		console.log(`✅ Portfolio update completed (${updateDuration}ms)`);
	}

	/**
	 * Run AI analysis
	 *
	 * @private
	 */
	private async _runAIAnalysis(): Promise<any> {
		if (!this.bot) {
			throw new Error('Trading bot not initialized');
		}

		const aiStartTime = Date.now();
		const analysisResults = await this.bot.runAIAnalysis();

		const aiDuration = Date.now() - aiStartTime;
		await this.logger.info(
			'AI analysis completed',
			{
				duration: `${aiDuration}ms`,
				recommendations: analysisResults?.recommendations?.length || 0,
			},
			'AI_ANALYSIS'
		);

		console.log(`✅ AI analysis completed (${aiDuration}ms)`);
		return analysisResults;
	}

	/**
	 * Calculate performance metrics
	 *
	 * @private
	 */
	private async _calculateMetrics(): Promise<any> {
		if (!this.portfolioManager) {
			throw new Error('Portfolio manager not initialized');
		}

		const metrics = await this.portfolioManager.getPortfolioMetrics();

		await this.logger.info(
			'Performance metrics calculated',
			{
				totalEquity: metrics.totalEquity,
				totalReturn: `${(metrics.totalReturn * 100).toFixed(2)}%`,
				sharpeRatio: metrics.sharpeRatio.toFixed(3),
				winRate: `${(metrics.winRate * 100).toFixed(1)}%`,
			},
			'AI_ANALYSIS'
		);

		return metrics;
	}

	/**
	 * Send analysis notifications
	 *
	 * @private
	 */
	private async _sendNotifications(
		analysisResults: any,
		metrics: any
	): Promise<void> {
		if (!this.notifications) {
			console.log('📱 Notifications disabled, skipping...');
			return;
		}

		try {
			await this._sendAnalysisNotification(analysisResults, metrics);
			console.log('✅ Notifications sent successfully');
		} catch (notificationError) {
			await this.logger.warn(
				'Failed to send notifications',
				{
					error: notificationError,
				},
				'AI_ANALYSIS'
			);
			console.log('⚠️  Notifications failed (analysis continued)');
		}
	}

	/**
	 * Send analysis completion notification
	 *
	 * @private
	 */
	private async _sendAnalysisNotification(
		analysisResults: any,
		metrics: any
	): Promise<void> {
		if (!this.notifications) return;

		if (!analysisResults) {
			await this.notifications.sendAlert(
				'AI Analysis Complete',
				'Portfolio analysis completed with no specific recommendations.',
				'info'
			);
			return;
		}

		const message = `Portfolio analysis completed successfully.

📊 *Current Metrics:*
💰 Total Equity: $${metrics.totalEquity.toFixed(2)}
📈 Total Return: ${(metrics.totalReturn * 100).toFixed(2)}%
🎯 Sharpe Ratio: ${metrics.sharpeRatio.toFixed(3)}
🏆 Win Rate: ${(metrics.winRate * 100).toFixed(1)}%

🤖 *AI Recommendations:* ${
			analysisResults.recommendations?.length || 0
		} actions suggested

${
	process.env.ENABLE_AUTOMATED_TRADING === 'true'
		? '🔄 Trades executed automatically'
		: '📋 Review recommendations in logs'
}`;

		await this.notifications.sendAlert(
			'AI Analysis Complete',
			message,
			'success'
		);
	}

	/**
	 * Log successful completion
	 *
	 * @private
	 */
	private async _logSuccessfulCompletion(
		duration: number,
		metrics: any
	): Promise<void> {
		await this.logger.info(
			'AI analysis workflow completed successfully',
			{
				totalDuration: `${duration}ms`,
				steps: [
					'data_update',
					'ai_analysis',
					'metrics_calculation',
					'notifications',
				],
				tradingEnabled: process.env.ENABLE_AUTOMATED_TRADING === 'true',
			},
			'AI_ANALYSIS'
		);

		console.log('\n' + '='.repeat(60));
		console.log('✅ AI analysis completed successfully');
		console.log(`⏱️ Total execution time: ${duration}ms`);
		console.log(`📊 Portfolio equity: $${metrics.totalEquity.toFixed(2)}`);
		console.log(`📈 Total return: ${(metrics.totalReturn * 100).toFixed(2)}%`);
		console.log('='.repeat(60));
	}

	/**
	 * Handle analysis failure
	 *
	 * @private
	 */
	private async _handleAnalysisFailure(
		error: any,
		duration: number,
		step: string
	): Promise<void> {
		await this.logger.error(
			'AI analysis failed',
			{
				error: error instanceof Error ? error.message : String(error),
				stack: error instanceof Error ? error.stack : undefined,
				duration: `${duration}ms`,
				step,
			},
			'AI_ANALYSIS'
		);

		console.error('\n❌ AI analysis failed:');
		console.error(
			`   Error: ${error instanceof Error ? error.message : String(error)}`
		);
		console.error(`   Step: ${step}`);
		console.error(`   Duration: ${duration}ms`);

		// Send error notification
		if (this.notifications) {
			try {
				await this.notifications.sendAlert(
					'AI Analysis Failed',
					`Portfolio analysis failed at ${step}: ${
						error instanceof Error ? error.message : String(error)
					}`,
					'error'
				);
			} catch (notificationError) {
				console.error('   Also failed to send error notification');
			}
		}

		if (process.env.NODE_ENV === 'development') {
			console.error('\n🔍 Stack trace:');
			console.error(error);
		}
	}

	/**
	 * Determine failure step from error
	 *
	 * @private
	 */
	private _determineFailureStep(error: any): string {
		const errorMessage =
			error instanceof Error
				? error.message.toLowerCase()
				: String(error).toLowerCase();

		if (
			errorMessage.includes('initialize') ||
			errorMessage.includes('connection')
		) {
			return 'initialization';
		} else if (
			errorMessage.includes('portfolio') ||
			errorMessage.includes('update')
		) {
			return 'portfolio_update';
		} else if (
			errorMessage.includes('ai') ||
			errorMessage.includes('openai') ||
			errorMessage.includes('chatgpt')
		) {
			return 'ai_analysis';
		} else if (
			errorMessage.includes('trade') ||
			errorMessage.includes('alpaca')
		) {
			return 'trade_execution';
		} else {
			return 'unknown';
		}
	}

	/**
	 * Setup graceful shutdown handlers
	 *
	 * @private
	 */
	private _setupGracefulShutdown(): void {
		const shutdown = async (signal: string) => {
			await this.logger.warn(
				`Received ${signal}, shutting down AI analysis...`,
				undefined,
				'AI_ANALYSIS'
			);
			console.log(`\n⚠️  Received ${signal}, shutting down gracefully...`);
			await this.shutdown();
			process.exit(0);
		};

		process.on('SIGINT', () => shutdown('SIGINT'));
		process.on('SIGTERM', () => shutdown('SIGTERM'));
	}
}

// Standalone script execution
export async function runAiAnalysisScript(): Promise<void> {
	console.log('🚀 AI Analysis Script Starting...');
	console.log(`📅 ${new Date().toLocaleString()}`);
	console.log(`🔧 Environment: ${process.env.NODE_ENV || 'production'}`);

	const analysisService = new AIAnalysisService();

	try {
		const result = await analysisService.runFullAnalysis();

		if (result.success) {
			process.exit(0);
		} else {
			process.exit(1);
		}
	} catch (error) {
		console.error('❌ Unhandled error in AI analysis:', error);
		process.exit(1);
	} finally {
		await analysisService.shutdown();
	}
}

// Main execution when run as script
if (require.main === module) {
	runAiAnalysisScript();
}
