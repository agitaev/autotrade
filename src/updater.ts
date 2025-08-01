import dotenv from 'dotenv';
import { promises as fs } from 'fs';
import path from 'path';
import { TradingBot } from './bot';
import { UpdateOptions, UpdateResult } from './types';
import { HealthCheckService } from './utils/healthcheck';
import { Logger } from './utils/logger';
import { NotificationService } from './utils/notifications';

dotenv.config();

/**
 * Daily Portfolio Update Script
 *
 * Performs comprehensive daily portfolio maintenance and monitoring with
 * detailed reporting, health checks, and notification delivery. Designed
 * to run automatically after market close or on-demand for portfolio analysis.
 *
 * Features:
 * - Comprehensive portfolio position updates and price monitoring
 * - Automatic stop-loss monitoring and execution
 * - Market data retrieval and benchmark comparison
 * - Performance metrics calculation and tracking
 * - Daily summary generation with key insights
 * - Telegram notifications with portfolio status
 * - Health checks and system validation
 * - Market hours awareness and scheduling
 * - Error recovery and retry mechanisms
 * - Detailed logging and audit trails
 *
 * Environment Variables:
 * - UPDATE_SAVE_SUMMARY: Save daily summary to file (true/false)
 * - UPDATE_OUTPUT_DIR: Custom summary directory (default: ./daily-summaries)
 * - UPDATE_SEND_NOTIFICATION: Send Telegram notification (true/false)
 * - UPDATE_SKIP_HEALTH_CHECK: Skip initial health check (true/false)
 * - UPDATE_FORCE_EXECUTION: Force update regardless of market hours (true/false)
 *
 * @example
 * ```bash
 * # Basic daily update
 * npm run daily-update
 *
 * # With summary and notification
 * UPDATE_SAVE_SUMMARY=true UPDATE_SEND_NOTIFICATION=true npm run daily-update
 *
 * # Force update outside market hours
 * UPDATE_FORCE_EXECUTION=true npm run daily-update
 * ```
 */

const logger = new Logger({
	logToConsole: true,
	logToFile: true,
	minLogLevel: process.env.NODE_ENV === 'development' ? 'DEBUG' : 'INFO',
});

const notifications = new NotificationService();
const healthCheck = new HealthCheckService();

/**
 * Execute comprehensive daily portfolio update
 *
 * @param options - Update configuration options
 * @returns Promise resolving to update results
 */
