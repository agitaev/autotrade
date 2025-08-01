import { AlpacaService } from '../services/alpaca';
import { MarketDataService } from '../services/yahoo';
import {
	HealthCheckResponse,
	HealthCheckResult,
	HealthStatus,
	CheckStatus,
} from './types';

/**
 * Comprehensive health check service for trading bot infrastructure
 *
 * Monitors and validates the health of all critical trading bot services including:
 * - Alpaca API connectivity and account access
 * - Market data service functionality (Yahoo Finance)
 * - Environment variable configuration
 * - Market hours and trading status
 * - File system permissions and data directory access
 * - Network connectivity and API response times
 *
 * Provides both programmatic health status and formatted console output
 * for monitoring and debugging purposes.
 *
 * @example
 * ```typescript
 * const healthCheck = new HealthCheckService();
 *
 * // Programmatic health check
 * const result = await healthCheck.runHealthCheck();
 * if (result.overall === 'error') {
 *   console.log('Critical services are down!');
 * }
 *
 * // Display formatted health status
 * await healthCheck.displayHealthStatus();
 * ```
 */
export class HealthCheckService {
	private readonly alpaca: AlpacaService;
	private readonly marketData: MarketDataService;

	// Health check configuration
	private readonly HEALTH_CHECK_TIMEOUT = 10000; // 10 seconds
	private readonly REQUIRED_ENV_VARS = [
		'ALPACA_API_KEY',
		'ALPACA_SECRET_KEY',
		'OPENAI_API_KEY',
	] as const;

	/**
	 * Initialize health check service with required dependencies
	 */
	constructor() {
		this.alpaca = new AlpacaService();
		this.marketData = new MarketDataService();
	}

	/**
	 * Execute comprehensive health check for all trading bot services
	 *
	 * Performs a series of health checks including API connectivity, environment
	 * configuration, market status, and system resources. Returns detailed results
	 * for each check along with an overall health assessment.
	 *
	 * @returns Promise resolving to comprehensive health check results
	 *
	 * @example
	 * ```typescript
	 * const health = await healthCheck.runHealthCheck();
	 *
	 * console.log(`Overall status: ${health.overall}`);
	 * console.log(`${health.summary.passed}/${health.summary.total} checks passed`);
	 *
	 * // Check specific services
	 * const alpacaCheck = health.checks.find(c => c.name === 'Alpaca API');
	 * if (alpacaCheck?.status === 'fail') {
	 *   console.error('Alpaca API is down:', alpacaCheck.message);
	 * }
	 * ```
	 */
	async runHealthCheck(): Promise<HealthCheckResponse> {
		const startTime = Date.now();
		const checks: HealthCheckResult[] = [];

		console.log('🏥 Initializing comprehensive health check...');

		// Execute all health checks in parallel where possible
		const checkPromises = [
			this._checkAlpacaAPI(),
			this._checkMarketDataService(),
			this._checkEnvironmentVariables(),
			this._checkMarketStatus(),
			this._checkFileSystemAccess(),
			this._checkNetworkConnectivity(),
		];

		const checkResults = await Promise.allSettled(checkPromises);

		// Process results and handle any check failures
		checkResults.forEach((result, index) => {
			if (result.status === 'fulfilled') {
				checks.push(result.value);
			} else {
				// If a health check itself fails, record it as a system error
				checks.push({
					name: `System Check ${index + 1}`,
					status: 'fail',
					message: `Health check failed: ${result.reason}`,
					timestamp: new Date().toISOString(),
				});
			}
		});

		const executionTime = Date.now() - startTime;
		const summary = this._calculateSummary(checks, executionTime);
		const overall = this._determineOverallStatus(checks);

		console.log(`✅ Health check completed in ${executionTime}ms`);

		return { overall, checks, summary };
	}

	/**
	 * Display formatted health status to console
	 *
	 * Provides a user-friendly console output of the health check results
	 * with color-coded status indicators and detailed information about
	 * each service's health.
	 *
	 * @example
	 * ```typescript
	 * await healthCheck.displayHealthStatus();
	 * // Output:
	 * // 🏥 Running health check...
	 * // ✅ Overall Status: HEALTHY
	 * // ✅ Alpaca API: Connected successfully (45ms)
	 * // ✅ Market Data: Yahoo Finance API working (123ms)
	 * // ⚠️  Market Status: Market is closed
	 * ```
	 */
	async displayHealthStatus(): Promise<void> {
		console.log('🏥 Running health check...\n');

		const result = await this.runHealthCheck();

		// Display overall status
		const statusEmoji = this._getStatusEmoji(result.overall);
		console.log(
			`${statusEmoji} Overall Status: ${result.overall.toUpperCase()}`
		);

		// Display summary
		console.log(
			`📊 Summary: ${result.summary.passed}/${result.summary.total} checks passed (${result.summary.executionTime}ms)\n`
		);

		// Display individual check results
		result.checks.forEach((check) => {
			const checkEmoji = this._getStatusEmoji(check.status);
			const duration = check.duration ? ` (${check.duration}ms)` : '';
			console.log(`${checkEmoji} ${check.name}: ${check.message}${duration}`);
		});

		// Display recommendations if there are issues
		if (result.overall !== 'healthy') {
			console.log(this._generateRecommendations(result.checks));
		}

		console.log('\n' + '='.repeat(50));
	}

