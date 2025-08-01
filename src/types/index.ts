export interface Account {
	id: string;
	cash: string;
	buyingPower: string;
	equity: string;
	lastEquity: string;
}

export interface TrackedPosition {
	ticker: string;
	shares: number;
	stopLoss: number;
	buyPrice: number;
	costBasis: number;
}

export interface Position {
	ticker: string;
	shares: number;
	stopLoss: number;
	buyPrice: number;
	costBasis: number;
	marketValue: number;
	currentPrice: number;
	lastdayPrice: number;
	changeToday: number;
	unrealizedPl: number;
	unrealizedPlPercent: number;
	unrealizedIntradayPl: number;
	unrealizedIntradayPlPercent: number;
	assetId: string;
	exchange: string;
	assetClass: string;
	side: string;
	qtyAvailable: number;
	assetMarginable: boolean;
}

export interface PortfolioUpdate {
	date: string;
	ticker: string;
	shares: number | string;
	costBasis: number | string;
	stopLoss: number | string;
	currentPrice: number | string;
	totalValue: number | string;
	pnl: number | string;
	action: string;
	cashBalance: number | string;
	totalEquity: number | string;
}

export interface TradeLog {
	date: string;
	ticker: string;
	sharesBought?: number;
	buyPrice?: number;
	costBasis: number;
	pnl: number;
	reason: string;
	sharesSold?: number;
	sellPrice?: number;
}

export interface MarketData {
	symbol: string;
	price: number;
	previousClose: number;
	volume: number;
	percentChange: number;
}

export interface ChatGPTDecision {
	action: 'BUY' | 'SELL' | 'HOLD';
	ticker?: string;
	shares?: number;
	stopLoss?: number;
	reasoning: string;
}

export interface PortfolioMetrics {
	totalEquity: number;
	totalReturn: number;
	sharpeRatio: number;
	sortinoRatio: number;
	maxDrawdown: number;
	winRate: number;
}

export interface OpenAIResponse {
	choices: Array<{
		message: {
			content: string;
		};
	}>;
}

export interface PortfolioPoint {
	date: string;
	totalEquity: number;
}

export interface BenchmarkPoint {
	date: string;
	value: number;
}

export interface ChartData {
	portfolio: PlotlyTrace;
	benchmark: PlotlyTrace;
	layout: PlotlyLayout;
}

export interface PlotlyTrace {
	x: string[];
	y: number[];
	type: string;
	mode: string;
	name: string;
	line: {
		color: string;
		width: number;
		dash?: string;
	};
	marker: {
		color: string;
		size: number;
	};
}

export interface PlotlyLayout {
	title: string;
	xaxis: {
		title: string;
		type: string;
	};
	yaxis: {
		title: string;
	};
	hovermode: string;
	showlegend: boolean;
	grid: boolean;
}

export interface PerformanceMetrics {
	portfolioValue: number;
	portfolioReturn: number;
	benchmarkValue: number;
	benchmarkReturn: number;
	alpha: number;
	volatility: number;
	winRate: number;
	tradingDays: number;
}

export interface PortfolioHistoryPoint {
	date: string;
	totalEquity: number;
}

export interface PortfolioSummary {
	totalValue: number;
	totalCash: number;
	totalEquity: number;
	dayChange: number;
	dayChangePercent: number;
	positions: PositionSummary[];
}

export interface PositionSummary {
	ticker: string;
	shares: number;
	avgCost: number;
	currentPrice: number;
	marketValue: number;
	dayChange: number;
	totalChange: number;
	dayChangePercent: number;
	totalChangePercent: number;
}

export interface ProcessingResult {
	portfolio: Position[];
	cash: number;
}

export interface HistoricalDataPoint {
	date: Date;
	close: number;
	volume: number;
	high: number;
	low: number;
	open: number;
}

export interface DailyUpdateResult {
	portfolioCount: number;
	totalEquity: number;
	dayChange: number;
	cashBalance: number;
	processedTickers: string[];
	marketDataPoints: number;
}

export interface AIAnalysisResult {
	recommendations: ChatGPTDecision[];
	executedTrades: number;
	skippedTrades: number;
	tradingEnabled: boolean;
	totalRecommendations: number;
}

export interface ResearchResult {
	currentHoldings: string[];
	researchedTickers: string[];
	screenedOpportunities: string[];
	topPicks: string[];
	researchCount: number;
}

export interface EmergencyStopResult {
	success: boolean;
	cancelledOrders: number;
	duration: number;
	timestamp: Date;
	reason?: string;
	error?: string;
}

export interface GraphGenerationResult {
	success: boolean;
	duration: number;
	outputPath?: string;
	dataExportPath?: string;
	fileSize?: number;
	metrics?: {
		portfolioValue: number;
		totalReturn: number;
		alpha: number;
		tradingDays: number;
	};
	error?: string;
}

export interface GraphOptions {
	outputDir?: string;
	includeDataExport?: boolean;
	sendNotification?: boolean;
	customFilename?: string;
	openInBrowser?: boolean;
	format?: 'html' | 'png' | 'pdf';
}

export interface ResearchResult {
	success: boolean;
	duration: number;
	timestamp: Date;
	currentHoldings: string[];
	researchedTickers: string[];
	screenedOpportunities: string[];
	topPicks: string[];
	totalResearchReports: number;
	reportPath?: string;
	error?: string;
}

export interface ResearchOptions {
	saveReport?: boolean;
	reportDir?: string;
	maxResearchTargets?: number;
	includeScreening?: boolean;
	sendNotification?: boolean;
	customReportName?: string;
	skipCurrentHoldings?: boolean;
}

export interface UpdateResult {
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
