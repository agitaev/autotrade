import dotenv from 'dotenv';
import cron from 'node-cron';
import { TradingBot } from './bot';
import { HealthCheckService } from './utils/healthcheck';
import { NotificationService } from './utils/notifications';
import { Logger } from './utils/logger';
import { executeEmergencyStop } from './emergency';
import { generatePerformanceChart } from './graph';
import { executeWeeklyResearch } from './researcher';
import { AIAnalysisService } from './services/analyzer';
import { executeDailyUpdate } from './updater';
import { MarketDataService } from './services/yahoo';
import { ChatGPTService } from './services/gpt';
import { AlpacaService } from './services/alpaca';

dotenv.config();

/**
 * Main Trading Bot Application
 *
 * Comprehensive AI-powered trading bot with multiple execution modes:
 * - Interactive command execution
 * - Automated scheduling with cron jobs
 * - Emergency controls and health monitoring
 * - Advanced analytics and reporting
 */

const logger = new Logger({
	logToConsole: true,
	logToFile: true,
	minLogLevel: process.env.NODE_ENV === 'development' ? 'DEBUG' : 'INFO',
});

const notifications = new NotificationService();
const healthCheck = new HealthCheckService();

/**
 * Execute startup health check and initialization
 */
async function initializeApplication(): Promise<TradingBot> {
	console.log('🤖 ChatGPT Trading Bot Starting...');
	console.log(`📅 ${new Date().toLocaleString()}`);
	console.log(`🔧 Environment: ${process.env.NODE_ENV || 'production'}`);
	console.log(
		`💼 Trading Mode: ${
			process.env.ENABLE_AUTOMATED_TRADING === 'true' ? 'LIVE' : 'SIMULATION'
		}`
	);
	console.log('='.repeat(60));

	// Run system health check
	console.log('🏥 Running system health check...');
	const healthResult = await healthCheck.runHealthCheck();

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

	// Initialize bot
	const bot = new TradingBot();
	await bot.initialize();

	await logger.info(
		'Application initialized successfully',
		{
			healthStatus: healthResult.overall,
			tradingEnabled: process.env.ENABLE_AUTOMATED_TRADING === 'true',
		},
		'MAIN'
	);

	return bot;
}

/**
 * Display comprehensive help information
 */
function showHelp(): void {
	console.log(`🤖 ChatGPT Trading Bot - Command Reference

CORE OPERATIONS:
  daily                    - Execute daily portfolio update with stop-loss monitoring
  ai-analysis             - Run AI-powered portfolio analysis and recommendations
  report                  - Generate interactive performance charts and analytics
  research                - Perform weekly deep research on holdings and opportunities
  emergency-stop          - Immediately cancel all open orders (emergency use)

ADVANCED FEATURES:
  health-check            - Run comprehensive system health diagnostics
  test-notifications      - Test Telegram notification delivery
  portfolio-status        - Display detailed portfolio summary
  screen-microcaps        - Screen for new micro-cap investment opportunities
  export-portfolio        - Export portfolio data to CSV format

AUTOMATION:
  auto                    - Start automated trading with scheduled operations

ANALYSIS SERVICES:
  full-analysis           - Complete AI analysis workflow with notifications
  analysis-only           - AI analysis without portfolio updates
  update-only             - Portfolio update without AI analysis

SYSTEM TESTING:
  ping-alpaca             - Test Alpaca API connection
  ping-openai             - Test OpenAI configuration
  ping-yahoo              - Test Yahoo Finance connection
  ping-all                - Test all service connections

Environment Variables:
  ALPACA_API_KEY             - Alpaca trading API key (required)
  ALPACA_SECRET_KEY          - Alpaca trading secret key (required)
  OPENAI_API_KEY             - OpenAI API key for AI analysis (required)
  TELEGRAM_BOT_TOKEN         - Telegram bot token for notifications (optional)
  TELEGRAM_CHAT_ID           - Telegram chat ID for notifications (optional)
  
Trading Configuration:
  ENABLE_AUTOMATED_TRADING   - Enable live trading (default: false, simulation mode)
  
Scheduling Configuration:
  CRON_DAILY_SCHEDULE        - Daily update schedule (default: "0 16 * * 1-5")
  CRON_WEEKLY_SCHEDULE       - Weekly research schedule (default: "0 14 * * 0")
  CRON_REPORT_SCHEDULE       - Weekly report schedule (default: "0 18 * * 0")

Package.json Script Examples:
  npm run dev                         # Interactive command mode
  npm run analysis:ai                 # AI portfolio analysis
  npm run analysis:full               # Complete analysis workflow
  npm run research                    # Weekly deep research
  npm run report                      # Generate performance charts
  npm run stop                        # Emergency halt all trading
  npm run ping                        # System health check
  npm run auto                        # Start automated mode

Connection Testing:
  npm run ping:alpaca                 # Test Alpaca API
  npm run ping:openai                 # Test OpenAI configuration
  npm run ping:yahoo                  # Test Yahoo Finance
  npm run ping:telegram               # Test Telegram notifications

Development Commands:
  npm run build                       # Compile TypeScript
  npm run clean                       # Clean build files and logs
  npm run logs                        # View real-time logs

Advanced Examples:
  RESEARCH_SAVE_REPORTS=true npm run research
  UPDATE_SEND_NOTIFICATION=true npm run dev daily
  GRAPH_AUTO_OPEN=true npm run report
  FORCE_STOP=true npm run stop
`);
}

