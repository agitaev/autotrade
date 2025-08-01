import axios, { AxiosResponse } from 'axios';
import {
	TelegramConfig,
	NotificationLevel,
	TradeType,
	NotificationResult,
	TradeDetails,
	HealthAlert,
	PortfolioSummary,
} from './types';

/**
 * Telegram notification service for trading bot alerts and reports
 *
 * Provides Telegram bot integration for receiving real-time trading notifications,
 * portfolio summaries, and system alerts directly in your Telegram chat.
 *
 * Features:
 * - Real-time Telegram notifications with rich formatting
 * - Daily portfolio summaries and performance reports
 * - Trade execution alerts with detailed information
 * - System health and error notifications
 * - Markdown formatting with emojis for better readability
 * - Message retry logic and delivery confirmation
 * - Silent notifications for non-critical updates
 *
 * Setup Instructions:
 * 1. Create a Telegram bot via @BotFather
 * 2. Get your bot token from @BotFather
 * 3. Get your chat ID by messaging @userinfobot or your bot
 * 4. Set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID environment variables
 *
 * @example
 * ```typescript
 * // Environment variables required:
 * // TELEGRAM_BOT_TOKEN=123456789:ABCdefGHIjklMNOpqrsTUVwxyz
 * // TELEGRAM_CHAT_ID=123456789
 *
 * const notifications = new NotificationService();
 *
 * // Send trade alert
 * await notifications.sendTradeAlert({
 *   type: 'BUY',
 *   ticker: 'AAPL',
 *   shares: 10,
 *   price: 150.25,
 *   totalValue: 1502.50,
 *   reason: 'AI recommendation - bullish signal'
 * });
 *
 * // Send daily summary
 * await notifications.sendDailySummary({
 *   totalEquity: 12500,
 *   dayChange: 125.50,
 *   dayChangePercent: 1.02,
 *   positions: 5,
 *   trades: 3
 * });
 * ```
 */
export class NotificationService {
	private readonly telegramConfig?: TelegramConfig;

	// Configuration constants
	private readonly RETRY_ATTEMPTS = 3;
	private readonly RETRY_DELAY_MS = 1000;
	private readonly TELEGRAM_TIMEOUT_MS = 5000;
	private readonly TELEGRAM_API_URL = 'https://api.telegram.org/bot';

	// Message formatting
	private readonly LEVEL_EMOJIS: Record<NotificationLevel, string> = {
		info: '📊',
		warning: '⚠️',
		error: '🚨',
		success: '✅',
	};

	private readonly TRADE_EMOJIS: Record<TradeType, string> = {
		BUY: '🟢',
		SELL: '🔴',
	};

	/**
	 * Initialize notification service with Telegram configuration
	 *
	 * Automatically configures Telegram bot based on environment variables.
	 *
	 * Required environment variables:
	 * - TELEGRAM_BOT_TOKEN: Your bot token from @BotFather
	 * - TELEGRAM_CHAT_ID: Your chat ID (can be personal chat or group)
	 */
	constructor() {
		if (process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID) {
			this.telegramConfig = {
				botToken: process.env.TELEGRAM_BOT_TOKEN,
				chatId: process.env.TELEGRAM_CHAT_ID,
			};
		}
	}

	/**
	 * Send a general alert with specified severity level
	 *
	 * Sends formatted notification to Telegram with appropriate emoji and formatting.
	 * Critical messages (error/warning) are sent with notification sound enabled.
	 *
	 * @param title - Alert title/subject
	 * @param message - Detailed alert message
	 * @param level - Severity level (info, warning, error, success)
	 * @param silent - Whether to send as silent notification (default: false for errors/warnings)
	 * @returns Promise resolving to notification delivery status
	 *
	 * @example
	 * ```typescript
	 * await notifications.sendAlert(
	 *   'Market Status',
	 *   'Trading session has ended for today',
	 *   'info',
	 *   true  // silent notification
	 * );
	 *
	 * await notifications.sendAlert(
	 *   'API Error',
	 *   'Failed to connect to Alpaca API after 3 retries',
	 *   'error'
	 * );
	 * ```
	 */
	async sendAlert(
		title: string,
		message: string,
		level: NotificationLevel = 'info',
		silent?: boolean
	): Promise<NotificationResult> {
		const emoji = this.LEVEL_EMOJIS[level];

		// Format message with Telegram markdown
		const formattedMessage = this._formatTelegramMessage(emoji, title, message);

		const result: NotificationResult = {
			telegram: false,
			errors: [],
		};

		// Send Telegram notification
		if (this.telegramConfig) {
			try {
				// Auto-determine silent mode: errors and warnings are not silent by default
				const shouldBeSilent = silent ?? !['error', 'warning'].includes(level);

				await this._sendTelegram(formattedMessage, shouldBeSilent);
				result.telegram = true;
				console.log(`✅ Telegram notification sent: ${title}`);
			} catch (error) {
				const errorMsg = `Telegram failed: ${error}`;
				result.errors.push(errorMsg);
				console.error(`❌ ${errorMsg}`);
			}
		} else {
			result.errors.push('Telegram not configured');
		}

		return result;
	}

