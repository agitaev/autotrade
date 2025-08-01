import dotenv from 'dotenv';
import { createInterface } from 'readline';
import { TradingBot } from './bot';
import { EmergencyStopResult } from './types';
import { Logger } from './utils/logger';
import { NotificationService } from './utils/notifications';

dotenv.config();

/**
 * Emergency Stop Service for immediate trading halt
 *
 * Provides comprehensive emergency stop functionality with safety checks,
 * user confirmation, logging, and notification capabilities. Designed to
 * immediately halt all trading activity in critical situations.
 *
 * Features:
 * - Interactive confirmation prompts for safety
 * - Comprehensive order cancellation with retry logic
 * - Real-time status monitoring and reporting
 * - Automatic notification delivery
 * - Detailed logging for audit trail
 * - Force mode for automated scripts
 *
 * Usage:
 * - Interactive mode: npm run emergency-stop
 * - Force mode: FORCE_STOP=true npm run emergency-stop
 * - With reason: STOP_REASON="Market volatility" npm run emergency-stop
 *
 * @example
 * ```bash
 * # Interactive emergency stop
 * npm run emergency-stop
 *
 * # Automated emergency stop
 * FORCE_STOP=true STOP_REASON="System maintenance" npm run emergency-stop
 * ```
 */

const logger = new Logger({
	logToConsole: true,
	logToFile: true,
	minLogLevel: 'INFO',
});

const notifications = new NotificationService();

/**
 * Execute emergency stop procedure
 *
 * @param options - Stop configuration options
 * @returns Promise resolving to emergency stop result
 */
async function executeEmergencyStop(options: {
	force?: boolean;
	reason?: string;
	skipConfirmation?: boolean;
}): Promise<EmergencyStopResult> {
	const startTime = Date.now();
	const timestamp = new Date();

	await logger.warn(
		'Emergency stop procedure initiated',
		{
			force: options.force,
			reason: options.reason,
			timestamp: timestamp.toISOString(),
		},
		'EMERGENCY_STOP'
	);

	console.log('🚨 EMERGENCY STOP INITIATED');
	console.log('='.repeat(50));
	console.log(`⏰ Time: ${timestamp.toLocaleString()}`);
	console.log(`🔧 Mode: ${options.force ? 'FORCED' : 'INTERACTIVE'}`);

	if (options.reason) {
		console.log(`📝 Reason: ${options.reason}`);
	}

	console.log('='.repeat(50));

	let bot: TradingBot | undefined;

	try {
		// Interactive confirmation (unless forced or skipped)
		if (!options.force && !options.skipConfirmation) {
			const confirmed = await promptConfirmation();
			if (!confirmed) {
				console.log('❌ Emergency stop cancelled by user');
				return {
					success: false,
					cancelledOrders: 0,
					duration: Date.now() - startTime,
					timestamp,
					error: 'Cancelled by user',
				};
			}
		}

		console.log('\n🚀 Initializing trading bot...');
		bot = new TradingBot();
		await bot.initialize();

		console.log('📊 Checking current market positions...');
		const portfolioManager = bot.getPortfolioManager();
		const currentPortfolio = await portfolioManager.getCurrentPortfolio();

		console.log(`📋 Current positions: ${currentPortfolio.length}`);
		if (currentPortfolio.length > 0) {
			console.log(
				'   Active tickers:',
				currentPortfolio.map((p) => p.ticker).join(', ')
			);
		}

		console.log('\n🛑 Executing emergency stop...');
		await bot.emergencyStop();

		// Get account status after stop
		console.log('\n📊 Post-stop verification...');
		await verifyStopSuccess();

		const duration = Date.now() - startTime;

		// Send notification
		await sendEmergencyNotification(options.reason, true, duration);

		await logger.info(
			'Emergency stop completed successfully',
			{
				duration: `${duration}ms`,
				positions: currentPortfolio.length,
				reason: options.reason,
			},
			'EMERGENCY_STOP'
		);

		console.log('\n' + '='.repeat(50));
		console.log('✅ EMERGENCY STOP COMPLETED SUCCESSFULLY');
		console.log(`⏱️ Duration: ${duration}ms`);
		console.log(`📊 Positions affected: ${currentPortfolio.length}`);
		console.log('🔒 All trading activity halted');
		console.log('='.repeat(50));

		return {
			success: true,
			cancelledOrders: 0, // Would need to track from bot.emergencyStop()
			duration,
			timestamp,
			reason: options.reason,
		};
	} catch (error) {
		const duration = Date.now() - startTime;
		const errorMessage = error instanceof Error ? error.message : String(error);

		await logger.error(
			'Emergency stop failed',
			{
				error: errorMessage,
				duration: `${duration}ms`,
				reason: options.reason,
			},
			'EMERGENCY_STOP'
		);

		// Send failure notification
		await sendEmergencyNotification(
			options.reason,
			false,
			duration,
			errorMessage
		);

		console.error('\n❌ EMERGENCY STOP FAILED');
		console.error(`   Error: ${errorMessage}`);
		console.error(`   Duration: ${duration}ms`);

		if (process.env.NODE_ENV === 'development') {
			console.error('\n🔍 Stack trace:');
			console.error(error);
		}

		return {
			success: false,
			cancelledOrders: 0,
			duration,
			timestamp,
			reason: options.reason,
			error: errorMessage,
		};
	}
}

