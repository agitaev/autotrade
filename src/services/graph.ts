import { promises as fs } from 'fs';
import path from 'path';
import csvParser from 'csv-parser';
import { MarketDataService } from './yahoo';
import {
	PerformanceMetrics,
	PortfolioPoint,
	BenchmarkPoint,
	ChartData,
	PlotlyTrace,
	PlotlyLayout,
} from '../types';

/**
 * Service for generating portfolio performance charts and analytics
 *
 * Creates interactive charts comparing portfolio performance against benchmarks,
 * calculates key performance metrics, and provides data export capabilities.
 *
 * Key features:
 * - Interactive HTML charts using Plotly
 * - Performance metrics calculation (Sharpe, volatility, win rate)
 * - Benchmark comparison (S&P 500)
 * - Data export and visualization
 * - Historical performance tracking
 *
 * @example
 * ```typescript
 * const generator = new GraphGenerator();
 * await generator.generatePerformanceChart('./chart.html');
 * await generator.exportPortfolioData('./data.csv');
 * ```
 */
export class GraphGenerator {
	private readonly marketData: MarketDataService;
	private readonly dataDir: string;
	private readonly portfolioFile: string;

	// S&P 500 baseline price for normalization (from original Python implementation)
	private readonly SPX_BASELINE_PRICE = 6173.07;
	private readonly BASELINE_INVESTMENT = 100;

	/**
	 * Initialize GraphGenerator with market data service and file paths
	 */
	constructor() {
		this.marketData = new MarketDataService();
		this.dataDir = path.join(process.cwd(), 'data');
		this.portfolioFile = path.join(
			this.dataDir,
			'chatgpt_portfolio_update.csv'
		);
	}

	/**
	 * Generate complete performance chart with metrics display
	 *
	 * Creates an interactive HTML chart comparing portfolio performance to S&P 500,
	 * saves it to the specified path, and displays key performance metrics.
	 *
	 * @param outputPath - Optional path to save the HTML chart file
	 * @throws {Error} If chart generation fails
	 *
	 * @example
	 * ```typescript
	 * await generator.generatePerformanceChart('./reports/performance.html');
	 * ```
	 */
	async generatePerformanceChart(outputPath?: string): Promise<void> {
		try {
			console.log('📊 Generating performance chart...');

			const portfolioData = await this._loadPortfolioData();
			const benchmarkData = await this._loadBenchmarkData(portfolioData);

			const chartData = this._prepareChartData(portfolioData, benchmarkData);

			if (outputPath) {
				await this._saveChartData(chartData, outputPath);
			}

			this._displayPerformanceMetrics(portfolioData, benchmarkData);

			console.log('✅ Performance chart generation completed');
		} catch (error) {
			console.error('❌ Error generating performance chart:', error);
			throw new Error(`Failed to generate performance chart: ${error}`);
		}
	}

	/**
	 * Export portfolio data to CSV format
	 *
	 * @param outputPath - Path where CSV file should be saved
	 * @throws {Error} If export fails
	 *
	 * @example
	 * ```typescript
	 * await generator.exportPortfolioData('./exports/portfolio_data.csv');
	 * ```
	 */
	async exportPortfolioData(outputPath: string): Promise<void> {
		try {
			console.log(`📁 Exporting portfolio data to ${outputPath}...`);

			const portfolioData = await this._loadPortfolioData();
			const csvContent = [
				'Date,Total Equity',
				...portfolioData.map((point) => `${point.date},${point.totalEquity}`),
			].join('\n');

			await fs.writeFile(outputPath, csvContent);
			console.log(`✅ Portfolio data exported successfully`);
		} catch (error) {
			console.error('❌ Error exporting portfolio data:', error);
			throw new Error(`Failed to export portfolio data: ${error}`);
		}
	}

