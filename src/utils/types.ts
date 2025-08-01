export interface HealthCheckResult {
	name: string;
	status: 'pass' | 'fail' | 'warning';
	message: string;
	timestamp: string;
	duration?: number; // Execution time in milliseconds
}

export interface HealthCheckResponse {
	overall: 'healthy' | 'warning' | 'error';
	checks: HealthCheckResult[];
	summary: {
		total: number;
		passed: number;
		warnings: number;
		failures: number;
		executionTime: number;
	};
}

export type HealthStatus = 'healthy' | 'warning' | 'error';

export type CheckStatus = 'pass' | 'fail' | 'warning';

export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

export interface LogEntry {
	timestamp: string;
	level: LogLevel;
	message: string;
	data?: any;
	context?: string;
	source?: string;
}

export interface LoggerConfig {
	logToConsole?: boolean;
	logToFile?: boolean;
	minLogLevel?: LogLevel;
	maxFileSizeMB?: number;
	maxLogFiles?: number;
}

export interface LogFilter {
	level?: LogLevel;
	startDate?: Date;
	endDate?: Date;
	searchTerm?: string;
	source?: string;
}

export type NotificationLevel = 'info' | 'warning' | 'error' | 'success';

export type TradeType = 'BUY' | 'SELL';

export interface PortfolioSummary {
	totalEquity: number;
	dayChange: number;
	dayChangePercent: number;
	positions: number;
	trades: number;
	topPerformer?: string;
	worstPerformer?: string;
}

export interface TradeDetails {
	type: TradeType;
	ticker: string;
	shares: number;
	price: number;
	totalValue: number;
	reason: string;
	timestamp?: Date;
	stopLoss?: number;
}

export interface NotificationResult {
	telegram: boolean;
	errors: string[];
}

export interface HealthAlert {
	service: string;
	status: 'healthy' | 'warning' | 'error';
	message: string;
	timestamp: Date;
}

export interface TelegramConfig {
	botToken: string;
	chatId: string;
}

export interface DailyUpdateResult {
	success: boolean;
	duration: number;
	timestamp: Date;
	portfolioCount: number;
	totalEquity: number;
	dayChange: number;
	dayChangePercent: number;
	cashBalance: number;
	processedTickers: string[];
	marketDataPoints: number;
	stopLossTriggered: number;
	summaryPath?: string;
	error?: string;
}

export interface UpdateOptions {
	skipHealthCheck?: boolean;
	saveSummary?: boolean;
	summaryDir?: string;
	sendNotification?: boolean;
	includeMarketHours?: boolean;
	forceUpdate?: boolean;
	customSummaryName?: string;
}