/**
 * Handle automated mode with comprehensive scheduling
 */
async function runAutomatedMode(bot: TradingBot): Promise<void> {
	const dailySchedule = process.env.CRON_DAILY_SCHEDULE || '0 16 * * 1-5';
	const weeklySchedule = process.env.CRON_WEEKLY_SCHEDULE || '0 14 * * 0';
	const reportSchedule = process.env.CRON_REPORT_SCHEDULE || '0 18 * * 0';

	console.log('🤖 Starting automated trading bot...');
	console.log(`📅 Daily Schedule: ${dailySchedule} (After market close)`);
	console.log(`📚 Weekly Research: ${weeklySchedule} (Sunday afternoon)`);
	console.log(`📊 Weekly Reports: ${reportSchedule} (Sunday evening)`);
	console.log('='.repeat(60));

	// Daily operations: Portfolio update + AI analysis
	cron.schedule(dailySchedule, async () => {
		console.log('\n⏰ Scheduled daily operations starting...');

		try {
			await logger.info(
				'Starting scheduled daily operations',
				undefined,
				'CRON'
			);

			// Use AIAnalysisService for comprehensive workflow
			const analysisService = new AIAnalysisService();
			const result = await analysisService.runFullAnalysis();

			if (result.success) {
				console.log('✅ Scheduled daily operations completed successfully');
				await logger.info(
					'Scheduled daily operations completed',
					{
						duration: result.duration,
						recommendations: result.recommendations?.length || 0,
					},
					'CRON'
				);
			} else {
				throw new Error(result.error || 'Daily operations failed');
			}
		} catch (error) {
			console.error('❌ Scheduled daily operations failed:', error);
			await logger.error(
				'Scheduled daily operations failed',
				{
					error: error instanceof Error ? error.message : String(error),
				},
				'CRON'
			);

			// Send error notification
			await notifications.sendAlert(
				'Scheduled Operations Failed',
				`Daily portfolio operations failed: ${error}`,
				'error'
			);
		}
	});

	// Weekly deep research
	cron.schedule(weeklySchedule, async () => {
		console.log('\n📚 Scheduled weekly research starting...');

		try {
			await logger.info(
				'Starting scheduled weekly research',
				undefined,
				'CRON'
			);

			const result = await executeWeeklyResearch({
				saveReport: true,
				sendNotification: true,
				includeScreening: true,
			});

			if (result.success) {
				console.log('✅ Weekly research completed successfully');
				await logger.info(
					'Scheduled weekly research completed',
					{
						duration: result.duration,
						researchCount: result.totalResearchReports,
					},
					'CRON'
				);
			} else {
				throw new Error(result.error || 'Weekly research failed');
			}
		} catch (error) {
			console.error('❌ Weekly research failed:', error);
			await logger.error(
				'Scheduled weekly research failed',
				{
					error: error instanceof Error ? error.message : String(error),
				},
				'CRON'
			);
		}
	});

	// Weekly report generation
	cron.schedule(reportSchedule, async () => {
		console.log('\n📊 Scheduled weekly report generation starting...');

		try {
			await logger.info(
				'Starting scheduled report generation',
				undefined,
				'CRON'
			);

			const result = await generatePerformanceChart({
				includeDataExport: true,
				sendNotification: true,
				customFilename: `weekly_report_${
					new Date().toISOString().split('T')[0]
				}`,
			});

			if (result.success) {
				console.log('✅ Weekly report generated successfully');
				await logger.info(
					'Scheduled report generation completed',
					{
						duration: result.duration,
						outputPath: result.outputPath,
					},
					'CRON'
				);
			} else {
				throw new Error(result.error || 'Report generation failed');
			}
		} catch (error) {
			console.error('❌ Report generation failed:', error);
			await logger.error(
				'Scheduled report generation failed',
				{
					error: error instanceof Error ? error.message : String(error),
				},
				'CRON'
			);
		}
	});

	// Health check every 6 hours
	cron.schedule('0 */6 * * *', async () => {
		console.log('\n🏥 Scheduled health check starting...');

		try {
			const healthResult = await healthCheck.runHealthCheck();

			if (healthResult.overall === 'error') {
				await notifications.sendAlert(
					'System Health Alert',
					'Critical system issues detected during scheduled health check.',
					'error'
				);
			}
		} catch (error) {
			console.error('❌ Scheduled health check failed:', error);
		}
	});

	console.log('✅ Automated trading bot is running...');
	console.log('📊 Monitoring schedule:');
	console.log('   - Daily operations: After market close (Mon-Fri)');
	console.log('   - Weekly research: Sunday afternoon');
	console.log('   - Weekly reports: Sunday evening');
	console.log('   - Health checks: Every 6 hours');
	console.log('\nPress Ctrl+C to stop the bot');

	// Send startup notification
	await notifications.sendAlert(
		'Trading Bot Started',
		`Automated trading bot is now running with the following schedule:\n\n📅 Daily: ${dailySchedule}\n📚 Research: ${weeklySchedule}\n📊 Reports: ${reportSchedule}`,
		'success'
	);
}