	/**
	 * Calculate and return performance metrics
	 *
	 * @returns Promise resolving to performance metrics object
	 */
	async getPerformanceMetrics(): Promise<PerformanceMetrics | null> {
		try {
			const portfolioData = await this._loadPortfolioData();
			const benchmarkData = await this._loadBenchmarkData(portfolioData);

			return this._calculateMetrics(portfolioData, benchmarkData);
		} catch (error) {
			console.error('❌ Error calculating performance metrics:', error);
			return null;
		}
	}

	/**
	 * Load portfolio historical data from CSV file
	 *
	 * @private
	 * @returns Promise resolving to array of portfolio data points
	 */
	private async _loadPortfolioData(): Promise<PortfolioPoint[]> {
		return new Promise((resolve, reject) => {
			const results: PortfolioPoint[] = [];

			// Handle case where no portfolio file exists yet
			if (!require('fs').existsSync(this.portfolioFile)) {
				console.log('📝 No portfolio data found, creating baseline point');
				resolve([
					{
						date: new Date().toISOString().split('T')[0],
						totalEquity: this.BASELINE_INVESTMENT,
					},
				]);
				return;
			}

			require('fs')
				.createReadStream(this.portfolioFile)
				.pipe(csvParser())
				.on('data', (data: any) => {
					// Only process TOTAL rows which contain portfolio equity
					if (data.Ticker === 'TOTAL' && data['Total Equity']) {
						const equity = parseFloat(data['Total Equity']);
						if (!isNaN(equity)) {
							results.push({
								date: data.Date,
								totalEquity: equity,
							});
						}
					}
				})
				.on('end', () => {
					// Ensure we have a baseline starting point
					const processedResults = this._ensureBaselinePoint(results);
					resolve(this._sortByDate(processedResults));
				})
				.on('error', (error: Error) => {
					console.error('❌ Error reading portfolio CSV:', error);
					reject(new Error(`Failed to load portfolio data: ${error}`));
				});
		});
	}

	/**
	 * Load benchmark (S&P 500) data for comparison
	 *
	 * @private
	 * @param portfolioData - Portfolio data to determine date range
	 * @returns Promise resolving to benchmark data points
	 */
	private async _loadBenchmarkData(
		portfolioData: PortfolioPoint[]
	): Promise<BenchmarkPoint[]> {
		if (portfolioData.length === 0) {
			console.log('⚠️  No portfolio data available for benchmark comparison');
			return [];
		}

		const startDate = new Date(portfolioData[0].date);
		const endDate = new Date(portfolioData[portfolioData.length - 1].date);

		try {
			console.log(
				`📈 Loading S&P 500 benchmark data from ${startDate.toDateString()} to ${endDate.toDateString()}`
			);

			// Get S&P 500 historical data
			const spxData = await this.marketData.getHistoricalData('^GSPC', '1y');

			// Filter data to match portfolio date range
			const filteredData = spxData.filter((point) => {
				const pointDate = new Date(point.date);
				return pointDate >= startDate && pointDate <= endDate;
			});

			if (filteredData.length === 0) {
				console.log(
					'⚠️ No benchmark data available for the portfolio date range'
				);
				return [];
			}

			// Normalize to $100 starting value (consistent with original Python implementation)
			return filteredData.map((point) => ({
				date: point.date.toISOString().split('T')[0],
				value:
					(point.close / this.SPX_BASELINE_PRICE) * this.BASELINE_INVESTMENT,
			}));
		} catch (error) {
			console.error('❌ Error loading benchmark data:', error);
			return [];
		}
	}

