import dotenv from 'dotenv';
import { promises as fs } from 'fs';
import path from 'path';
import { TradingBot } from './bot';
import { ResearchOptions, ResearchResult } from './types';
import { Logger } from './utils/logger';
import { NotificationService } from './utils/notifications';

dotenv.config();

/**
 * Weekly Deep Research Script
 *
 * Performs comprehensive AI-powered research on current portfolio holdings
 * and screens for new micro-cap investment opportunities. Generates detailed
 * research reports and delivers actionable insights via multiple channels.
 *
 * Features:
 * - Deep AI analysis of current portfolio positions
 * - Micro-cap opportunity screening and evaluation
 * - Comprehensive research report generation
 * - Performance comparison and market analysis
 * - Telegram notifications with research summaries
 * - Automatic report saving and archiving
 * - Rate limiting and API optimization
 * - Error recovery and retry logic
 *
 * Environment Variables:
 * - RESEARCH_SAVE_REPORTS: Save reports to file (true/false)
 * - RESEARCH_OUTPUT_DIR: Custom report directory (default: ./research)
 * - RESEARCH_MAX_TARGETS: Maximum stocks to research (default: 10)
 * - RESEARCH_SEND_NOTIFICATION: Send Telegram notification (true/false)
 * - RESEARCH_INCLUDE_SCREENING: Include opportunity screening (true/false)
 *
 * @example
 * ```bash
 * # Basic weekly research
 * npm run weekly-research
 *
 * # With custom options
 * RESEARCH_SAVE_REPORTS=true RESEARCH_MAX_TARGETS=15 npm run weekly-research
 *
 * # Research with notification
 * RESEARCH_SEND_NOTIFICATION=true npm run weekly-research
 * ```
 */

const logger = new Logger({
	logToConsole: true,
	logToFile: true,
	minLogLevel: process.env.NODE_ENV === 'development' ? 'DEBUG' : 'INFO',
});

const notifications = new NotificationService();

/**
 * Execute comprehensive weekly research workflow
 *
 * @param options - Research configuration options
 * @returns Promise resolving to research results
 */
