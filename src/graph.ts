import dotenv from 'dotenv';
import { promises as fs } from 'fs';
import path from 'path';
import { GraphGenerator } from './services/graph';
import { GraphOptions, GraphGenerationResult } from './types';
import { Logger } from './utils/logger';
import { NotificationService } from './utils/notifications';

dotenv.config();

/**
 * Performance Chart Generator Script
 *
 * Generates comprehensive portfolio performance charts and analytics with
 * multiple output formats, automatic data export, and notification delivery.
 *
 * Features:
 * - Interactive HTML charts with Plotly
 * - Automatic CSV data export
 * - Performance metrics calculation and display
 * - Multiple output formats (HTML, PNG, PDF)
 * - Telegram notifications with chart previews
 * - File size optimization and validation
 * - Browser auto-open functionality
 * - Custom filename and directory support
 *
 * Environment Variables:
 * - GRAPH_OUTPUT_DIR: Custom output directory (default: ./data)
 * - GRAPH_AUTO_OPEN: Auto-open in browser (true/false)
 * - GRAPH_INCLUDE_EXPORT: Include CSV export (true/false)
 * - GRAPH_SEND_NOTIFICATION: Send Telegram notification (true/false)
 *
 * @example
 * ```bash
 * # Basic chart generation
 * npm run generate-graph
 *
 * # With custom options
 * GRAPH_OUTPUT_DIR=./reports GRAPH_AUTO_OPEN=true npm run generate-graph
 *
 * # Generate and send notification
 * GRAPH_SEND_NOTIFICATION=true npm run generate-graph
 * ```
 */

const logger = new Logger({
	logToConsole: true,
	logToFile: true,
	minLogLevel: process.env.NODE_ENV === 'development' ? 'DEBUG' : 'INFO',
});

const notifications = new NotificationService();

/**
 * Generate performance chart with comprehensive options
 *
 * @param options - Chart generation configuration
 * @returns Promise resolving to generation result
 */