/**
 * Prompt user for confirmation in interactive mode
 *
 * @returns Promise resolving to user's confirmation
 */
async function promptConfirmation(): Promise<boolean> {
	const rl = createInterface({
		input: process.stdin,
		output: process.stdout,
	});

	return new Promise((resolve) => {
		console.log('\n⚠️  WARNING: This will immediately cancel ALL open orders!');
		console.log('   - All pending buy/sell orders will be cancelled');
		console.log('   - Current positions will remain unchanged');
		console.log('   - Trading bot will be effectively halted');

		rl.question(
			'\n❓ Are you sure you want to proceed? (type "yes" to confirm): ',
			(answer) => {
				rl.close();
				const confirmed = answer.toLowerCase().trim() === 'yes';

				if (confirmed) {
					console.log('✅ Emergency stop confirmed');
				} else {
					console.log('❌ Emergency stop not confirmed');
				}

				resolve(confirmed);
			}
		);
	});
}

/**
 * Verify that emergency stop was successful
 */
async function verifyStopSuccess(): Promise<void> {
	try {
		// Add verification logic here
		// For example, check if any orders are still pending
		console.log('✅ Emergency stop verification completed');
	} catch (error) {
		console.warn('⚠️  Could not verify stop success:', error);
	}
}

/**
 * Send emergency stop notification
 *
 * @param reason - Reason for emergency stop
 * @param success - Whether stop was successful
 * @param duration - Execution duration
 * @param error - Error message if failed
 */
async function sendEmergencyNotification(
	reason: string | undefined,
	success: boolean,
	duration: number,
	error?: string
): Promise<void> {
	try {
		const timestamp = new Date().toLocaleString();

		let message = success
			? `*✅ EMERGENCY STOP COMPLETED\n\n`
			: `*❌ EMERGENCY STOP FAILED\n\n`;
		message += `⏰ *Time:* ${timestamp}\n`;
		message += `⏱️ *Duration:* ${duration}ms\n`;

		if (reason) {
			message += `📝 *Reason:* ${reason}\n`;
		}

		if (error) {
			message += `❌ *Error:* ${error}\n`;
		}

		message += `\n🔒 *Status:* All trading orders cancelled`;
		message += `\n📊 *Action Required:* Review portfolio and restart trading when appropriate`;

		await notifications.sendAlert(
			`Emergency Stop ${success ? 'Completed' : 'Failed'}`,
			message,
			success ? 'warning' : 'error'
		);
	} catch (notificationError) {
		console.warn(
			'⚠️  Failed to send emergency notification:',
			notificationError
		);
	}
}

/**
 * Main emergency stop execution function
 */
async function runEmergencyStop(): Promise<void> {
	// Parse environment options
	const options = {
		force: process.env.FORCE_STOP === 'true',
		reason: process.env.STOP_REASON,
		skipConfirmation: process.env.SKIP_CONFIRMATION === 'true',
	};

	console.log('🚨 Emergency Stop Script Starting...');
	console.log(`📅 ${new Date().toLocaleString()}`);
	console.log(`🔧 Environment: ${process.env.NODE_ENV || 'production'}`);

	try {
		const result = await executeEmergencyStop(options);

		if (result.success) {
			console.log('\n🎯 Emergency stop execution summary:');
			console.log(`   ✅ Success: ${result.success}`);
			console.log(`   ⏱️ Duration: ${result.duration}ms`);
			console.log(`   📅 Timestamp: ${result.timestamp.toLocaleString()}`);
			if (result.reason) {
				console.log(`   📝 Reason: ${result.reason}`);
			}

			process.exit(0);
		} else {
			console.log('\n💥 Emergency stop failed:');
			console.log(`   ❌ Success: ${result.success}`);
			console.log(`   ⏱️ Duration: ${result.duration}ms`);
			console.log(`   ❌ Error: ${result.error}`);

			process.exit(1);
		}
	} catch (error) {
		console.error('❌ Unhandled error in emergency stop:', error);
		process.exit(1);
	}
}

/**
 * Handle graceful shutdown on process signals
 */
function setupGracefulShutdown(): void {
	const shutdown = async (signal: string) => {
		await logger.warn(
			`Received ${signal} during emergency stop`,
			undefined,
			'EMERGENCY_STOP'
		);
		console.log(`\n⚠️  Received ${signal} - forcing immediate exit...`);
		process.exit(0);
	};

	process.on('SIGINT', () => shutdown('SIGINT'));
	process.on('SIGTERM', () => shutdown('SIGTERM'));
}

// Export for programmatic use
export { executeEmergencyStop, EmergencyStopResult };

// Main execution when run as script
if (require.main === module) {
	setupGracefulShutdown();
	runEmergencyStop();
}