/**
 * Main application entry point
 */
async function main(): Promise<void> {
	let bot: TradingBot | undefined;

	try {
		const command = process.argv[2];

		// Handle commands that don't require full bot initialization
		switch (command) {
			case 'help':
			case '--help':
			case '-h':
				showHelp();
				return;

			case 'health-check':
				console.log('🏥 Running system health check...');
				await healthCheck.displayHealthStatus();
				return;

			case 'test-notifications':
				console.log('📱 Testing notification delivery...');
				const testResult = await notifications.testNotifications();

				if (testResult.telegram) {
					console.log('✅ Telegram notifications working');
				} else {
					console.log('❌ Telegram notifications failed');
					console.log('Errors:', testResult.errors);
				}
				return;
		}

		// Commands that require bot initialization
		bot = await initializeApplication();

		switch (command) {
			case 'daily':
				console.log('📊 Running daily portfolio update...');
				const dailyResult = await executeDailyUpdate({
					saveSummary: true,
					sendNotification: true,
				});

				if (!dailyResult.success) {
					throw new Error(dailyResult.error || 'Daily update failed');
				}
				break;

			case 'ai-analysis':
				console.log('🧠 Running AI portfolio analysis...');
				await bot.runAIAnalysis();
				break;

			case 'full-analysis':
				console.log('🚀 Running complete AI analysis workflow...');
				const analysisService = new AIAnalysisService();
				const analysisResult = await analysisService.runFullAnalysis();

				if (!analysisResult.success) {
					throw new Error(analysisResult.error || 'Full analysis failed');
				}
				break;

			case 'analysis-only':
				console.log('🤖 Running AI analysis only...');
				const aiService = new AIAnalysisService();
				await aiService.runAIAnalysisOnly();
				break;

			case 'update-only':
				console.log('📊 Running portfolio update only...');
				const updateService = new AIAnalysisService();
				await updateService.updatePortfolioOnly();
				break;

			case 'report':
			case 'generate-chart':
				console.log('📈 Generating performance report...');
				const reportResult = await generatePerformanceChart({
					includeDataExport: true,
					sendNotification: true,
					openInBrowser: process.env.NODE_ENV === 'development',
				});

				if (!reportResult.success) {
					throw new Error(reportResult.error || 'Report generation failed');
				}
				break;

			case 'research':
				console.log('🔍 Running weekly deep research...');
				const researchResult = await executeWeeklyResearch({
					saveReport: true,
					sendNotification: true,
					includeScreening: true,
				});

				if (!researchResult.success) {
					throw new Error(researchResult.error || 'Research failed');
				}
				break;

			case 'emergency-stop':
				console.log('🚨 Executing emergency stop...');
				const stopResult = await executeEmergencyStop({
					force: process.env.FORCE_STOP === 'true',
					reason: process.env.STOP_REASON,
				});

				if (!stopResult.success) {
					throw new Error(stopResult.error || 'Emergency stop failed');
				}
				break;

			case 'portfolio-status':
				console.log('📊 Displaying portfolio status...');
				const portfolioManager = bot.getPortfolioManager();
				await portfolioManager.displayPortfolioStatus();
				break;

			case 'screen-microcaps':
				console.log('🔎 Screening micro-cap opportunities...');
				// This would use the market data service to screen for opportunities
				console.log('Feature coming soon...');
				break;

			case 'auto':
			case 'cron-daily':
			case 'cron-weekly':
				await runAutomatedMode(bot);
				// Keep the process alive
				await new Promise(() => {}); // Run indefinitely
				break;

			case 'ping-alpaca':
				console.log('🔌 Testing Alpaca API connection...');

				try {
					const alpacaService = new AlpacaService();
					const account = await alpacaService.getAccount();
					console.log(`✅ Alpaca connected successfully!`);
					console.log(`   Account ID: ${account.id}`);
					console.log(
						`   Buying Power: $${parseFloat(
							account.buyingPower
						).toLocaleString()}`
					);
					console.log(`   Cash: $${parseFloat(account.cash).toLocaleString()}`);
				} catch (error) {
					console.error(
						'❌ Alpaca connection failed:',
						error instanceof Error ? error.message : error
					);
					process.exit(1);
				}
				return;

			case 'ping-openai':
				console.log('🤖 Testing OpenAI API configuration...');
				try {
					const gptService = new ChatGPTService();
					console.log('✅ OpenAI service configured successfully!');
					console.log('   API key found and service initialized');
					console.log('   Ready for AI analysis and recommendations');
				} catch (error) {
					console.error(
						'❌ OpenAI configuration failed:',
						error instanceof Error ? error.message : error
					);
					process.exit(1);
				}
				return;

			case 'ping-yahoo':
				console.log('📊 Testing Yahoo Finance API connection...');
				try {
					const marketService = new MarketDataService();
					const testData = await marketService.getMarketData(['AAPL']);

					if (testData && testData.length > 0 && testData[0].price > 0) {
						console.log('✅ Yahoo Finance connected successfully!');
						console.log(`   Test Symbol: AAPL`);
						console.log(`   Current Price: $${testData[0].price.toFixed(2)}`);
						console.log(
							`   Change: ${
								testData[0].percentChange >= 0 ? '+' : ''
							}${testData[0].percentChange.toFixed(2)}%`
						);
						console.log(`   Volume: ${testData[0].volume.toLocaleString()}`);
					} else {
						throw new Error('Invalid response data');
					}
				} catch (error) {
					console.error(
						'❌ Yahoo Finance connection failed:',
						error instanceof Error ? error.message : error
					);
					process.exit(1);
				}
				return;

			case 'validate-env':
				console.log('🔧 Validating environment variables...');

				const requiredVars = [
					'ALPACA_API_KEY',
					'ALPACA_SECRET_KEY',
					'OPENAI_API_KEY',
				];
				const optionalVars = ['TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID'];

				const missingRequired = requiredVars.filter((key) => !process.env[key]);
				const missingOptional = optionalVars.filter((key) => !process.env[key]);

				console.log('\n📋 Required Environment Variables:');
				requiredVars.forEach((key) => {
					const value = process.env[key];
					if (value) {
						console.log(`✅ ${key}: Set (${value.substring(0, 10)}...)`);
					} else {
						console.log(`❌ ${key}: Missing`);
					}
				});

				console.log('\n📋 Optional Environment Variables:');
				optionalVars.forEach((key) => {
					const value = process.env[key];
					if (value) {
						console.log(`✅ ${key}: Set (${value.substring(0, 10)}...)`);
					} else {
						console.log(`⚠️  ${key}: Not set (notifications disabled)`);
					}
				});

				console.log('\n📋 Trading Configuration:');
				const tradingEnabled = process.env.ENABLE_AUTOMATED_TRADING === 'true';
				console.log(
					`${tradingEnabled ? '🔴' : '🟡'} ENABLE_AUTOMATED_TRADING: ${
						tradingEnabled ? 'LIVE TRADING' : 'SIMULATION MODE'
					}`
				);

				if (missingRequired.length > 0) {
					console.log(
						`\n❌ Missing required environment variables: ${missingRequired.join(
							', '
						)}`
					);
					console.log('💡 Please set these variables in your .env file');
					process.exit(1);
				} else {
					console.log('\n✅ All required environment variables are configured');
					if (missingOptional.length > 0) {
						console.log(
							`⚠️  Optional features disabled due to missing: ${missingOptional.join(
								', '
							)}`
						);
					}
				}
				return;

			case undefined:
			default:
				showHelp();
				break;
		}

		console.log('\n✅ Operation completed successfully');
	} catch (error) {
		console.error('\n❌ Application error:', error);

		await logger.error(
			'Application error',
			{
				error: error instanceof Error ? error.message : String(error),
				command: process.argv[2],
			},
			'MAIN'
		);

		// Send error notification for critical failures
		if (process.argv[2] !== 'help') {
			try {
				await notifications.sendAlert(
					'Trading Bot Error',
					`Application error in command "${process.argv[2]}": ${error}`,
					'error'
				);
			} catch (notificationError) {
				console.error(
					'Also failed to send error notification:',
					notificationError
				);
			}
		}

		process.exit(1);
	}
}