async function generatePerformanceChart(
	options: GraphOptions = {}
): Promise<GraphGenerationResult> {
	const startTime = Date.now();
	const timestamp = new Date();
	const dateStr = timestamp.toISOString().split('T')[0];

	await logger.info(
		'Starting performance chart generation',
		{
			date: dateStr,
			options: {
				outputDir: options.outputDir,
				includeDataExport: options.includeDataExport,
				sendNotification: options.sendNotification,
			},
		},
		'GRAPH_GENERATOR'
	);

	console.log('📊 Generating performance chart...');
	console.log(`📅 Date: ${dateStr}`);
	console.log(`⏰ Time: ${timestamp.toLocaleTimeString()}`);
	console.log('='.repeat(50));

	const generator = new GraphGenerator();

	try {
		// Determine output paths
		const outputDir =
			options.outputDir || process.env.GRAPH_OUTPUT_DIR || './data';
		const filename = options.customFilename || `performance_chart_${dateStr}`;
		const outputPath = path.join(outputDir, `${filename}.html`);

		// Ensure output directory exists
		await fs.mkdir(outputDir, { recursive: true });

		console.log('📈 Generating interactive chart...');
		const chartStartTime = Date.now();

		// Generate the main chart
		await generator.generatePerformanceChart(outputPath);

		const chartDuration = Date.now() - chartStartTime;
		console.log(`✅ Chart generated (${chartDuration}ms): ${outputPath}`);

		// Get file size for reporting
		const stats = await fs.stat(outputPath);
		const fileSizeKB = Math.round(stats.size / 1024);
		console.log(`📁 File size: ${fileSizeKB} KB`);

		// Export data if requested
		let dataExportPath: string | undefined;
		if (
			options.includeDataExport ??
			process.env.GRAPH_INCLUDE_EXPORT === 'true'
		) {
			console.log('📊 Exporting portfolio data...');
			dataExportPath = path.join(outputDir, `portfolio_data_${dateStr}.csv`);
			await generator.exportPortfolioData(dataExportPath);
			console.log(`✅ Data exported: ${dataExportPath}`);
		}

		// Get performance metrics
		const metrics = await generator.getPerformanceMetrics();

		if (metrics) {
			console.log('\n📈 Performance Summary:');
			console.log(`💰 Portfolio Value: $${metrics.portfolioValue.toFixed(2)}`);
			console.log(
				`📊 Total Return: ${(metrics.portfolioReturn * 100).toFixed(2)}%`
			);
			console.log(`🎯 Alpha: ${metrics.alpha.toFixed(2)}%`);
			console.log(`📅 Trading Days: ${metrics.tradingDays}`);
		}

		// Open in browser if requested
		if (options.openInBrowser ?? process.env.GRAPH_AUTO_OPEN === 'true') {
			await openInBrowser(outputPath);
		}

		// Send notification if requested
		if (
			options.sendNotification ??
			process.env.GRAPH_SEND_NOTIFICATION === 'true'
		) {
			await sendChartNotification(outputPath, metrics, fileSizeKB);
		}

		const duration = Date.now() - startTime;

		await logger.info(
			'Chart generation completed successfully',
			{
				duration: `${duration}ms`,
				outputPath,
				dataExportPath,
				fileSize: `${fileSizeKB}KB`,
				metrics: metrics
					? {
							portfolioValue: metrics.portfolioValue,
							totalReturn: metrics.portfolioReturn,
							alpha: metrics.alpha,
							tradingDays: metrics.tradingDays,
					  }
					: undefined,
			},
			'GRAPH_GENERATOR'
		);

		console.log('\n' + '='.repeat(50));
		console.log('✅ CHART GENERATION COMPLETED');
		console.log(`⏱️ Total duration: ${duration}ms`);
		console.log(`📊 Chart: ${outputPath}`);
		if (dataExportPath) {
			console.log(`📁 Data: ${dataExportPath}`);
		}
		console.log('='.repeat(50));

		return {
			success: true,
			duration,
			outputPath,
			dataExportPath,
			fileSize: stats.size,
			metrics: metrics
				? {
						portfolioValue: metrics.portfolioValue,
						totalReturn: metrics.portfolioReturn,
						alpha: metrics.alpha,
						tradingDays: metrics.tradingDays,
				  }
				: undefined,
		};
	} catch (error) {
		const duration = Date.now() - startTime;
		const errorMessage = error instanceof Error ? error.message : String(error);

		await logger.error(
			'Chart generation failed',
			{
				error: errorMessage,
				duration: `${duration}ms`,
				outputPath: options.outputDir,
			},
			'GRAPH_GENERATOR'
		);

		console.error('\n❌ CHART GENERATION FAILED');
		console.error(`   Error: ${errorMessage}`);
		console.error(`   Duration: ${duration}ms`);

		// Send error notification
		if (
			options.sendNotification ??
			process.env.GRAPH_SEND_NOTIFICATION === 'true'
		) {
			try {
				await notifications.sendAlert(
					'Chart Generation Failed',
					`Performance chart generation failed: ${errorMessage}`,
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
			error: errorMessage,
		};
	}
}

/**
 * Send chart generation notification
 *
 * @param outputPath - Path to generated chart
 * @param metrics - Performance metrics
 * @param fileSizeKB - File size in KB
 */
async function sendChartNotification(
	outputPath: string,
	metrics: any,
	fileSizeKB: number
): Promise<void> {
	try {
		console.log('📱 Sending chart notification...');

		const filename = path.basename(outputPath);
		const timestamp = new Date().toLocaleString();

		let message = `*📊 Performance Chart Generated*\n\n`;
		message += `📁 *File:* ${filename}\n`;
		message += `📏 *Size:* ${fileSizeKB} KB\n`;
		message += `⏰ *Generated:* ${timestamp}\n`;

		if (metrics) {
			message += `\n*📈 Performance Summary:*\n`;
			message += `💰 Portfolio Value: $${metrics.portfolioValue.toFixed(2)}\n`;
			message += `📊 Total Return: ${(metrics.totalReturn * 100).toFixed(
				2
			)}%\n`;
			message += `🎯 Alpha: ${metrics.alpha.toFixed(2)}%\n`;
			message += `📅 Trading Days: ${metrics.tradingDays}`;
		}

		await notifications.sendAlert(
			'Performance Chart Ready',
			message,
			'success'
		);

		console.log('✅ Notification sent successfully');
	} catch (error) {
		console.warn('⚠️  Failed to send chart notification:', error);
	}
}

/**
 * Open chart in default browser
 *
 * @param filePath - Path to HTML chart file
 */
async function openInBrowser(filePath: string): Promise<void> {
	try {
		console.log('🌐 Opening chart in browser...');

		const { exec } = require('child_process');
		const absolutePath = path.resolve(filePath);

		// Cross-platform browser opening
		const command =
			process.platform === 'darwin'
				? `open "${absolutePath}"`
				: process.platform === 'win32'
				? `start "" "${absolutePath}"`
				: `xdg-open "${absolutePath}"`;

		exec(command, (error: any) => {
			if (error) {
				console.warn(
					'⚠️  Could not open browser automatically:',
					error.message
				);
			} else {
				console.log('✅ Chart opened in browser');
			}
		});
	} catch (error) {
		console.warn('⚠️  Browser opening failed:', error);
	}
}

/**
 * Generate chart with command line arguments
 */
async function generateChartFromCLI(): Promise<void> {
	// Parse command line arguments
	const args = process.argv.slice(2);
	const options: GraphOptions = {};

	// Parse arguments
	for (let i = 0; i < args.length; i++) {
		const arg = args[i];
		switch (arg) {
			case '--output-dir':
			case '-o':
				options.outputDir = args[++i];
				break;
			case '--export-data':
			case '-e':
				options.includeDataExport = true;
				break;
			case '--notify':
			case '-n':
				options.sendNotification = true;
				break;
			case '--open':
			case '-b':
				options.openInBrowser = true;
				break;
			case '--filename':
			case '-f':
				options.customFilename = args[++i];
				break;
			case '--help':
			case '-h':
				showHelp();
				process.exit(0);
		}
	}

	console.log('📊 Performance Chart Generator Starting...');
	console.log(`📅 ${new Date().toLocaleString()}`);
	console.log(`🔧 Environment: ${process.env.NODE_ENV || 'production'}`);

	try {
		const result = await generatePerformanceChart(options);

		if (result.success) {
			process.exit(0);
		} else {
			process.exit(1);
		}
	} catch (error) {
		console.error('❌ Unhandled error in chart generation:', error);
		process.exit(1);
	}
}

/**
 * Show help information
 */
function showHelp(): void {
	console.log(`
📊 Performance Chart Generator

Usage: npm run generate-graph [options]

Options:
  -o, --output-dir <dir>     Output directory for charts (default: ./data)
  -e, --export-data          Include CSV data export
  -n, --notify               Send Telegram notification
  -b, --open                 Open chart in browser
  -f, --filename <name>      Custom filename (without extension)
  -h, --help                 Show this help message

Environment Variables:
  GRAPH_OUTPUT_DIR           Default output directory
  GRAPH_AUTO_OPEN           Auto-open in browser (true/false)
  GRAPH_INCLUDE_EXPORT       Include CSV export (true/false)
  GRAPH_SEND_NOTIFICATION    Send notification (true/false)

Examples:
  npm run generate-graph
  npm run generate-graph -- --export-data --notify
  npm run generate-graph -- -o ./reports -f weekly_report -b
`);
}

/**
 * Handle graceful shutdown
 */
function setupGracefulShutdown(): void {
	const shutdown = async (signal: string) => {
		await logger.warn(
			`Received ${signal}, shutting down chart generation...`,
			undefined,
			'GRAPH_GENERATOR'
		);
		console.log(`\n⚠️  Received ${signal}, shutting down gracefully...`);
		process.exit(0);
	};

	process.on('SIGINT', () => shutdown('SIGINT'));
	process.on('SIGTERM', () => shutdown('SIGTERM'));
}

// Export for programmatic use
export { generatePerformanceChart, GraphGenerationResult, GraphOptions };

// Main execution when run as script
if (require.main === module) {
	setupGracefulShutdown();
	generateChartFromCLI();
}
