import { promises as fs } from 'fs';
import path from 'path';
import { LoggerConfig, LogLevel, LogEntry, LogFilter } from './types';

/**
 * Comprehensive logging service for trading bot operations
 *
 * Provides structured logging with multiple output targets, log rotation,
 * filtering capabilities, and performance optimizations. Supports both
 * file-based persistence and real-time console output.
 *
 * Features:
 * - Multi-level logging (DEBUG, INFO, WARN, ERROR)
 * - Structured log entries with metadata
 * - Automatic log rotation and cleanup
 * - Configurable output targets (console, file)
 * - Log querying and filtering
 * - Performance metrics and context tracking
 * - Async operations with error handling
 *
 * @example
 * ```typescript
 * const logger = new Logger({
 *   logToConsole: true,
 *   logToFile: true,
 *   minLogLevel: 'INFO'
 * });
 *
 * await logger.info('Trade executed', { ticker: 'AAPL', shares: 10 });
 * await logger.error('API connection failed', { error: 'Timeout' });
 *
 * const recentLogs = await logger.queryLogs({ level: 'ERROR', days: 7 });
 * ```
 */
export class Logger {
	private readonly logDir: string;
	private readonly config: Required<LoggerConfig>;

	// Log level hierarchy for filtering
	private readonly LOG_LEVELS: Record<LogLevel, number> = {
		DEBUG: 0,
		INFO: 1,
		WARN: 2,
		ERROR: 3,
	};

	// Console styling
	private readonly LEVEL_EMOJIS: Record<LogLevel, string> = {
		DEBUG: '🔍',
		INFO: 'ℹ️',
		WARN: '⚠️',
		ERROR: '❌',
	};

	private readonly LEVEL_COLORS: Record<LogLevel, string> = {
		DEBUG: '\x1b[36m', // Cyan
		INFO: '\x1b[32m', // Green
		WARN: '\x1b[33m', // Yellow
		ERROR: '\x1b[31m', // Red
	};

	private readonly RESET_COLOR = '\x1b[0m';

	/**
	 * Initialize logger with configuration options
	 *
	 * @param config - Logger configuration options
	 */
	constructor(config: LoggerConfig = {}) {
		this.config = {
			logToConsole: config.logToConsole ?? true,
			logToFile: config.logToFile ?? true,
			minLogLevel: config.minLogLevel ?? 'INFO',
			maxFileSizeMB: config.maxFileSizeMB ?? 50,
			maxLogFiles: config.maxLogFiles ?? 30,
		};

		this.logDir = path.join(process.cwd(), 'logs');
		this._ensureLogDirectory();
	}

	/**
	 * Log a message with specified level and optional data
	 *
	 * @param level - Log level (DEBUG, INFO, WARN, ERROR)
	 * @param message - Primary log message
	 * @param data - Optional structured data to include
	 * @param context - Optional context identifier (e.g., 'TRADE', 'API')
	 * @param source - Optional source identifier (e.g., method name, class name)
	 *
	 * @example
	 * ```typescript
	 * await logger.log('INFO', 'Portfolio updated',
	 *   { totalValue: 12500, positions: 5 },
	 *   'PORTFOLIO',
	 *   'PortfolioManager.updatePositions'
	 * );
	 * ```
	 */
	async log(
		level: LogLevel,
		message: string,
		data?: any,
		context?: string,
		source?: string
	): Promise<void> {
		// Check if log level meets minimum threshold
		if (this.LOG_LEVELS[level] < this.LOG_LEVELS[this.config.minLogLevel]) {
			return;
		}

		const timestamp = new Date().toISOString();
		const logEntry: LogEntry = {
			timestamp,
			level,
			message,
			data: data || undefined,
			context,
			source,
		};

		// Log to console if enabled
		if (this.config.logToConsole) {
			this._logToConsole(logEntry);
		}

		// Log to file if enabled
		if (this.config.logToFile) {
			await this._logToFile(logEntry);
		}
	}

	/**
	 * Log informational message
	 *
	 * @param message - Log message
	 * @param data - Optional data object
	 * @param context - Optional context identifier
	 * @param source - Optional source identifier
	 *
	 * @example
	 * ```typescript
	 * await logger.info('Market data updated', { symbols: ['AAPL', 'MSFT'] });
	 * ```
	 */
	async info(
		message: string,
		data?: any,
		context?: string,
		source?: string
	): Promise<void> {
		await this.log('INFO', message, data, context, source);
	}

	/**
	 * Log warning message
	 *
	 * @param message - Log message
	 * @param data - Optional data object
	 * @param context - Optional context identifier
	 * @param source - Optional source identifier
	 *
	 * @example
	 * ```typescript
	 * await logger.warn('API rate limit approaching', { remaining: 10 });
	 * ```
	 */
	async warn(
		message: string,
		data?: any,
		context?: string,
		source?: string
	): Promise<void> {
		await this.log('WARN', message, data, context, source);
	}