	/**
	 * Send comprehensive daily portfolio summary
	 *
	 * Generates and sends a formatted daily report to Telegram including portfolio
	 * performance, position counts, trading activity, and key metrics.
	 *
	 * @param summary - Portfolio summary data
	 * @returns Promise resolving to notification delivery status
	 *
	 * @example
	 * ```typescript
	 * await notifications.sendDailySummary({
	 *   totalEquity: 12500.75,
	 *   dayChange: 125.50,
	 *   dayChangePercent: 1.02,
	 *   positions: 5,
	 *   trades: 3,
	 *   topPerformer: 'AAPL (+2.5%)',
	 *   worstPerformer: 'MSFT (-1.2%)'
	 * });
	 * ```
	 */
	async sendDailySummary(
		summary: PortfolioSummary
	): Promise<NotificationResult> {
		const changeEmoji = summary.dayChange >= 0 ? '📈' : '📉';
		const changeSign = summary.dayChange >= 0 ? '+' : '';

		const dateStr = new Date().toLocaleDateString('en-US', {
			weekday: 'long',
			year: 'numeric',
			month: 'long',
			day: 'numeric',
		});

		let message = `*📊 Daily Portfolio Summary*\n_${dateStr}_\n\n`;
		message += `💰 *Total Equity:* $${summary.totalEquity.toLocaleString()}\n`;
		message += `${changeEmoji} *Day Change:* ${changeSign}$${Math.abs(
			summary.dayChange
		).toFixed(2)} (${changeSign}${summary.dayChangePercent.toFixed(2)}%)\n`;
		message += `📊 *Active Positions:* ${summary.positions}\n`;
		message += `🔄 *Trades Today:* ${summary.trades}`;

		// Add performance details if available
		if (summary.topPerformer || summary.worstPerformer) {
			message += '\n\n*📈 Performance Highlights:*';
			if (summary.topPerformer) {
				message += `\n🏆 Top Performer: ${summary.topPerformer}`;
			}
			if (summary.worstPerformer) {
				message += `\n📉 Needs Attention: ${summary.worstPerformer}`;
			}
		}

		// Determine notification level based on performance
		const performanceLevel: NotificationLevel =
			summary.dayChangePercent >= 2
				? 'success'
				: summary.dayChangePercent >= 0
				? 'info'
				: summary.dayChangePercent >= -2
				? 'warning'
				: 'error';

		return this._sendFormattedMessage(message, performanceLevel, true); // Silent for daily summaries
	}