async function executeWeeklyResearch(
	options: ResearchOptions = {}
): Promise<ResearchResult> {
	const startTime = Date.now();
	const timestamp = new Date();
	const dateStr = timestamp.toISOString().split('T')[0];
	const weekNumber = getWeekNumber(timestamp);

	await logger.info(
		'Starting weekly deep research',
		{
			date: dateStr,
			week: weekNumber,
			options: {
				saveReport: options.saveReport,
				maxTargets: options.maxResearchTargets,
				includeScreening: options.includeScreening,
			},
		},
		'WEEKLY_RESEARCH'
	);

	console.log('🔍 Starting weekly deep research...');
	console.log('='.repeat(60));
	console.log(`📅 Research Date: ${dateStr}`);
	console.log(`📊 Week Number: ${weekNumber}`);
	console.log(`⏰ Start Time: ${timestamp.toLocaleTimeString()}`);
	console.log(`🔧 Mode: ${process.env.NODE_ENV || 'production'}`);
	console.log('='.repeat(60));

	let bot: TradingBot | undefined;
	let reportContent: string[] = [];

	try {
		// Initialize trading bot
		console.log('\n🚀 Initializing trading bot...');
		bot = new TradingBot();
		await bot.initialize();

		// Execute research workflow
		console.log('\n📈 Executing research workflow...');
		const researchResults = await bot.runWeeklyDeepResearch();

		// Generate comprehensive report
		if (options.saveReport ?? process.env.RESEARCH_SAVE_REPORTS === 'true') {
			console.log('\n📝 Generating research report...');
			reportContent = await generateResearchReport(researchResults, timestamp);

			const reportPath = await saveResearchReport(
				reportContent,
				options.reportDir,
				options.customReportName,
				dateStr
			);

			console.log(`✅ Research report saved: ${reportPath}`);
		}

		// Send notification summary
		if (
			options.sendNotification ??
			process.env.RESEARCH_SEND_NOTIFICATION === 'true'
		) {
			console.log('\n📱 Sending research notification...');
			await sendResearchNotification(researchResults, reportContent.length > 0);
		}

		// Display completion summary
		const duration = Date.now() - startTime;
		await displayResearchSummary(researchResults, duration);

		await logger.info(
			'Weekly research completed successfully',
			{
				duration: `${duration}ms`,
				currentHoldings: researchResults.currentHoldings.length,
				researchedTickers: researchResults.researchedTickers.length,
				screenedOpportunities: researchResults.screenedOpportunities.length,
				topPicks: researchResults.topPicks.length,
				totalReports: researchResults.researchCount,
			},
			'WEEKLY_RESEARCH'
		);

		return {
			success: true,
			duration,
			timestamp,
			researchCount: researchResults.researchCount,
			currentHoldings: researchResults.currentHoldings,
			researchedTickers: researchResults.researchedTickers,
			screenedOpportunities: researchResults.screenedOpportunities,
			topPicks: researchResults.topPicks,
			totalResearchReports: researchResults.researchCount,
			reportPath:
				reportContent.length > 0
					? `./research/weekly_research_${dateStr}.md`
					: undefined,
		};
	} catch (error) {
		const duration = Date.now() - startTime;
		const errorMessage = error instanceof Error ? error.message : String(error);

		await logger.error(
			'Weekly research failed',
			{
				error: errorMessage,
				duration: `${duration}ms`,
				step: determineFailureStep(error),
			},
			'WEEKLY_RESEARCH'
		);

		console.error('\n❌ WEEKLY RESEARCH FAILED');
		console.error(`   Error: ${errorMessage}`);
		console.error(`   Duration: ${duration}ms`);

		// Send error notification
		if (
			options.sendNotification ??
			process.env.RESEARCH_SEND_NOTIFICATION === 'true'
		) {
			try {
				await notifications.sendAlert(
					'Weekly Research Failed',
					`Research workflow failed: ${errorMessage}`,
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
			researchCount: 0,
			currentHoldings: [],
			researchedTickers: [],
			screenedOpportunities: [],
			topPicks: [],
			totalResearchReports: 0,
			error: errorMessage,
		};
	}
}

/**
 * Generate comprehensive research report
 *
 * @param results - Research execution results
 * @param timestamp - Research timestamp
 * @returns Promise resolving to report content lines
 */
async function generateResearchReport(
	results: any,
	timestamp: Date
): Promise<string[]> {
	const reportLines: string[] = [];
	const dateStr = timestamp.toISOString().split('T')[0];
	const weekNumber = getWeekNumber(timestamp);

	// Report header
	reportLines.push(`# Weekly Deep Research Report`);
	reportLines.push(`**Date:** ${dateStr}`);
	reportLines.push(`**Week:** ${weekNumber}`);
	reportLines.push(`**Generated:** ${timestamp.toLocaleString()}`);
	reportLines.push('');

	// Executive summary
	reportLines.push('## Executive Summary');
	reportLines.push(
		`- **Current Holdings Analyzed:** ${results.currentHoldings.length}`
	);
	reportLines.push(
		`- **Research Reports Generated:** ${results.researchCount}`
	);
	reportLines.push(
		`- **New Opportunities Screened:** ${results.screenedOpportunities.length}`
	);
	reportLines.push(`- **Top Picks Identified:** ${results.topPicks.length}`);
	reportLines.push('');

	// Current holdings analysis
	if (results.currentHoldings.length > 0) {
		reportLines.push('## Current Holdings Analysis');
		reportLines.push('The following positions were analyzed in detail:');
		reportLines.push('');
		results.currentHoldings.forEach((ticker: string, index: number) => {
			reportLines.push(
				`${index + 1}. **${ticker}** - Comprehensive analysis completed`
			);
		});
		reportLines.push('');
	}

	// New opportunities
	if (results.screenedOpportunities.length > 0) {
		reportLines.push('## New Investment Opportunities');
		reportLines.push(
			`Screened ${results.screenedOpportunities.length} potential micro-cap investments:`
		);
		reportLines.push('');
		results.screenedOpportunities.forEach((ticker: string, index: number) => {
			reportLines.push(`- ${ticker}`);
		});
		reportLines.push('');
	}

	// Top picks
	if (results.topPicks.length > 0) {
		reportLines.push('## Top Picks for Deep Analysis');
		reportLines.push(
			'The following stocks received detailed research reports:'
		);
		reportLines.push('');
		results.topPicks.forEach((ticker: string, index: number) => {
			reportLines.push(
				`${index + 1}. **${ticker}** - Deep analysis report generated`
			);
		});
		reportLines.push('');
	}

	// Recommendations
	reportLines.push('## Key Recommendations');
	reportLines.push("Based on this week's research:");
	reportLines.push('');
	reportLines.push(
		'1. **Portfolio Review:** Analyze detailed reports for current holdings'
	);
	reportLines.push(
		'2. **Opportunity Assessment:** Evaluate top picks for potential positions'
	);
	reportLines.push(
		'3. **Risk Management:** Monitor stop-loss levels and position sizing'
	);
	reportLines.push(
		'4. **Market Monitoring:** Continue tracking screened opportunities'
	);
	reportLines.push('');

	// Footer
	reportLines.push('---');
	reportLines.push(
		'*This report was generated automatically by the ChatGPT Trading Bot*'
	);
	reportLines.push(
		`*Research completed in ${Math.round(
			(Date.now() - timestamp.getTime()) / 1000
		)} seconds*`
	);

	return reportLines;
}

/**
 * Save research report to file
 *
 * @param content - Report content lines
 * @param reportDir - Custom report directory
 * @param customName - Custom report name
 * @param dateStr - Date string for filename
 * @returns Promise resolving to saved file path
 */
async function saveResearchReport(
	content: string[],
	reportDir?: string,
	customName?: string,
	dateStr?: string
): Promise<string> {
	const outputDir =
		reportDir || process.env.RESEARCH_OUTPUT_DIR || './research';
	const filename = customName || `weekly_research_${dateStr}`;
	const reportPath = path.join(outputDir, `${filename}.md`);

	// Ensure report directory exists
	await fs.mkdir(outputDir, { recursive: true });

	// Write report to file
	await fs.writeFile(reportPath, content.join('\n'), 'utf8');

	return reportPath;
}

/**
 * Send research completion notification
 *
 * @param results - Research results
 * @param reportSaved - Whether report was saved
 */
async function sendResearchNotification(
	results: any,
	reportSaved: boolean
): Promise<void> {
	try {
		const timestamp = new Date().toLocaleString();
		const weekNumber = getWeekNumber(new Date());

		let message = `*🔍 Weekly Research Completed*\n\n`;
		message += `📅 *Week:* ${weekNumber}\n`;
		message += `⏰ *Completed:* ${timestamp}\n\n`;
		message += `*📊 Research Summary:*\n`;
		message += `📋 Current Holdings: ${results.currentHoldings.length}\n`;
		message += `📝 Research Reports: ${results.researchCount}\n`;
		message += `🔎 Opportunities Screened: ${results.screenedOpportunities.length}\n`;
		message += `🎯 Top Picks Analyzed: ${results.topPicks.length}\n`;

		if (results.topPicks.length > 0) {
			message += `\n*🎯 Top Picks:*\n`;
			results.topPicks.forEach((ticker: string) => {
				message += `• ${ticker}\n`;
			});
		}

		if (reportSaved) {
			message += `\n📄 *Report saved for detailed review*`;
		}

		await notifications.sendAlert(
			'Weekly Research Complete',
			message,
			'success'
		);

		console.log('✅ Research notification sent successfully');
	} catch (error) {
		console.warn('⚠️  Failed to send research notification:', error);
	}
}

/**
 * Display comprehensive research summary
 *
 * @param results - Research results
 * @param duration - Execution duration
 */
async function displayResearchSummary(
	results: any,
	duration: number
): Promise<void> {
	console.log('\n' + '='.repeat(60));
	console.log('✅ WEEKLY RESEARCH COMPLETED SUCCESSFULLY');
	console.log('='.repeat(60));
	console.log(`⏱️ Total Duration: ${duration}ms`);
	console.log(`📊 Research Statistics:`);
	console.log(
		`   📋 Current Holdings Analyzed: ${results.currentHoldings.length}`
	);
	console.log(`   📝 Research Reports Generated: ${results.researchCount}`);
	console.log(
		`   🔎 Opportunities Screened: ${results.screenedOpportunities.length}`
	);
	console.log(`   🎯 Top Picks Researched: ${results.topPicks.length}`);

	if (results.currentHoldings.length > 0) {
		console.log(`\n📋 Current Holdings: ${results.currentHoldings.join(', ')}`);
	}

	if (results.topPicks.length > 0) {
		console.log(`🎯 Top Picks: ${results.topPicks.join(', ')}`);
	}

	if (results.screenedOpportunities.length > 0) {
		console.log(`🔎 Screened: ${results.screenedOpportunities.join(', ')}`);
	}

	console.log('='.repeat(60));
}

/**
 * Determine failure step from error context
 *
 * @param error - The error that occurred
 * @returns Step identifier
 */
function determineFailureStep(error: any): string {
	const errorMessage =
		error instanceof Error
			? error.message.toLowerCase()
			: String(error).toLowerCase();

	if (
		errorMessage.includes('initialize') ||
		errorMessage.includes('connection')
	) {
		return 'initialization';
	} else if (
		errorMessage.includes('research') ||
		errorMessage.includes('openai')
	) {
		return 'research_execution';
	} else if (
		errorMessage.includes('screen') ||
		errorMessage.includes('market')
	) {
		return 'opportunity_screening';
	} else if (errorMessage.includes('report') || errorMessage.includes('file')) {
		return 'report_generation';
	} else {
		return 'unknown';
	}
}

/**
 * Get ISO week number for a date
 *
 * @param date - Date to get week number for
 * @returns Week number
 */
function getWeekNumber(date: Date): number {
	const d = new Date(
		Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())
	);
	const dayNum = d.getUTCDay() || 7;
	d.setUTCDate(d.getUTCDate() + 4 - dayNum);
	const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
	return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

/**
 * Main weekly research execution function
 */
async function runWeeklyResearch(): Promise<void> {
	// Parse environment options
	const options: ResearchOptions = {
		saveReport: process.env.RESEARCH_SAVE_REPORTS === 'true',
		reportDir: process.env.RESEARCH_OUTPUT_DIR,
		maxResearchTargets: parseInt(process.env.RESEARCH_MAX_TARGETS || '10'),
		includeScreening: process.env.RESEARCH_INCLUDE_SCREENING !== 'false',
		sendNotification: process.env.RESEARCH_SEND_NOTIFICATION === 'true',
	};

	console.log('🔍 Weekly Research Script Starting...');
	console.log(`📅 ${new Date().toLocaleString()}`);
	console.log(`🔧 Environment: ${process.env.NODE_ENV || 'production'}`);

	try {
		const result = await executeWeeklyResearch(options);

		if (result.success) {
			console.log('\n🎯 Research execution summary:');
			console.log(`   ✅ Success: ${result.success}`);
			console.log(`   ⏱️ Duration: ${result.duration}ms`);
			console.log(`   📊 Total Reports: ${result.totalResearchReports}`);
			if (result.reportPath) {
				console.log(`   📄 Report: ${result.reportPath}`);
			}

			process.exit(0);
		} else {
			console.log('\n💥 Research execution failed:');
			console.log(`   ❌ Success: ${result.success}`);
			console.log(`   ⏱️ Duration: ${result.duration}ms`);
			console.log(`   ❌ Error: ${result.error}`);

			process.exit(1);
		}
	} catch (error) {
		console.error('❌ Unhandled error in weekly research:', error);
		process.exit(1);
	}
}

/**
 * Handle graceful shutdown on process signals
 */
function setupGracefulShutdown(): void {
	const shutdown = async (signal: string) => {
		await logger.warn(
			`Received ${signal}, shutting down weekly research...`,
			undefined,
			'WEEKLY_RESEARCH'
		);
		console.log(`\n⚠️  Received ${signal}, shutting down gracefully...`);
		process.exit(0);
	};

	process.on('SIGINT', () => shutdown('SIGINT'));
	process.on('SIGTERM', () => shutdown('SIGTERM'));
}

// Export for programmatic use
export { executeWeeklyResearch, ResearchResult, ResearchOptions };

// Main execution when run as script
if (require.main === module) {
	setupGracefulShutdown();
	runWeeklyResearch();
}