	/**
	 * Log error message
	 *
	 * @param message - Log message
	 * @param data - Optional data object (often error details)
	 * @param context - Optional context identifier
	 * @param source - Optional source identifier
	 *
	 * @example
	 * ```typescript
	 * await logger.error('Trade execution failed', {
	 *   ticker: 'AAPL',
	 *   error: error.message,
	 *   stack: error.stack
	 * });
	 * ```
	 */
	async error(
		message: string,
		data?: any,
		context?: string,
		source?: string
	): Promise<void> {
		await this.log('ERROR', message, data, context, source);
	}

	/**
	 * Log debug message
	 *
	 * @param message - Log message
	 * @param data - Optional data object
	 * @param context - Optional context identifier
	 * @param source - Optional source identifier
	 *
	 * @example
	 * ```typescript
	 * await logger.debug('API request details', { url, headers, body });
	 * ```
	 */
	async debug(
		message: string,
		data?: any,
		context?: string,
		source?: string
	): Promise<void> {
		await this.log('DEBUG', message, data, context, source);
	}

	/**
	 * Query logs with filtering options
	 *
	 * @param filter - Filter criteria for log search
	 * @param days - Number of days to search back (default: 7)
	 * @returns Promise resolving to filtered log entries
	 *
	 * @example
	 * ```typescript
	 * const errorLogs = await logger.queryLogs({
	 *   level: 'ERROR',
	 *   searchTerm: 'trade',
	 *   days: 3
	 * });
	 * ```
	 */
	async queryLogs(
		filter: LogFilter & { days?: number } = {}
	): Promise<LogEntry[]> {
		const days = filter.days || 7;
		const allLogs: LogEntry[] = [];

		for (let i = 0; i < days; i++) {
			const date = new Date();
			date.setDate(date.getDate() - i);
			const fileName = this._getLogFileName(date);
			const filePath = path.join(this.logDir, fileName);

			try {
				const content = await fs.readFile(filePath, 'utf8');
				const logEntries = this._parseLogFile(content);
				allLogs.push(...logEntries);
			} catch (error) {
				// File doesn't exist for this date, continue
			}
		}

		return this._filterLogs(allLogs, filter);
	}

	/**
	 * Get recent logs as formatted strings
	 *
	 * @param days - Number of days to retrieve (default: 7)
	 * @returns Promise resolving to array of log file contents
	 *
	 * @example
	 * ```typescript
	 * const logs = await logger.getLogs(3);
	 * logs.forEach(logContent => console.log(logContent));
	 * ```
	 */
	async getLogs(days: number = 7): Promise<string[]> {
		const logs: string[] = [];

		for (let i = 0; i < days; i++) {
			const date = new Date();
			date.setDate(date.getDate() - i);
			const fileName = this._getLogFileName(date);
			const filePath = path.join(this.logDir, fileName);

			try {
				const content = await fs.readFile(filePath, 'utf8');
				logs.push(content);
			} catch (error) {
				// File doesn't exist for this date, skip
			}
		}

		return logs;
	}

	/**
	 * Clean up old log files based on retention policy
	 *
	 * @returns Promise resolving to number of files cleaned up
	 *
	 * @example
	 * ```typescript
	 * const cleaned = await logger.cleanup();
	 * console.log(`Cleaned up ${cleaned} old log files`);
	 * ```
	 */
	async cleanup(): Promise<number> {
		try {
			const files = await fs.readdir(this.logDir);
			const logFiles = files
				.filter(
					(file) => file.startsWith('trading-bot-') && file.endsWith('.log')
				)
				.map((file) => ({
					name: file,
					path: path.join(this.logDir, file),
					date: this._extractDateFromFileName(file),
				}))
				.filter((file) => file.date !== null)
				.sort((a, b) => b.date!.getTime() - a.date!.getTime());

			let cleanedCount = 0;

			// Remove files beyond max count
			if (logFiles.length > this.config.maxLogFiles) {
				const filesToDelete = logFiles.slice(this.config.maxLogFiles);
				for (const file of filesToDelete) {
					await fs.unlink(file.path);
					cleanedCount++;
				}
			}

			// Check file sizes and rotate if needed
			for (const file of logFiles.slice(0, this.config.maxLogFiles)) {
				const stats = await fs.stat(file.path);
				const fileSizeMB = stats.size / (1024 * 1024);

				if (fileSizeMB > this.config.maxFileSizeMB) {
					await this._rotateLogFile(file.path);
				}
			}

			if (cleanedCount > 0) {
				await this.info(`Log cleanup completed`, {
					filesRemoved: cleanedCount,
				});
			}

			return cleanedCount;
		} catch (error) {
			console.error('Error during log cleanup:', error);
			return 0;
		}
	}

	/**
	 * Get logger statistics and configuration
	 *
	 * @returns Logger statistics and configuration
	 */
	getStats(): { config: LoggerConfig; logDir: string; currentLogFile: string } {
		return {
			config: this.config,
			logDir: this.logDir,
			currentLogFile: this._getCurrentLogFile(),
		};
	}

	/**
	 * Ensure log directory exists
	 *
	 * @private
	 */
	private async _ensureLogDirectory(): Promise<void> {
		try {
			await fs.mkdir(this.logDir, { recursive: true });
		} catch (error) {
			console.error('❌ Error creating log directory:', error);
		}
	}