	/**
	 * Send real-time trade execution alert
	 *
	 * Notifies about completed trade executions with detailed information
	 * including trade type, symbol, quantity, price, and reasoning.
	 *
	 * @param tradeDetails - Complete trade execution details
	 * @returns Promise resolving to notification delivery status
	 *
	 * @example
	 * ```typescript
	 * await notifications.sendTradeAlert({
	 *   type: 'BUY',
	 *   ticker: 'AAPL',
	 *   shares: 10,
	 *   price: 150.25,
	 *   totalValue: 1502.50,
	 *   reason: 'AI recommendation - bullish signal detected',
	 *   stopLoss: 145.00
	 * });
	 * ```
	 */
	async sendTradeAlert(
		tradeDetails: TradeDetails
	): Promise<NotificationResult> {
		const emoji = this.TRADE_EMOJIS[tradeDetails.type];
		const totalValue =
			tradeDetails.totalValue || tradeDetails.shares * tradeDetails.price;
		const timestamp = tradeDetails.timestamp || new Date();

		let message = `*🔄 Trade Executed*\n\n`;
		message += `${emoji} *${tradeDetails.type}:* ${tradeDetails.shares} shares of *${tradeDetails.ticker}*\n`;
		message += `💵 *Price:* $${tradeDetails.price.toFixed(2)}\n`;
		message += `💰 *Total Value:* $${totalValue.toLocaleString()}\n`;
		message += `📝 *Reason:* ${tradeDetails.reason}`;

		// Add stop-loss information for buy orders
		if (tradeDetails.type === 'BUY' && tradeDetails.stopLoss) {
			message += `\n🛡️ *Stop Loss:* $${tradeDetails.stopLoss.toFixed(2)}`;
		}

		message += `\n⏰ *Executed:* ${timestamp.toLocaleTimeString()}`;

		return this._sendFormattedMessage(message, 'info', false); // Not silent for trades
	}

	/**
	 * Send system health status alert
	 *
	 * Notifies about system health changes, service outages, or recovery events.
	 *
	 * @param healthData - Health check results
	 * @returns Promise resolving to notification delivery status
	 *
	 * @example
	 * ```typescript
	 * await notifications.sendHealthAlert({
	 *   service: 'Alpaca API',
	 *   status: 'error',
	 *   message: 'Connection timeout after 3 retry attempts',
	 *   timestamp: new Date()
	 * });
	 * ```
	 */
	async sendHealthAlert(healthData: HealthAlert): Promise<NotificationResult> {
		const statusEmoji = {
			healthy: '✅',
			warning: '⚠️',
			error: '🚨',
		};

		const level: NotificationLevel =
			healthData.status === 'healthy' ? 'success' : healthData.status;

		let message = `*${statusEmoji[healthData.status]} System Health Alert*\n\n`;
		message += `🔧 *Service:* ${healthData.service}\n`;
		message += `📊 *Status:* ${healthData.status.toUpperCase()}\n`;
		message += `📝 *Details:* ${healthData.message}\n`;
		message += `⏰ *Detected:* ${healthData.timestamp.toLocaleString()}`;

		return this._sendFormattedMessage(message, level, false); // Not silent for health alerts
	}

	/**
	 * Send weekly performance report
	 *
	 * @param weeklyData - Weekly performance summary
	 * @returns Promise resolving to notification delivery status
	 */
	async sendWeeklyReport(weeklyData: {
		totalReturn: number;
		totalReturnPercent: number;
		totalTrades: number;
		winRate: number;
		bestTrade: string;
		worstTrade: string;
		startEquity: number;
		endEquity: number;
	}): Promise<NotificationResult> {
		const returnEmoji = weeklyData.totalReturn >= 0 ? '📈' : '📉';
		const returnSign = weeklyData.totalReturn >= 0 ? '+' : '';

		let message = `*📊 Weekly Performance Report*\n`;
		message += `_Week ending ${new Date().toLocaleDateString()}_\n\n`;
		message += `💰 *Starting Equity:* $${weeklyData.startEquity.toLocaleString()}\n`;
		message += `💰 *Ending Equity:* $${weeklyData.endEquity.toLocaleString()}\n`;
		message += `${returnEmoji} *Total Return:* ${returnSign}$${Math.abs(
			weeklyData.totalReturn
		).toFixed(2)} (${returnSign}${weeklyData.totalReturnPercent.toFixed(
			2
		)}%)\n\n`;
		message += `*📊 Trading Statistics:*\n`;
		message += `🔄 Total Trades: ${weeklyData.totalTrades}\n`;
		message += `🎯 Win Rate: ${(weeklyData.winRate * 100).toFixed(1)}%\n`;
		message += `🏆 Best Trade: ${weeklyData.bestTrade}\n`;
		message += `📉 Worst Trade: ${weeklyData.worstTrade}`;

		const level: NotificationLevel =
			weeklyData.totalReturnPercent >= 5
				? 'success'
				: weeklyData.totalReturnPercent >= 0
				? 'info'
				: 'warning';

		return this._sendFormattedMessage(message, level, true); // Silent for weekly reports
	}

