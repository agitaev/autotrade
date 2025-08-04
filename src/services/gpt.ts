import axios, { AxiosResponse } from 'axios';
import {
	Position,
	ChatGPTDecision,
	PortfolioMetrics,
	OpenAIResponse,
} from '../types';

interface ResearchCacheEntry {
	ticker: string;
	decision: ChatGPTDecision | null;
	timestamp: number;
	marketData: any;
	portfolioSnapshot: string; // Hash of portfolio state when decision was made
}

/**
 * Service for interacting with OpenAI's ChatGPT API for trading decisions
 *
 * Provides AI-powered portfolio analysis and trading recommendations specifically
 * tailored for micro-cap stock investing. Uses GPT-4 models for deep research
 * and strategic decision-making.
 *
 * Key capabilities:
 * - Portfolio analysis and trading recommendations
 * - Deep research reports on individual stocks
 * - Risk assessment and position sizing guidance
 * - Market trend analysis and catalyst identification
 *
 * @example
 * ```typescript
 * const chatGpt = new ChatGPTService();
 * const decisions = await chatGpt.getPortfolioDecision(portfolio, cash, metrics, marketData);
 * const research = await chatGpt.getDeepResearch('AAPL');
 * ```
 */
export class ChatGPTService {
	private readonly apiKey: string;
	private readonly baseUrl: string = 'https://api.openai.com/v1';
	private readonly defaultModel: string = 'gpt-4o';
	private readonly researchModel: string = 'gpt-4';
	
	// Research cache to avoid redundant API calls
	private readonly researchCache: Map<string, ResearchCacheEntry> = new Map();
	private readonly cacheExpirationMs: number = 15 * 60 * 1000; // 15 minutes

	/**
	 * Initialize ChatGPT service with API credentials
	 *
	 * @throws {Error} If OPENAI_API_KEY environment variable is not set
	 */
	constructor() {
		this.apiKey = process.env.OPENAI_API_KEY!;

		if (!this.apiKey) {
			throw new Error('OPENAI_API_KEY environment variable is required');
		}
	}

	/**
	 * Create a simple hash of portfolio state for cache comparison
	 * @private
	 */
	private _createPortfolioHash(portfolio: Position[], cash: number): string {
		const portfolioString = portfolio
			.map(p => `${p.ticker}:${p.shares}:${p.currentPrice}`)
			.sort()
			.join('|');
		return `${portfolioString}:${cash.toFixed(2)}`;
	}

	/**
	 * Check if cached research is still valid
	 * @private
	 */
	private _isCacheValid(entry: ResearchCacheEntry, currentPortfolioHash: string): boolean {
		const now = Date.now();
		const isNotExpired = (now - entry.timestamp) < this.cacheExpirationMs;
		const portfolioUnchanged = entry.portfolioSnapshot === currentPortfolioHash;
		
		return isNotExpired && portfolioUnchanged;
	}

	/**
	 * Clean expired cache entries
	 * @private
	 */
	private _cleanExpiredCache(): void {
		const now = Date.now();
		for (const [ticker, entry] of this.researchCache.entries()) {
			if ((now - entry.timestamp) >= this.cacheExpirationMs) {
				this.researchCache.delete(ticker);
			}
		}
	}