	/**
	 * Get current health status without full check details
	 *
	 * @returns Promise resolving to overall health status
	 */
	async getHealthStatus(): Promise<HealthStatus> {
		const result = await this.runHealthCheck();
		return result.overall;
	}

	/**
	 * Check if trading bot is ready for operation
	 *
	 * @returns Promise resolving to true if all critical services are healthy
	 */
	async isReadyForTrading(): Promise<boolean> {
		const result = await this.runHealthCheck();

		// Consider ready if no failures (warnings are acceptable)
		const criticalFailures = result.checks.filter(
			(check) =>
				check.status === 'fail' &&
				['Alpaca API', 'Environment', 'File System'].includes(check.name)
		);

		return criticalFailures.length === 0;
	}

	/**
	 * Check Alpaca API connectivity and account access
	 *
	 * @private
	 * @returns Promise resolving to health check result
	 */
	private async _checkAlpacaAPI(): Promise<HealthCheckResult> {
		const startTime = Date.now();
		const timestamp = new Date().toISOString();

		try {
			const account = await this._withTimeout(
				this.alpaca.getAccount(),
				this.HEALTH_CHECK_TIMEOUT,
				'Alpaca API timeout'
			);

			const duration = Date.now() - startTime;

			// Additional validation of account data
			if (!account || !account.id) {
				return {
					name: 'Alpaca API',
					status: 'warning',
					message: 'Connected but invalid account data',
					timestamp,
					duration,
				};
			}

			return {
				name: 'Alpaca API',
				status: 'pass',
				message: `Connected successfully (Account: ${account.id})`,
				timestamp,
				duration,
			};
		} catch (error) {
			return {
				name: 'Alpaca API',
				status: 'fail',
				message: `Connection failed: ${this._formatError(error)}`,
				timestamp,
				duration: Date.now() - startTime,
			};
		}
	}

	/**
	 * Check market data service functionality
	 *
	 * @private
	 * @returns Promise resolving to health check result
	 */
	private async _checkMarketDataService(): Promise<HealthCheckResult> {
		const startTime = Date.now();
		const timestamp = new Date().toISOString();

		try {
			const data = await this._withTimeout(
				this.marketData.getMarketData(['AAPL']),
				this.HEALTH_CHECK_TIMEOUT,
				'Market data timeout'
			);

			const duration = Date.now() - startTime;

			// Validate response data
			if (!data || data.length === 0 || !data[0] || data[0].price <= 0) {
				return {
					name: 'Market Data',
					status: 'warning',
					message: 'Service responding but invalid data',
					timestamp,
					duration,
				};
			}

			return {
				name: 'Market Data',
				status: 'pass',
				message: `Yahoo Finance API working (AAPL: $${data[0].price.toFixed(
					2
				)})`,
				timestamp,
				duration,
			};
		} catch (error) {
			return {
				name: 'Market Data',
				status: 'fail',
				message: `Market data failed: ${this._formatError(error)}`,
				timestamp,
				duration: Date.now() - startTime,
			};
		}
	}

	/**
	 * Check environment variable configuration
	 *
	 * @private
	 * @returns Health check result for environment variables
	 */
	private _checkEnvironmentVariables(): HealthCheckResult {
		const timestamp = new Date().toISOString();
		const missingVars = this.REQUIRED_ENV_VARS.filter(
			(varName) => !process.env[varName]
		);

		if (missingVars.length === 0) {
			return {
				name: 'Environment',
				status: 'pass',
				message: 'All required environment variables configured',
				timestamp,
			};
		} else {
			return {
				name: 'Environment',
				status: 'fail',
				message: `Missing variables: ${missingVars.join(', ')}`,
				timestamp,
			};
		}
	}

	/**
	 * Check market status and trading hours
	 *
	 * @private
	 * @returns Health check result for market status
	 */
	private _checkMarketStatus(): HealthCheckResult {
		const timestamp = new Date().toISOString();
		const isMarketOpen = this.alpaca.isMarketOpen();

		return {
			name: 'Market Status',
			status: isMarketOpen ? 'pass' : 'warning',
			message: isMarketOpen
				? 'Market is open for trading'
				: 'Market is currently closed',
			timestamp,
		};
	}

