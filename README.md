# ChatGPT Trading Bot

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D20.0.0-brightgreen)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue)](https://www.typescriptlang.org/)

> AI-powered automated trading bot with ChatGPT analysis, Alpaca integration, and comprehensive portfolio management for micro-cap stock investing.

## Features

### AI-Powered Analysis

- **ChatGPT Integration**: Advanced portfolio analysis and trading recommendations
- **Deep Research**: Comprehensive stock analysis with market insights
- **Risk Assessment**: Intelligent position sizing and stop-loss management
- **Market Screening**: Automated micro-cap opportunity identification

### Trading & Portfolio Management

- **Alpaca Integration**: Paper trading and live trading capabilities
- **Real-time Monitoring**: Continuous portfolio and market data tracking
- **Stop-loss Protection**: Automated risk management with customizable thresholds
- **Performance Analytics**: Comprehensive metrics and reporting

### Reporting & Visualization

- **Interactive Charts**: Dynamic performance visualization with Plotly
- **Daily Summaries**: Automated portfolio status reports
- **Weekly Research**: In-depth market analysis and opportunities
- **Export Capabilities**: CSV data export for external analysis

### Notifications & Monitoring

- **Telegram Integration**: Real-time alerts and portfolio updates
- **Health Monitoring**: System status checks and error reporting
- **Scheduled Operations**: Automated daily and weekly workflows
- **Emergency Controls**: Immediate trading halt capabilities

### Safety & Security

- **Simulation Mode**: Safe testing environment before live trading
- **Environment Validation**: Comprehensive configuration checks
- **Error Recovery**: Robust error handling with automatic retry logic
- **Audit Logging**: Complete trade and system activity logs

## Quick Start

### Prerequisites

- **Node.js** >= 20.0.0
- **npm** >= 10.0.0
- **Alpaca Account** (for trading API access)
- **OpenAI API Key** (for ChatGPT analysis)
- **Telegram Bot** (optional, for notifications)

### Installation

1. **Clone the repository**

   ```bash
   git clone https://github.com/your-username/chatgpt-trading-bot.git
   cd chatgpt-trading-bot
   ```

2. **Install dependencies**

   ```bash
   npm install
   ```

3. **Configure environment variables**

   ```bash
   cp .env.example .env
   # Edit .env with your API keys
   ```

4. **Validate setup**
   ```bash
   npm run ping
   ```

### Environment Configuration

Create a `.env` file with the following variables:

```env
# Required: Trading API
ALPACA_API_KEY=your_alpaca_api_key
ALPACA_SECRET_KEY=your_alpaca_secret_key
ALPACA_BASE_URL=https://paper-api.alpaca.markets

# Required: AI Analysis
OPENAI_API_KEY=your_openai_api_key

# Optional: Notifications
TELEGRAM_BOT_TOKEN=your_telegram_bot_token
TELEGRAM_CHAT_ID=your_telegram_chat_id

# Trading Configuration
ENABLE_AUTOMATED_TRADING=false  # Set to true for live trading

# Scheduling (optional)
CRON_DAILY_SCHEDULE=0 16 * * 1-5      # 4 PM ET, Mon-Fri
CRON_WEEKLY_SCHEDULE=0 14 * * 0       # 2 PM ET, Sunday
CRON_REPORT_SCHEDULE=0 18 * * 0       # 6 PM ET, Sunday
```

## Available Commands

### Core Operations

```bash
npm run dev                     # Interactive command mode
npm run analysis:ai             # AI-powered portfolio analysis
npm run analysis:full           # Complete analysis workflow
npm run research                # Weekly deep research
npm run report                  # Generate performance charts
npm run stop                    # Emergency stop (cancel all orders)
```

### System Testing

```bash
npm run ping                    # System health check
npm run ping:alpaca             # Test Alpaca API connection
npm run ping:openai             # Test OpenAI configuration
npm run ping:yahoo              # Test Yahoo Finance connection
npm run ping:telegram           # Test Telegram notifications
```

### Automation

```bash
npm run auto                    # Start automated trading mode
npm run analysis:only           # AI analysis without portfolio updates
npm run update:only             # Portfolio update without AI analysis
```

### Utilities

```bash
npm run build                   # Compile TypeScript
npm run clean                   # Clean build files and logs
npm run logs                    # View real-time logs
```

## Usage Examples

### Daily Portfolio Management

```bash
# Run daily portfolio update with notifications
UPDATE_SEND_NOTIFICATION=true npm run dev daily

# Force update outside market hours
UPDATE_FORCE_EXECUTION=true npm run dev daily

# Complete daily workflow (update + AI analysis)
npm run analysis:full
```

### Research & Analysis

```bash
# Weekly research with saved reports
RESEARCH_SAVE_REPORTS=true npm run research

# Generate performance chart and open in browser
GRAPH_AUTO_OPEN=true npm run report

# Screen for new micro-cap opportunities
npm run dev screen-microcaps
```

### Emergency Operations

```bash
# Emergency stop with reason
FORCE_STOP=true STOP_REASON="Market volatility" npm run stop

# System diagnostics
npm run ping

# Portfolio status check
npm run dev portfolio-status
```

### Automated Trading

```bash
# Start automated mode (runs continuously)
npm run auto

# Production automated mode
NODE_ENV=production npm run auto
```

## Architecture

```
src/
├── bot.ts                      # Main trading bot class
├── index.ts                    # Application entry point
├── services/
│   ├── alpaca.ts              # Alpaca API integration
│   ├── gpt.ts                 # ChatGPT AI analysis
│   ├── yahoo.ts               # Market data service
│   ├── manager.ts             # Portfolio management
│   └── graph.ts               # Chart generation
├── utils/
│   ├── logger.ts              # Logging system
│   ├── notifications.ts       # Telegram integration
│   └── healthcheck.ts         # System monitoring
└── types/
    └── index.ts               # TypeScript definitions
```

## 📊 Key Features

### AI-Powered Decision Making

- **Portfolio Analysis**: Comprehensive evaluation of current positions
- **Market Research**: Deep analysis of individual stocks and opportunities
- **Risk Management**: Intelligent stop-loss and position sizing recommendations
- **Trend Analysis**: Market sentiment and momentum assessment

### Automated Operations

- **Daily Updates**: Portfolio monitoring and price updates
- **Weekly Research**: Comprehensive market analysis and opportunity screening
- **Performance Reporting**: Automated chart generation and data export
- **Health Monitoring**: Continuous system status checks

### Safety Features

- **Simulation Mode**: Test strategies without real money
- **Emergency Controls**: Immediate trading halt capabilities
- **Error Recovery**: Robust error handling and retry logic
- **Audit Trail**: Complete logging of all operations and decisions

## 🔧 Configuration Options

### Trading Configuration

```env
ENABLE_AUTOMATED_TRADING=false    # Enable live trading
ALPACA_BASE_URL=paper-api         # Use paper trading endpoint
```

### Notification Settings

```env
UPDATE_SEND_NOTIFICATION=true     # Send daily update notifications
RESEARCH_SEND_NOTIFICATION=true   # Send research completion alerts
GRAPH_SEND_NOTIFICATION=true      # Send chart generation notifications
```

### Scheduling Options

```env
UPDATE_FORCE_EXECUTION=false      # Allow updates outside market hours
RESEARCH_SAVE_REPORTS=true        # Save research reports to files
GRAPH_AUTO_OPEN=false             # Auto-open charts in browser
```

## Performance Metrics

The bot tracks comprehensive performance metrics including:

- **Total Return**: Overall portfolio performance
- **Sharpe Ratio**: Risk-adjusted return measurement
- **Sortino Ratio**: Downside deviation analysis
- **Maximum Drawdown**: Peak-to-trough loss analysis
- **Win Rate**: Percentage of profitable trades
- **Alpha**: Performance vs. market benchmarks

## Risk Management

### Built-in Safety Features

- **Stop-Loss Orders**: Automated position protection
- **Position Sizing**: AI-driven risk allocation
- **Market Cap Validation**: Micro-cap stock verification
- **Health Checks**: Continuous system monitoring
- **Emergency Stops**: Immediate trading halt capability

### Trading Limits

- **Micro-Cap Focus**: Market cap under $300M
- **Full Share Positions**: No fractional shares
- **Risk Controls**: Automated stop-loss placement
- **Cash Management**: Buying power validation

## Telegram Integration

Set up Telegram notifications for real-time updates:

1. **Create a Telegram Bot**

   - Message @BotFather on Telegram
   - Use `/newbot` command
   - Save the bot token

2. **Get Your Chat ID**

   - Message @userinfobot
   - Note your numeric user ID

3. **Configure Environment**

   ```env
   TELEGRAM_BOT_TOKEN=123456789:ABCdefGHIjklMNOpqrsTUVwxyz
   TELEGRAM_CHAT_ID=123456789
   ```

4. **Test Notifications**
   ```bash
   npm run ping:telegram
   ```

## Automated Scheduling

The bot supports automated operations with customizable schedules:

### Default Schedule

- **Daily Operations**: 4:00 PM ET (after market close), Monday-Friday
- **Weekly Research**: 2:00 PM ET, Sunday
- **Weekly Reports**: 6:00 PM ET, Sunday
- **Health Checks**: Every 6 hours

### Custom Scheduling

```env
CRON_DAILY_SCHEDULE="0 16 * * 1-5"    # Custom daily schedule
CRON_WEEKLY_SCHEDULE="0 14 * * 0"     # Custom weekly schedule
CRON_REPORT_SCHEDULE="0 18 * * 0"     # Custom report schedule
```

## Troubleshooting

### Common Issues

1. **API Connection Failures**

   ```bash
   npm run ping:alpaca    # Test Alpaca connection
   npm run ping:openai    # Test OpenAI configuration
   npm run ping:yahoo     # Test market data connection
   ```

2. **Environment Configuration**

   ```bash
   npm run dev validate-env    # Check all environment variables
   ```

3. **Trading Permissions**

   - Ensure Alpaca account has paper trading enabled
   - Verify API keys have correct permissions
   - Check account status and restrictions

4. **Market Data Issues**
   ```bash
   npm run ping:yahoo    # Test Yahoo Finance connection
   ```

### Debug Mode

```bash
NODE_ENV=development npm run dev daily    # Run with debug logging
npm run logs                               # View real-time logs
```

## Logging

The bot maintains comprehensive logs:

- **System Logs**: Application events and errors
- **Trading Logs**: All buy/sell decisions and executions
- **Performance Logs**: Portfolio metrics and analysis results
- **Health Logs**: System monitoring and diagnostics

### Log Files

```
logs/
├── app.log         # General application logs
├── error.log       # Error and warning logs
├── trade.log       # Trading activity logs
└── health.log      # System health checks
```

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature-name`
3. Commit changes: `git commit -am 'Add feature'`
4. Push to branch: `git push origin feature-name`
5. Submit a pull request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Disclaimer

This software is for educational and research purposes only. Trading involves substantial risk of loss. The authors are not responsible for any financial losses incurred through the use of this software. Always test thoroughly with paper trading before using real money.

## Acknowledgments

- [Alpaca Markets](https://alpaca.markets/) for trading API
- [OpenAI](https://openai.com/) for GPT API access
- [Yahoo Finance](https://finance.yahoo.com/) for market data
- [Plotly](https://plotly.com/) for interactive charts

---

**Built with ❤️ by Said Akhmed Agitaev**

For questions or support, please open an issue or contact [a.agitaev@gmail.com](mailto:a.agitaev@gmail.com)