	/**
	 * Log entry to console with formatting
	 *
	 * @private
	 * @param entry - Log entry to display
	 */
	private _logToConsole(entry: LogEntry): void {
		const emoji = this.LEVEL_EMOJIS[entry.level];
		const color = this.LEVEL_COLORS[entry.level];
		const timestamp = new Date(entry.timestamp).toLocaleTimeString();

		// Format context and source if provided
		const contextStr = entry.context ? `[${entry.context}] ` : '';
		const sourceStr = entry.source ? `{${entry.source}} ` : '';

		console.log(
			`${color}${emoji} ${timestamp} ${contextStr}${sourceStr}${entry.message}${this.RESET_COLOR}`
		);

		if (entry.data) {
			console.log(JSON.stringify(entry.data, null, 2));
		}
	}

	/**
	 * Log entry to file
	 *
	 * @private
	 * @param entry - Log entry to write
	 */
	private async _logToFile(entry: LogEntry): Promise<void> {
		const logLine = this._formatLogLine(entry);
		const logFile = this._getCurrentLogFile();

		try {
			await fs.appendFile(logFile, logLine);
		} catch (error) {
			console.error('❌ Error writing to log file:', error);
		}
	}

	/**
	 * Format log entry as file line
	 *
	 * @private
	 * @param entry - Log entry to format
	 * @returns Formatted log line
	 */
	private _formatLogLine(entry: LogEntry): string {
		const contextStr = entry.context ? ` [${entry.context}]` : '';
		const sourceStr = entry.source ? ` {${entry.source}}` : '';
		const dataStr = entry.data ? ` | Data: ${JSON.stringify(entry.data)}` : '';

		return `${entry.timestamp} [${entry.level}]${contextStr}${sourceStr} ${entry.message}${dataStr}\n`;
	}

	/**
	 * Get current log file path
	 *
	 * @private
	 * @returns Current log file path
	 */
	private _getCurrentLogFile(): string {
		const fileName = this._getLogFileName(new Date());
		return path.join(this.logDir, fileName);
	}

	/**
	 * Get log file name for a date
	 *
	 * @private
	 * @param date - Date for log file
	 * @returns Log file name
	 */
	private _getLogFileName(date: Date): string {
		return `trading-bot-${date.toISOString().split('T')[0]}.log`;
	}

	/**
	 * Parse log file content into structured entries
	 *
	 * @private
	 * @param content - Log file content
	 * @returns Array of parsed log entries
	 */
	private _parseLogFile(content: string): LogEntry[] {
		const lines = content.split('\n').filter((line) => line.trim());
		const entries: LogEntry[] = [];

		for (const line of lines) {
			try {
				const match = line.match(
					/^(.+?) \[(.+?)\](?:\s\[(.+?)\])?(?:\s\{(.+?)\})?\s(.+?)(?:\s\|\sData:\s(.+))?$/
				);
				if (match) {
					const [, timestamp, level, context, source, message, dataStr] = match;
					entries.push({
						timestamp,
						level: level as LogLevel,
						context,
						source,
						message,
						data: dataStr ? JSON.parse(dataStr) : undefined,
					});
				}
			} catch (error) {
				// Skip malformed lines
			}
		}

		return entries;
	}

	/**
	 * Filter log entries based on criteria
	 *
	 * @private
	 * @param logs - Log entries to filter
	 * @param filter - Filter criteria
	 * @returns Filtered log entries
	 */
	private _filterLogs(logs: LogEntry[], filter: LogFilter): LogEntry[] {
		return logs.filter((entry) => {
			if (filter.level && entry.level !== filter.level) return false;
			if (filter.source && entry.source !== filter.source) return false;
			if (
				filter.searchTerm &&
				!entry.message.toLowerCase().includes(filter.searchTerm.toLowerCase())
			)
				return false;

			const entryDate = new Date(entry.timestamp);
			if (filter.startDate && entryDate < filter.startDate) return false;
			if (filter.endDate && entryDate > filter.endDate) return false;

			return true;
		});
	}

	/**
	 * Extract date from log file name
	 *
	 * @private
	 * @param fileName - Log file name
	 * @returns Extracted date or null
	 */
	private _extractDateFromFileName(fileName: string): Date | null {
		const match = fileName.match(/trading-bot-(\d{4}-\d{2}-\d{2})\.log/);
		return match ? new Date(match[1]) : null;
	}

	/**
	 * Rotate log file when it gets too large
	 *
	 * @private
	 * @param filePath - Path to log file to rotate
	 */
	private async _rotateLogFile(filePath: string): Promise<void> {
		try {
			const rotatedPath = filePath.replace(
				'.log',
				`-rotated-${Date.now()}.log`
			);
			await fs.rename(filePath, rotatedPath);
			await this.info('Log file rotated', {
				original: filePath,
				rotated: rotatedPath,
			});
		} catch (error) {
			console.error('Error rotating log file:', error);
		}
	}
}