	/**
	 * Prepare chart data in Plotly format
	 *
	 * @private
	 * @param portfolioData - Portfolio performance data
	 * @param benchmarkData - Benchmark performance data
	 * @returns Chart configuration object
	 */
	private _prepareChartData(
		portfolioData: PortfolioPoint[],
		benchmarkData: BenchmarkPoint[]
	): ChartData {
		const portfolioTrace: PlotlyTrace = {
			x: portfolioData.map((point) => point.date),
			y: portfolioData.map((point) => point.totalEquity),
			type: 'scatter',
			mode: 'lines+markers',
			name: 'ChatGPT Portfolio ($100 Invested)',
			line: { color: 'blue', width: 2 },
			marker: { color: 'blue', size: 6 },
		};

		const benchmarkTrace: PlotlyTrace = {
			x: benchmarkData.map((point) => point.date),
			y: benchmarkData.map((point) => point.value),
			type: 'scatter',
			mode: 'lines+markers',
			name: 'S&P 500 ($100 Invested)',
			line: { color: 'orange', width: 2, dash: 'dash' },
			marker: { color: 'orange', size: 6 },
		};

		const layout: PlotlyLayout = {
			title: "ChatGPT's Micro Cap Portfolio vs. S&P 500",
			xaxis: {
				title: 'Date',
				type: 'date',
			},
			yaxis: {
				title: 'Value of $100 Investment ($)',
			},
			hovermode: 'x unified',
			showlegend: true,
			grid: true,
		};

		return {
			portfolio: portfolioTrace,
			benchmark: benchmarkTrace,
			layout,
		};
	}

	/**
	 * Save chart data as interactive HTML file
	 *
	 * @private
	 * @param chartData - Plotly chart configuration
	 * @param outputPath - File path to save HTML chart
	 */
	private async _saveChartData(
		chartData: ChartData,
		outputPath: string
	): Promise<void> {
		try {
			// Ensure output directory exists
			const outputDir = path.dirname(outputPath);
			await fs.mkdir(outputDir, { recursive: true });

			const plotlyHtml = this._generatePlotlyHTML(chartData);
			await fs.writeFile(outputPath, plotlyHtml);

			console.log(`📊 Interactive chart saved to: ${outputPath}`);
		} catch (error) {
			console.error('❌ Error saving chart:', error);
			throw new Error(`Failed to save chart: ${error}`);
		}
	}