	/**
	 * Get AI-powered trading decisions based on current portfolio and market conditions
	 *
	 * Analyzes the current portfolio state, available cash, performance metrics,
	 * and market data to provide specific buy/sell/hold recommendations with reasoning.
	 *
	 * @param portfolio - Current portfolio positions
	 * @param cash - Available cash for trading
	 * @param metrics - Portfolio performance metrics
	 * @param marketData - Current market data for relevant stocks
	 * @returns Promise resolving to array of trading decisions
	 * @throws {Error} If API request fails or response cannot be parsed
	 *
	 * @example
	 * ```typescript
	 * const decisions = await chatGpt.getPortfolioDecision(
	 *   positions,
	 *   1000,
	 *   metrics,
	 *   marketData
	 * );
	 * decisions.forEach(decision => {
	 *   console.log(`${decision.action} ${decision.ticker}: ${decision.reasoning}`);
	 * });
	 * ```
	 */
	async getPortfolioDecision(
		portfolio: Position[],
		cash: number,
		metrics: PortfolioMetrics,
		marketData: any[]
	): Promise<ChatGPTDecision[]> {
		// Clean expired cache entries
		this._cleanExpiredCache();
		
		// Create portfolio snapshot for cache comparison
		const portfolioHash = this._createPortfolioHash(portfolio, cash);
		
		// Check cache for recent decisions on each ticker
		const cachedDecisions: ChatGPTDecision[] = [];
		const tickersToAnalyze: string[] = [];
		
		// Get all tickers (existing positions + new opportunities from market data)
		const allTickers = [
			...portfolio.map(p => p.ticker),
			...marketData.map(d => d.symbol).filter(symbol => !portfolio.find(p => p.ticker === symbol))
		];
		
		console.log(`🧠 AI Analysis Cache Check:`);
		
		for (const ticker of allTickers) {
			const cacheEntry = this.researchCache.get(ticker);
			
			if (cacheEntry && this._isCacheValid(cacheEntry, portfolioHash)) {
				console.log(`   💾 Cache HIT for ${ticker} (${Math.round((Date.now() - cacheEntry.timestamp) / 1000)}s ago)`);
				if (cacheEntry.decision) {
					cachedDecisions.push(cacheEntry.decision);
				}
			} else {
				console.log(`   🔍 Cache MISS for ${ticker} - needs analysis`);
				tickersToAnalyze.push(ticker);
			}
		}
		
		// If all tickers have valid cached decisions, return them
		if (tickersToAnalyze.length === 0) {
			console.log(`   ✅ All tickers cached - skipping OpenAI API call`);
			return cachedDecisions;
		}
		
		console.log(`   🤖 Analyzing ${tickersToAnalyze.length} tickers with OpenAI...`);
		
		// Build prompt only for tickers that need analysis
		const filteredMarketData = marketData.filter(d => tickersToAnalyze.includes(d.symbol));
		const filteredPortfolio = portfolio.filter(p => tickersToAnalyze.includes(p.ticker));
		
		const prompt = this._buildPortfolioPrompt(
			filteredPortfolio,
			cash,
			metrics,
			filteredMarketData
		);

		try {
			const response: AxiosResponse<OpenAIResponse> = await axios.post(
				`${this.baseUrl}/chat/completions`,
				{
					model: this.defaultModel,
					messages: [
						{
							role: 'system',
							content: this._getSystemPrompt(),
						},
						{
							role: 'user',
							content: prompt,
						},
					],
					temperature: 0.1,
					max_tokens: 2000,
				},
				{
					headers: {
						Authorization: `Bearer ${this.apiKey}`,
						'Content-Type': 'application/json',
					},
				}
			);

			const content = response.data.choices[0]?.message?.content;
			if (!content) {
				throw new Error('No content received from OpenAI API');
			}

			const newDecisions = this._parseDecisions(content);
			
			// Cache the new decisions
			const timestamp = Date.now();
			for (const decision of newDecisions) {
				if (decision.ticker) {
					this.researchCache.set(decision.ticker, {
						ticker: decision.ticker,
						decision,
						timestamp,
						marketData: marketData.find(d => d.symbol === decision.ticker),
						portfolioSnapshot: portfolioHash
					});
					console.log(`   💾 Cached decision for ${decision.ticker}: ${decision.action}`);
				}
			}
			
			// Also cache "no decision" for tickers that were analyzed but got no recommendation
			for (const ticker of tickersToAnalyze) {
				if (!newDecisions.find(d => d.ticker === ticker) && !this.researchCache.has(ticker)) {
					this.researchCache.set(ticker, {
						ticker,
						decision: null, // No action recommended
						timestamp,
						marketData: marketData.find(d => d.symbol === ticker),
						portfolioSnapshot: portfolioHash
					});
					console.log(`   💾 Cached "no action" for ${ticker}`);
				}
			}
			
			// Combine cached decisions with new decisions
			return [...cachedDecisions, ...newDecisions];
		} catch (error) {
			console.error('❌ Error getting ChatGPT decision:', error);
			if (axios.isAxiosError(error)) {
				throw new Error(
					`OpenAI API request failed: ${error.response?.status} ${error.response?.statusText}`
				);
			}
			throw new Error(`Failed to get portfolio decision: ${error}`);
		}
	}