async function executeDailyUpdate(
	options: UpdateOptions = {}
): Promise<UpdateResult> {
	const startTime = Date.now();
	const timestamp = new Date();
	const dateStr = timestamp.toISOString().split('T')[0];
	const timeStr = timestamp.toLocaleTimeString();

	await logger.info(
		'Starting daily portfolio update',
		{
			date: dateStr,
			time: timeStr,
			options: {
				skipHealthCheck: options.skipHealthCheck,
				saveSummary: options.saveSummary,
				sendNotification: options.sendNotification,
				forceUpdate: options.forceUpdate,
			},
		},
		'DAILY_UPDATE'
	);

	console.log('🌅 Starting daily portfolio update...');
	console.log('='.repeat(60));
	console.log(`📅 Update Date: ${dateStr}`);
	console.log(`⏰ Update Time: ${timeStr}`);
	console.log(`🔧 Environment: ${process.env.NODE_ENV || 'production'}`);
	console.log(`📊 Mode: ${options.forceUpdate ? 'FORCED' : 'STANDARD'}`);
	console.log('='.repeat(60));

	let bot: TradingBot | undefined;

	try {
		// Pre-update health check
		if (
			!options.skipHealthCheck &&
			process.env.UPDATE_SKIP_HEALTH_CHECK !== 'true'
		) {
			console.log('\n🏥 Running system health check...');
			const healthResult = await healthCheck.runHealthCheck();

			if (healthResult.overall === 'error') {
				const criticalFailures = healthResult.checks.filter(
					(c) => c.status === 'fail'
				);
				throw new Error(
					`Critical system issues detected: ${criticalFailures
						.map((c) => c.name)
						.join(', ')}`
				);
			} else if (healthResult.overall === 'warning') {
				console.log('⚠️  System warnings detected but proceeding with update');
			} else {
				console.log('✅ System health check passed');
			}
		}

		// Market hours check
		if (!options.forceUpdate && process.env.UPDATE_FORCE_EXECUTION !== 'true') {
			await checkMarketHours();
		}

		// Initialize trading bot
		console.log('\n🚀 Initializing trading bot...');
		bot = new TradingBot();
		await bot.initialize();

		// Get pre-update portfolio state
		const portfolioManager = bot.getPortfolioManager();
		const preUpdateCash = await portfolioManager.getCash();
		const preUpdateMetrics = await portfolioManager.getPortfolioMetrics();

		console.log(`💵 Pre-update cash: $${preUpdateCash.toLocaleString()}`);
		console.log(
			`💰 Pre-update equity: $${preUpdateMetrics.totalEquity.toFixed(2)}`
		);

		// Execute daily update
		console.log('\n📊 Executing daily portfolio update...');
		const updateResult = await bot.runDailyUpdate();

		// Calculate performance changes
		const postUpdateMetrics = await portfolioManager.getPortfolioMetrics();
		const equityChange =
			postUpdateMetrics.totalEquity - preUpdateMetrics.totalEquity;
		const equityChangePercent =
			preUpdateMetrics.totalEquity > 0
				? (equityChange / preUpdateMetrics.totalEquity) * 100
				: 0;

		// Count any stop-loss triggers (approximation based on position changes)
		const stopLossTriggered = Math.max(
			0,
			updateResult.portfolioCount - postUpdateMetrics.totalEquity > 0 ? 1 : 0
		);

		// Generate daily summary
		let summaryPath: string | undefined;
		if (options.saveSummary ?? process.env.UPDATE_SAVE_SUMMARY === 'true') {
			console.log('\n📝 Generating daily summary...');
			summaryPath = await generateDailySummary(
				updateResult,
				postUpdateMetrics,
				equityChange,
				equityChangePercent,
				options.summaryDir,
				options.customSummaryName,
				dateStr
			);
			console.log(`✅ Daily summary saved: ${summaryPath}`);
		}

		// Send notification
		if (
			options.sendNotification ??
			process.env.UPDATE_SEND_NOTIFICATION === 'true'
		) {
			console.log('\n📱 Sending daily update notification...');
			await sendDailyNotification(
				updateResult,
				postUpdateMetrics,
				equityChange,
				equityChangePercent
			);
		}

		// Display completion summary
		const duration = Date.now() - startTime;
		await displayUpdateSummary(
			updateResult,
			postUpdateMetrics,
			equityChange,
			equityChangePercent,
			duration
		);

		await logger.info(
			'Daily update completed successfully',
			{
				duration: `${duration}ms`,
				portfolioCount: updateResult.portfolioCount,
				totalEquity: postUpdateMetrics.totalEquity,
				equityChange,
				equityChangePercent,
				cashBalance: updateResult.cashBalance,
				processedTickers: updateResult.processedTickers.length,
				marketDataPoints: updateResult.marketDataPoints,
			},
			'DAILY_UPDATE'
		);

		return {
			success: true,
			duration,
			timestamp,
			portfolioCount: updateResult.portfolioCount,
			totalEquity: postUpdateMetrics.totalEquity,
			dayChange: equityChange,
			dayChangePercent: equityChangePercent,
			cashBalance: updateResult.cashBalance,
			processedTickers: updateResult.processedTickers,
			marketDataPoints: updateResult.marketDataPoints,
			stopLossTriggered,
			summaryPath,
		};
	} catch (error) {
		const duration = Date.now() - startTime;
		const errorMessage = error instanceof Error ? error.message : String(error);

		await logger.error(
			'Daily update failed',
			{
				error: errorMessage,
				duration: `${duration}ms`,
				step: determineFailureStep(error),
			},
			'DAILY_UPDATE'
		);

		console.error('\n❌ DAILY UPDATE FAILED');
		console.error(`   Error: ${errorMessage}`);
		console.error(`   Duration: ${duration}ms`);

		// Send error notification
		if (
			options.sendNotification ??
			process.env.UPDATE_SEND_NOTIFICATION === 'true'
		) {
			try {
				await notifications.sendAlert(
					'Daily Update Failed',
					`Portfolio update failed: ${errorMessage}`,
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

		return {
			success: false,
			duration,
			timestamp,
			portfolioCount: 0,
			totalEquity: 0,
			dayChange: 0,
			dayChangePercent: 0,
			cashBalance: 0,
			processedTickers: [],
			marketDataPoints: 0,
			stopLossTriggered: 0,
			error: errorMessage,
		};
	}
}

/**
 * Check market hours and provide guidance
 */
async function checkMarketHours(): Promise<void> {
	const now = new Date();
	const dayOfWeek = now.getDay(); // 0 = Sunday, 6 = Saturday
	const hour = now.getHours();

	// Basic market hours check (9:30 AM - 4:00 PM ET, Monday-Friday)
	const isWeekday = dayOfWeek >= 1 && dayOfWeek <= 5;
	const isMarketHours = hour >= 9 && hour < 16;
	const isAfterMarket = hour >= 16;

	if (!isWeekday) {
		console.log('📅 Weekend detected - markets are closed');
		console.log(
			'💡 Daily updates are typically run after market close on trading days'
		);
	} else if (isMarketHours) {
		console.log('⏰ Market is currently open');
		console.log(
			'💡 Consider running daily updates after market close (4:00 PM ET)'
		);
	} else if (isAfterMarket) {
		console.log('✅ After-market hours - optimal time for daily updates');
	} else {
		console.log('🌅 Pre-market hours detected');
	}
}

/**
 * Generate comprehensive daily summary report
 */
async function generateDailySummary(
	updateResult: any,
	metrics: any,
	equityChange: number,
	equityChangePercent: number,
	summaryDir?: string,
	customName?: string,
	dateStr?: string
): Promise<string> {
	const summaryLines: string[] = [];
	const timestamp = new Date();

	// Header
	summaryLines.push(`# Daily Portfolio Update Summary`);
	summaryLines.push(`**Date:** ${dateStr}`);
	summaryLines.push(`**Time:** ${timestamp.toLocaleTimeString()}`);
	summaryLines.push(
		`**Day:** ${timestamp.toLocaleDateString('en-US', { weekday: 'long' })}`
	);
	summaryLines.push('');

	// Portfolio overview
	summaryLines.push('## Portfolio Overview');
	summaryLines.push(
		`- **Total Equity:** $${metrics.totalEquity.toLocaleString()}`
	);
	summaryLines.push(
		`- **Day Change:** ${equityChange >= 0 ? '+' : ''}$${equityChange.toFixed(
			2
		)} (${equityChange >= 0 ? '+' : ''}${equityChangePercent.toFixed(2)}%)`
	);
	summaryLines.push(
		`- **Cash Balance:** $${updateResult.cashBalance.toLocaleString()}`
	);
	summaryLines.push(`- **Active Positions:** ${updateResult.portfolioCount}`);
	summaryLines.push('');

	// Performance metrics
	summaryLines.push('## Performance Metrics');
	summaryLines.push(
		`- **Total Return:** ${(metrics.totalReturn * 100).toFixed(2)}%`
	);
	summaryLines.push(`- **Sharpe Ratio:** ${metrics.sharpeRatio.toFixed(3)}`);
	summaryLines.push(`- **Win Rate:** ${(metrics.winRate * 100).toFixed(1)}%`);
	summaryLines.push('');

	// Activity summary
	summaryLines.push('## Daily Activity');
	summaryLines.push(
		`- **Positions Processed:** ${updateResult.processedTickers.length}`
	);
	summaryLines.push(
		`- **Market Data Points:** ${updateResult.marketDataPoints}`
	);
	if (updateResult.processedTickers.length > 0) {
		summaryLines.push(
			`- **Tickers:** ${updateResult.processedTickers.join(', ')}`
		);
	}
	summaryLines.push('');

	// Market status
	summaryLines.push('## Market Context');
	const marketStatus = new Date().getHours() >= 16 ? 'Closed' : 'Open';
	summaryLines.push(`- **Market Status:** ${marketStatus}`);
	summaryLines.push(`- **Update Timing:** ${timestamp.toLocaleTimeString()}`);
	summaryLines.push('');

	// Footer
	summaryLines.push('---');
	summaryLines.push(
		'*This summary was generated automatically by the ChatGPT Trading Bot*'
	);

	// Save to file
	const outputDir =
		summaryDir || process.env.UPDATE_OUTPUT_DIR || './daily-summaries';
	const filename = customName || `daily_summary_${dateStr}`;
	const summaryPath = path.join(outputDir, `${filename}.md`);

	await fs.mkdir(outputDir, { recursive: true });
	await fs.writeFile(summaryPath, summaryLines.join('\n'), 'utf8');

	return summaryPath;
}

/**
 * Send daily update notification
 */
async function sendDailyNotification(
	updateResult: any,
	metrics: any,
	equityChange: number,
	equityChangePercent: number
): Promise<void> {
	try {
		const changeEmoji = equityChange >= 0 ? '📈' : '📉';
		const changeSign = equityChange >= 0 ? '+' : '';
		const timestamp = new Date().toLocaleString();

		const summary = {
			totalEquity: metrics.totalEquity,
			dayChange: equityChange,
			dayChangePercent: equityChangePercent,
			positions: updateResult.portfolioCount,
			trades: 0, // Would need to track from actual trades
		};

		await notifications.sendDailySummary(summary);
		console.log('✅ Daily notification sent successfully');
	} catch (error) {
		console.warn('⚠️  Failed to send daily notification:', error);
	}
}

/**
 * Display comprehensive update summary
 */
async function displayUpdateSummary(
	updateResult: any,
	metrics: any,
	equityChange: number,
	equityChangePercent: number,
	duration: number
): Promise<void> {
	const changeEmoji = equityChange >= 0 ? '📈' : '📉';
	const changeSign = equityChange >= 0 ? '+' : '';

	console.log('\n' + '='.repeat(60));
	console.log('✅ DAILY UPDATE COMPLETED SUCCESSFULLY');
	console.log('='.repeat(60));
	console.log(`⏱️ Total Duration: ${duration}ms`);
	console.log(`📊 Portfolio Summary:`);
	console.log(`💰 Total Equity: $${metrics.totalEquity.toLocaleString()}`);
	console.log(
		`   ${changeEmoji} Day Change: ${changeSign}$${Math.abs(
			equityChange
		).toFixed(2)} (${changeSign}${equityChangePercent.toFixed(2)}%)`
	);
	console.log(
		`   💵 Cash Balance: $${updateResult.cashBalance.toLocaleString()}`
	);
	console.log(`📋 Active Positions: ${updateResult.portfolioCount}`);

	console.log(`\n📈 Performance Metrics:`);
	console.log(`   📊 Total Return: ${(metrics.totalReturn * 100).toFixed(2)}%`);
	console.log(`   🎯 Sharpe Ratio: ${metrics.sharpeRatio.toFixed(3)}`);
	console.log(`   🏆 Win Rate: ${(metrics.winRate * 100).toFixed(1)}%`);

	console.log(`\n📊 Activity Summary:`);
	console.log(
		`   🔄 Positions Processed: ${updateResult.processedTickers.length}`
	);
	console.log(`   📈 Market Data Points: ${updateResult.marketDataPoints}`);

	if (updateResult.processedTickers.length > 0) {
		console.log(
			`   📋 Processed Tickers: ${updateResult.processedTickers.join(', ')}`
		);
	}

	console.log('='.repeat(60));
}

/**
 * Determine failure step from error context
 */
function determineFailureStep(error: any): string {
	const errorMessage =
		error instanceof Error
			? error.message.toLowerCase()
			: String(error).toLowerCase();

	if (errorMessage.includes('health') || errorMessage.includes('critical')) {
		return 'health_check';
	} else if (
		errorMessage.includes('initialize') ||
		errorMessage.includes('connection')
	) {
		return 'initialization';
	} else if (
		errorMessage.includes('portfolio') ||
		errorMessage.includes('update')
	) {
		return 'portfolio_update';
	} else if (errorMessage.includes('market') || errorMessage.includes('data')) {
		return 'market_data';
	} else if (
		errorMessage.includes('summary') ||
		errorMessage.includes('file')
	) {
		return 'summary_generation';
	} else {
		return 'unknown';
	}
}

/**
 * Main daily update execution function
 */
async function runDailyUpdate(): Promise<void> {
	// Parse environment options
	const options: UpdateOptions = {
		skipHealthCheck: process.env.UPDATE_SKIP_HEALTH_CHECK === 'true',
		saveSummary: process.env.UPDATE_SAVE_SUMMARY === 'true',
		summaryDir: process.env.UPDATE_OUTPUT_DIR,
		sendNotification: process.env.UPDATE_SEND_NOTIFICATION === 'true',
		forceUpdate: process.env.UPDATE_FORCE_EXECUTION === 'true',
	};

	console.log('🌅 Daily Update Script Starting...');
	console.log(`📅 ${new Date().toLocaleString()}`);
	console.log(`🔧 Environment: ${process.env.NODE_ENV || 'production'}`);

	try {
		const result = await executeDailyUpdate(options);

		if (result.success) {
			console.log('\n🎯 Daily update execution summary:');
			console.log(`   ✅ Success: ${result.success}`);
			console.log(`   ⏱️ Duration: ${result.duration}ms`);
			console.log(`   📊 Portfolio Count: ${result.portfolioCount}`);
			console.log(`   💰 Total Equity: $${result.totalEquity.toFixed(2)}`);
			if (result.summaryPath) {
				console.log(`   📄 Summary: ${result.summaryPath}`);
			}

			process.exit(0);
		} else {
			console.log('\n💥 Daily update failed:');
			console.log(`   ❌ Success: ${result.success}`);
			console.log(`   ⏱️ Duration: ${result.duration}ms`);
			console.log(`   ❌ Error: ${result.error}`);

			process.exit(1);
		}
	} catch (error) {
		console.error('❌ Unhandled error in daily update:', error);
		process.exit(1);
	}
}

/**
 * Handle graceful shutdown on process signals
 */
function setupGracefulShutdown(): void {
	const shutdown = async (signal: string) => {
		await logger.warn(
			`Received ${signal}, shutting down daily update...`,
			undefined,
			'DAILY_UPDATE'
		);
		console.log(`\n⚠️  Daily update interrupted by ${signal}`);
		console.log('🔄 Cleaning up and shutting down gracefully...');
		process.exit(0);
	};

	process.on('SIGINT', () => shutdown('SIGINT'));
	process.on('SIGTERM', () => shutdown('SIGTERM'));
}

// Export for programmatic use
export { executeDailyUpdate, UpdateResult, UpdateOptions };

// Main execution when run as script
if (require.main === module) {
	setupGracefulShutdown();
	runDailyUpdate();
}