	/**
	 * Generate HTML content for Plotly chart
	 *
	 * @private
	 * @param chartData - Chart configuration
	 * @returns HTML string
	 */
	private _generatePlotlyHTML(chartData: ChartData): string {
		return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <script src="https://cdn.plot.ly/plotly-latest.min.js"></script>
    <title>Portfolio Performance Chart</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        .header { text-align: center; margin-bottom: 20px; }
        .chart-container { width: 100%; height: 600px; }
        .footer { text-align: center; margin-top: 20px; color: #666; }
    </style>
</head>
<body>
    <div class="header">
        <h1>ChatGPT Trading Bot Performance</h1>
        <p>Generated on ${new Date().toLocaleString()}</p>
    </div>
    
    <div id="chart" class="chart-container"></div>
    
    <div class="footer">
        <p>Micro-cap portfolio performance vs S&P 500 benchmark</p>
    </div>
    
    <script>
        const data = [
            ${JSON.stringify(chartData.portfolio, null, 2)},
            ${JSON.stringify(chartData.benchmark, null, 2)}
        ];
        
        const layout = ${JSON.stringify(chartData.layout, null, 2)};
        
        // Add responsive behavior
        layout.autosize = true;
        layout.responsive = true;
        
        Plotly.newPlot('chart', data, layout, {responsive: true});
    </script>
</body>
</html>`;
	}

	/**
	 * Display performance metrics in console
	 *
	 * @private
	 * @param portfolioData - Portfolio performance data
	 * @param benchmarkData - Benchmark performance data
	 */
	private _displayPerformanceMetrics(
		portfolioData: PortfolioPoint[],
		benchmarkData: BenchmarkPoint[]
	): void {
		const metrics = this._calculateMetrics(portfolioData, benchmarkData);

		if (!metrics) {
			console.log('⚠️  No portfolio data available for metrics calculation');
			return;
		}

		console.log('\n📊 === PERFORMANCE METRICS ===');
		console.log(`💰 Latest Portfolio Value: $${metrics.portfolioValue}`);
		console.log(`📈 Portfolio Return: ${metrics.portfolioReturn}%`);

		if (metrics.benchmarkValue > 0) {
			console.log(`🔶 S&P 500 Value: $${metrics.benchmarkValue}`);
			console.log(`🔶 S&P 500 Return: ${metrics.benchmarkReturn}%`);
			console.log(`🎯 Alpha: ${metrics.alpha}%`);
		}

		if (metrics.tradingDays > 0) {
			console.log(
				`📊 Volatility (Annualized): ${(metrics.volatility * 100).toFixed(2)}%`
			);
			console.log(`🎲 Win Rate: ${(metrics.winRate * 100).toFixed(1)}%`);
			console.log(`📅 Trading Days: ${metrics.tradingDays}`);
		}

		console.log('================================\n');
	}

	/**
	 * Calculate comprehensive performance metrics
	 *
	 * @private
	 * @param portfolioData - Portfolio data points
	 * @param benchmarkData - Benchmark data points
	 * @returns Performance metrics object or null if insufficient data
	 */
	private _calculateMetrics(
		portfolioData: PortfolioPoint[],
		benchmarkData: BenchmarkPoint[]
	): PerformanceMetrics | null {
		if (portfolioData.length === 0) return null;

		const latestPortfolio = portfolioData[portfolioData.length - 1];
		const latestBenchmark =
			benchmarkData.length > 0 ? benchmarkData[benchmarkData.length - 1] : null;

		const portfolioReturn =
			((latestPortfolio.totalEquity - this.BASELINE_INVESTMENT) /
				this.BASELINE_INVESTMENT) *
			100;
		const benchmarkReturn = latestBenchmark
			? ((latestBenchmark.value - this.BASELINE_INVESTMENT) /
					this.BASELINE_INVESTMENT) *
			  100
			: 0;

		let volatility = 0;
		let winRate = 0;
		let tradingDays = 0;

		// Calculate additional metrics if we have multiple data points
		if (portfolioData.length > 1) {
			const returns = portfolioData
				.slice(1)
				.map(
					(point, i) =>
						(point.totalEquity - portfolioData[i].totalEquity) /
						portfolioData[i].totalEquity
				);

			const avgReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length;
			volatility =
				Math.sqrt(
					returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) /
						returns.length
				) * Math.sqrt(252); // Annualized

			winRate = returns.filter((r) => r > 0).length / returns.length;
			tradingDays = portfolioData.length - 1;
		}

		return {
			portfolioValue: latestPortfolio.totalEquity,
			portfolioReturn,
			benchmarkValue: latestBenchmark?.value || 0,
			benchmarkReturn,
			alpha: portfolioReturn - benchmarkReturn,
			volatility,
			winRate,
			tradingDays,
		};
	}

	/**
	 * Ensure portfolio data has a baseline starting point
	 *
	 * @private
	 * @param results - Raw portfolio data
	 * @returns Portfolio data with baseline point
	 */
	private _ensureBaselinePoint(results: PortfolioPoint[]): PortfolioPoint[] {
		if (results.length === 0) {
			return [
				{
					date: new Date().toISOString().split('T')[0],
					totalEquity: this.BASELINE_INVESTMENT,
				},
			];
		}

		// Add baseline starting point if the first point isn't $100
		if (results[0].totalEquity !== this.BASELINE_INVESTMENT) {
			const startDate = new Date(
				new Date(results[0].date).getTime() - 24 * 60 * 60 * 1000
			)
				.toISOString()
				.split('T')[0];

			results.unshift({
				date: startDate,
				totalEquity: this.BASELINE_INVESTMENT,
			});
		}

		return results;
	}

	/**
	 * Sort portfolio data by date
	 *
	 * @private
	 * @param data - Portfolio data to sort
	 * @returns Sorted portfolio data
	 */
	private _sortByDate(data: PortfolioPoint[]): PortfolioPoint[] {
		return data.sort(
			(a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
		);
	}
}