	/**
	 * Test Telegram notification delivery
	 *
	 * @returns Promise resolving to test results
	 */
	async testNotifications(): Promise<NotificationResult> {
		const message = `*🤖 Test Notification*\n\n`;
		const testMessage =
			message +
			`This is a test message to verify Telegram delivery is working correctly.\n\n`;
		const timeMessage =
			testMessage + `⏰ *Sent at:* ${new Date().toLocaleString()}`;

		return this._sendFormattedMessage(timeMessage, 'info', false);
	}

	/**
	 * Get notification service configuration status
	 *
	 * @returns Configuration status information
	 */
	getStatus(): {
		telegramConfigured: boolean;
		botToken: string;
		chatId: string;
	} {
		return {
			telegramConfigured: !!this.telegramConfig,
			botToken: this.telegramConfig?.botToken
				? `${this.telegramConfig.botToken.substring(0, 10)}...`
				: 'Not configured',
			chatId: this.telegramConfig?.chatId || 'Not configured',
		};
	}

	/**
	 * Send formatted message via Telegram
	 *
	 * @private
	 * @param message - Pre-formatted Telegram message
	 * @param level - Notification level
	 * @param silent - Whether to send silently
	 */
	private async _sendFormattedMessage(
		message: string,
		level: NotificationLevel,
		silent: boolean
	): Promise<NotificationResult> {
		const result: NotificationResult = {
			telegram: false,
			errors: [],
		};

		if (this.telegramConfig) {
			try {
				await this._sendTelegram(message, silent);
				result.telegram = true;
				console.log(`✅ Telegram notification sent (${level})`);
			} catch (error) {
				const errorMsg = `Telegram failed: ${error}`;
				result.errors.push(errorMsg);
				console.error(`❌ ${errorMsg}`);
			}
		} else {
			result.errors.push('Telegram not configured');
		}

		return result;
	}

	/**
	 * Send message to Telegram with retry logic
	 *
	 * @private
	 * @param message - Message text (supports Markdown)
	 * @param silent - Whether to send as silent notification
	 */
	private async _sendTelegram(
		message: string,
		silent: boolean = false
	): Promise<void> {
		if (!this.telegramConfig) {
			throw new Error('Telegram not configured');
		}

		const url = `${this.TELEGRAM_API_URL}${this.telegramConfig.botToken}/sendMessage`;
		const payload = {
			chat_id: this.telegramConfig.chatId,
			text: message,
			parse_mode: 'Markdown',
			disable_notification: silent,
		};

		for (let attempt = 1; attempt <= this.RETRY_ATTEMPTS; attempt++) {
			try {
				const response: AxiosResponse = await axios.post(url, payload, {
					timeout: this.TELEGRAM_TIMEOUT_MS,
					headers: {
						'Content-Type': 'application/json',
					},
				});

				if (response.data.ok) {
					return; // Success
				}

				throw new Error(
					`Telegram API error: ${response.data.description || 'Unknown error'}`
				);
			} catch (error) {
				if (attempt === this.RETRY_ATTEMPTS) {
					throw error; // Final attempt failed
				}

				console.warn(`⚠️  Telegram attempt ${attempt} failed, retrying...`);
				await new Promise((resolve) =>
					setTimeout(resolve, this.RETRY_DELAY_MS * attempt)
				);
			}
		}
	}

	/**
	 * Format message for Telegram with title and content
	 *
	 * @private
	 * @param emoji - Level emoji
	 * @param title - Message title
	 * @param content - Message content
	 * @returns Formatted Telegram message
	 */
	private _formatTelegramMessage(
		emoji: string,
		title: string,
		content: string
	): string {
		return `${emoji} *${title}*\n\n${content}\n\n_${new Date().toLocaleString()}_`;
	}

	/**
	 * Log configuration status on initialization
	 *
	 * @private
	 */
	private _logConfigurationStatus(): void {
		const status = this.getStatus();
		console.log('📱 Telegram Notification Service initialized:');

		if (status.telegramConfigured) {
			console.log(`   ✅ Bot Token: ${status.botToken}`);
			console.log(`   ✅ Chat ID: ${status.chatId}`);
		} else {
			console.log('   ❌ Telegram not configured');
			console.log(
				'   💡 Set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID environment variables'
			);
		}
	}
}