	/**
	 * Check file system access and data directory permissions
	 *
	 * @private
	 * @returns Promise resolving to health check result
	 */
	private async _checkFileSystemAccess(): Promise<HealthCheckResult> {
		const timestamp = new Date().toISOString();

		try {
			const fs = require('fs').promises;
			const path = require('path');

			const dataDir = path.join(process.cwd(), 'data');
			const testFile = path.join(dataDir, '.health_check_test');

			// Ensure data directory exists
			await fs.mkdir(dataDir, { recursive: true });

			// Test write permissions
			await fs.writeFile(testFile, 'health_check_test');

			// Test read permissions
			await fs.readFile(testFile);

			// Cleanup test file
			await fs.unlink(testFile);

			return {
				name: 'File System',
				status: 'pass',
				message: 'Data directory accessible with read/write permissions',
				timestamp,
			};
		} catch (error) {
			return {
				name: 'File System',
				status: 'fail',
				message: `File system access failed: ${this._formatError(error)}`,
				timestamp,
			};
		}
	}

	/**
	 * Check network connectivity to external services
	 *
	 * @private
	 * @returns Promise resolving to health check result
	 */
	private async _checkNetworkConnectivity(): Promise<HealthCheckResult> {
		const timestamp = new Date().toISOString();

		try {
			// Test basic internet connectivity
			const https = require('https');
			await new Promise((resolve, reject) => {
				const req = https.get(
					'https://www.google.com',
					{ timeout: 5000 },
					resolve
				);
				req.on('error', reject);
				req.on('timeout', () => reject(new Error('Network timeout')));
			});

			return {
				name: 'Network',
				status: 'pass',
				message: 'Internet connectivity confirmed',
				timestamp,
			};
		} catch (error) {
			return {
				name: 'Network',
				status: 'fail',
				message: `Network connectivity failed: ${this._formatError(error)}`,
				timestamp,
			};
		}
	}

	/**
	 * Calculate summary statistics for health checks
	 *
	 * @private
	 * @param checks - Array of health check results
	 * @param executionTime - Total execution time
	 * @returns Summary statistics
	 */
	private _calculateSummary(
		checks: HealthCheckResult[],
		executionTime: number
	) {
		return {
			total: checks.length,
			passed: checks.filter((c) => c.status === 'pass').length,
			warnings: checks.filter((c) => c.status === 'warning').length,
			failures: checks.filter((c) => c.status === 'fail').length,
			executionTime,
		};
	}

	/**
	 * Determine overall health status from individual checks
	 *
	 * @private
	 * @param checks - Array of health check results
	 * @returns Overall health status
	 */
	private _determineOverallStatus(checks: HealthCheckResult[]): HealthStatus {
		const hasFailures = checks.some((check) => check.status === 'fail');
		const hasWarnings = checks.some((check) => check.status === 'warning');

		return hasFailures ? 'error' : hasWarnings ? 'warning' : 'healthy';
	}

	/**
	 * Get emoji for status display
	 *
	 * @private
	 * @param status - Status to get emoji for
	 * @returns Emoji string
	 */
	private _getStatusEmoji(status: HealthStatus | CheckStatus): string {
		const emojiMap = {
			healthy: '✅',
			warning: '⚠️',
			error: '❌',
			pass: '✅',
			fail: '❌',
		};
		return emojiMap[status] || '❓';
	}

	/**
	 * Format error for display
	 *
	 * @private
	 * @param error - Error to format
	 * @returns Formatted error string
	 */
	private _formatError(error: any): string {
		if (error instanceof Error) {
			return error.message;
		}
		return String(error);
	}

	/**
	 * Add timeout to promise
	 *
	 * @private
	 * @param promise - Promise to add timeout to
	 * @param timeoutMs - Timeout in milliseconds
	 * @param timeoutMessage - Message for timeout error
	 * @returns Promise with timeout
	 */
	private async _withTimeout<T>(
		promise: Promise<T>,
		timeoutMs: number,
		timeoutMessage: string
	): Promise<T> {
		return Promise.race([
			promise,
			new Promise<never>((_, reject) =>
				setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs)
			),
		]);
	}

	/**
	 * Generate recommendations based on health check results
	 *
	 * @private
	 * @param checks - Health check results
	 * @returns Recommendation string
	 */
	private _generateRecommendations(checks: HealthCheckResult[]): string {
		const failedChecks = checks.filter((c) => c.status === 'fail');

		if (failedChecks.length === 0) {
			return '\n💡 No critical issues detected. Some services may need attention.';
		}

		let recommendations = '\n🔧 RECOMMENDATIONS:\n';

		failedChecks.forEach((check) => {
			switch (check.name) {
				case 'Alpaca API':
					recommendations +=
						'• Check Alpaca API credentials and network connectivity\n';
					break;
				case 'Market Data':
					recommendations +=
						'• Verify Yahoo Finance service status and network access\n';
					break;
				case 'Environment':
					recommendations +=
						'• Set missing environment variables in .env file\n';
					break;
				case 'File System':
					recommendations += '• Check file permissions and disk space\n';
					break;
				case 'Network':
					recommendations +=
						'• Verify internet connection and firewall settings\n';
					break;
				default:
					recommendations += `• Investigate ${check.name} service issues\n`;
			}
		});

		return recommendations;
	}
}