	/**
	 * Generate comprehensive research report for a specific stock
	 *
	 * Provides in-depth analysis including fundamentals, recent news, technical analysis,
	 * risk factors, and investment thesis specifically focused on micro-cap opportunities.
	 *
	 * @param ticker - Stock symbol to research
	 * @returns Promise resolving to detailed research report as string
	 * @throws {Error} If API request fails
	 *
	 * @example
	 * ```typescript
	 * const research = await chatGpt.getDeepResearch('ABEO');
	 * console.log('Research Report:', research);
	 * ```
	 */
	async getDeepResearch(ticker: string): Promise<string> {
		if (!ticker || ticker.trim().length === 0) {
			throw new Error('Ticker symbol is required for research');
		}

		const prompt = this._buildResearchPrompt(ticker.toUpperCase());

		try {
			const response: AxiosResponse<OpenAIResponse> = await axios.post(
				`${this.baseUrl}/chat/completions`,
				{
					model: this.researchModel,
					messages: [
						{
							role: 'system',
							content:
								'You are a professional equity research analyst specializing in micro-cap stocks with expertise in fundamental analysis, technical analysis, and catalyst identification.',
						},
						{
							role: 'user',
							content: prompt,
						},
					],
					temperature: 0.2,
					max_tokens: 1500,
				},
				{
					headers: {
						Authorization: `Bearer ${this.apiKey}`,
						'Content-Type': 'application/json',
					},
				}
			);

			const content = response.data.choices[0]?.message?.content;
			if (!content) {
				throw new Error(`No research content received for ${ticker}`);
			}

			return content;
		} catch (error) {
			console.error(`❌ Error getting deep research for ${ticker}:`, error);
			if (axios.isAxiosError(error)) {
				throw new Error(
					`OpenAI API request failed: ${error.response?.status} ${error.response?.statusText}`
				);
			}
			throw new Error(`Failed to get research for ${ticker}: ${error}`);
		}
	}

	/**
	 * Get the system prompt for portfolio decision-making
	 *
	 * @private
	 * @returns System prompt string with trading guidelines
	 */
	private _getSystemPrompt(): string {
		return `You are a professional-grade portfolio strategist managing a micro-cap stock portfolio. 
You can only trade U.S.-listed micro-cap stocks (market cap under $300M) with full-share positions.
Your objective is to generate maximum alpha. You have complete control over position sizing, 
risk management, and stop-loss placement. You may concentrate or diversify at will.

CRITICAL: Respond with a JSON array of decisions in this EXACT format:
[
  {
    "action": "BUY" | "SELL" | "HOLD",
    "ticker": "SYMBOL",
    "shares": number,
    "stopLoss": number,
    "reasoning": "detailed explanation"
  }
]

Rules:
- Only recommend BUY for verified micro-cap stocks
- Include specific share counts and stop-loss prices
- Provide clear, actionable reasoning
- Consider risk management and position sizing
- Focus on asymmetric risk/reward opportunities`;
	}

	/**
	 * Build the portfolio analysis prompt
	 *
	 * @private
	 * @param portfolio - Current positions
	 * @param cash - Available cash
	 * @param metrics - Performance metrics
	 * @param marketData - Market data array
	 * @returns Formatted prompt string
	 */
	private _buildPortfolioPrompt(
		portfolio: Position[],
		cash: number,
		metrics: PortfolioMetrics,
		marketData: any[]
	): string {
		const portfolioSummary =
			portfolio.length > 0
				? portfolio
						.map(
							(pos) =>
								`${pos.ticker}: ${pos.shares} shares @ $${pos.buyPrice.toFixed(
									2
								)} (Stop: $${pos.stopLoss.toFixed(2)})`
						)
						.join('\n')
				: 'No positions';

		const marketSummary =
			marketData.length > 0
				? marketData
						.map(
							(data) =>
								`${data.symbol}: $${data.price.toFixed(2)} (${
									data.percentChange >= 0 ? '+' : ''
								}${data.percentChange.toFixed(2)}%)`
						)
						.join('\n')
				: 'No market data available';

		return `
CURRENT PORTFOLIO:
${portfolioSummary}

AVAILABLE CASH: $${cash.toFixed(2)}

PORTFOLIO METRICS:
- Total Equity: $${metrics.totalEquity.toFixed(2)}
- Total Return: ${(metrics.totalReturn * 100).toFixed(2)}%
- Sharpe Ratio: ${metrics.sharpeRatio.toFixed(3)}
- Win Rate: ${(metrics.winRate * 100).toFixed(1)}%

CURRENT MARKET DATA:
${marketSummary}

Based on this information, what trading decisions do you recommend? 
Consider:
1. Current position performance and stop-loss levels
2. Market momentum and sector trends
3. Available cash for new opportunities
4. Risk management and portfolio balance

Remember: You can only trade micro-cap stocks under $300M market cap.
Provide specific buy/sell decisions with reasoning.`.trim();
	}