/**
 * Handle graceful shutdown
 */
function setupGracefulShutdown(): void {
	const shutdown = async (signal: string) => {
		console.log(
			`\n⚠️ Received ${signal}, shutting down trading bot gracefully...`
		);

		await logger.warn(`Shutdown initiated by ${signal}`, undefined, 'MAIN');

		try {
			// Send shutdown notification
			await notifications.sendAlert(
				'Trading Bot Shutdown',
				`Trading bot is shutting down due to ${signal} signal.`,
				'warning'
			);
		} catch (error) {
			console.warn('Failed to send shutdown notification:', error);
		}

		console.log('👋 Trading bot shutdown complete');
		process.exit(0);
	};

	process.on('SIGINT', () => shutdown('SIGINT'));
	process.on('SIGTERM', () => shutdown('SIGTERM'));

	// Handle uncaught exceptions
	process.on('uncaughtException', async (error) => {
		console.error('❌ Uncaught Exception:', error);
		await logger.error(
			'Uncaught exception',
			{
				error: error.message,
				stack: error.stack,
			},
			'MAIN'
		);

		try {
			await notifications.sendAlert(
				'Critical Error',
				`Uncaught exception in trading bot: ${error.message}`,
				'error'
			);
		} catch (notificationError) {
			console.error('Failed to send critical error notification');
		}

		process.exit(1);
	});

	// Handle unhandled promise rejections
	process.on('unhandledRejection', async (reason, promise) => {
		console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
		await logger.error(
			'Unhandled promise rejection',
			{
				reason: String(reason),
			},
			'MAIN'
		);

		try {
			await notifications.sendAlert(
				'Critical Error',
				`Unhandled promise rejection in trading bot: ${reason}`,
				'error'
			);
		} catch (notificationError) {
			console.error('Failed to send critical error notification');
		}
	});
}

setupGracefulShutdown();

// Main execution
if (require.main === module) {
	main().catch((error) => {
		console.error('❌ Fatal error:', error);
		process.exit(1);
	});
}