	/**
	 * Build the research prompt for deep analysis
	 *
	 * @private
	 * @param ticker - Stock symbol to research
	 * @returns Formatted research prompt
	 */
	private _buildResearchPrompt(ticker: string): string {
		return `Provide comprehensive research analysis on ${ticker}. Structure your response as follows:

## Company Overview
- Business model and key operations
- Market position and competitive advantages

## Financial Analysis
- Recent quarterly/annual performance
- Key financial metrics and trends
- Balance sheet strength

## Recent Developments
- Major news, earnings, or announcements
- Management changes or strategic initiatives
- Regulatory or industry developments

## Technical Analysis
- Price trends and chart patterns
- Support/resistance levels
- Volume analysis

## Investment Thesis
- Bull case: Key catalysts and upside potential
- Bear case: Major risks and downside scenarios
- Target price range and timeframe

## Micro-Cap Specific Considerations
- Liquidity and trading volume
- Institutional ownership
- Small-cap specific risks and opportunities

Focus on actionable insights for micro-cap investing with specific entry/exit strategies.`;
	}

	/**
	 * Parse ChatGPT response into structured trading decisions
	 *
	 * @private
	 * @param content - Raw response content from ChatGPT
	 * @returns Array of parsed trading decisions
	 */
	private _parseDecisions(content: string): ChatGPTDecision[] {
		try {
			// First, try to extract JSON from the response
			const jsonMatch = content.match(/\[[\s\S]*?\]/);
			if (jsonMatch) {
				const parsed = JSON.parse(jsonMatch[0]);
				if (Array.isArray(parsed)) {
					// Validate each decision has required fields
					return parsed
						.filter(this._isValidDecision)
						.map(this._normalizeDecision);
				}
			}

			// Fallback: attempt to parse text-based decisions
			console.warn('⚠️  JSON parsing failed, attempting text parsing...');
			return this._parseTextDecisions(content);
		} catch (error) {
			console.error('❌ Error parsing ChatGPT decisions:', error);
			return [
				{
					action: 'HOLD',
					reasoning:
						'Unable to parse trading decisions from AI response. Manual review required.',
				},
			];
		}
	}

	/**
	 * Parse text-based decisions as fallback
	 *
	 * @private
	 * @param content - Response content to parse
	 * @returns Array of basic trading decisions
	 */
	private _parseTextDecisions(content: string): ChatGPTDecision[] {
		const decisions: ChatGPTDecision[] = [];
		const lines = content.split('\n');

		for (const line of lines) {
			if (
				line.includes('BUY') ||
				line.includes('SELL') ||
				line.includes('HOLD')
			) {
				decisions.push({
					action: 'HOLD',
					reasoning: line.trim(),
				});
			}
		}

		return decisions.length > 0
			? decisions
			: [
					{
						action: 'HOLD',
						reasoning: 'No clear trading signals detected in AI response',
					},
			  ];
	}

	/**
	 * Validate decision object structure
	 *
	 * @private
	 * @param decision - Decision object to validate
	 * @returns True if decision is valid
	 */
	private _isValidDecision(decision: any): boolean {
		return (
			decision &&
			typeof decision === 'object' &&
			['BUY', 'SELL', 'HOLD'].includes(decision.action) &&
			typeof decision.reasoning === 'string' &&
			decision.reasoning.length > 0
		);
	}

	/**
	 * Normalize and clean decision object
	 *
	 * @private
	 * @param decision - Raw decision object
	 * @returns Normalized decision
	 */
	private _normalizeDecision(decision: any): ChatGPTDecision {
		return {
			action: decision.action,
			ticker: decision.ticker?.toUpperCase() || undefined,
			shares:
				typeof decision.shares === 'number'
					? Math.max(0, Math.floor(decision.shares))
					: undefined,
			stopLoss:
				typeof decision.stopLoss === 'number'
					? Math.max(0, decision.stopLoss)
					: undefined,
			reasoning: decision.reasoning.trim(),
		};
	}
}
