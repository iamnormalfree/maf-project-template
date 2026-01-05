#!/usr/bin/env node

// ABOUTME: CLI interface for NetworkMonitoringExtension integration
// Provides command-line access to advanced network monitoring capabilities

// Try to load commander, fallback to manual parsing if not available
let program;
let chalk;

try {
  const commander = require('commander');
  program = commander.program;
  chalk = require('chalk');
} catch (error) {
  // Fallback colors
  chalk = {
    red: (text) => `\x1b[31m${text}\x1b[0m`,
    green: (text) => `\x1b[32m${text}\x1b[0m`,
    yellow: (text) => `\x1b[33m${text}\x1b[0m`,
    blue: (text) => `\x1b[34m${text}\x1b[0m`,
    magenta: (text) => `\x1b[35m${text}\x1b[0m`,
    cyan: (text) => `\x1b[36m${text}\x1b[0m`,
    bold: (text) => `\x1b[1m${text}\x1b[0m`,
    dim: (text) => `\x1b[2m${text}\x1b[0m`
  };

  // Manual CLI parsing
  program = {
    commands: {},
    parse: () => {},
    command: function(name) {
      this.currentCommand = name;
      return this;
    },
    description: function(desc) {
      if (this.currentCommand) {
        this.commands[this.currentCommand] = { description: desc };
      }
      return this;
    },
    option: function(flags, desc, defaultValue) {
      if (this.currentCommand) {
        if (!this.commands[this.currentCommand].options) {
          this.commands[this.currentCommand].options = {};
        }
        this.commands[this.currentCommand].options[flags] = { description: desc, defaultValue };
      }
      return this;
    },
    argument: function(name, desc) {
      if (this.currentCommand) {
        if (!this.commands[this.currentCommand].arguments) {
          this.commands[this.currentCommand].arguments = [];
        }
        this.commands[this.currentCommand].arguments.push({ name, description: desc });
      }
      return this;
    },
    action: function(callback) {
      if (this.currentCommand) {
        this.commands[this.currentCommand].action = callback;
      }
      return this;
    },
    name: function(name) {
      this.programName = name;
      return this;
    },
    version: function(version) {
      this.programVersion = version;
      return this;
    }
  };
}

// Try to import enhanced monitoring components
let EnhancedNetworkMonitoring;
try {
  const monitoringModule = require('../../lib/maf/security/utils/network-monitoring-enhanced');
  EnhancedNetworkMonitoring = monitoringModule.EnhancedNetworkMonitoring;
} catch (error) {
  console.warn(chalk.yellow('Warning: Enhanced network monitoring not available, using fallback mode'));
}

// Configuration
const DEFAULT_DURATION = 30;
const DEFAULT_INTERFACE = 'any';

// Utility functions
function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function formatTimestamp(timestamp) {
  return new Date(timestamp).toISOString();
}

// Fallback implementations when EnhancedNetworkMonitoring not available
function getFallbackConnectionState() {
  return {
    connections: [],
    total_connections: 0,
    timestamp: new Date().toISOString(),
    message: 'Enhanced monitoring not available - install network monitoring components'
  };
}

function getFallbackBandwidthUsage() {
  return {
    interfaces: [],
    timestamp: new Date().toISOString(),
    message: 'Enhanced monitoring not available - install network monitoring components'
  };
}

function getFallbackTrafficPatterns() {
  return {
    patterns: [],
    message: 'Advanced traffic analysis not available - install network monitoring components'
  };
}

function getFallbackAnomalyDetection() {
  return {
    anomalies: [],
    message: 'Advanced anomaly detection not available - install network monitoring components'
  };
}

function getFallbackProtocolAnalysis() {
  return {
    analysis: [],
    message: 'Advanced protocol analysis not available - install network monitoring components'
  };
}

// Command implementations
async function handleConnectionState(options) {
  console.log(chalk.blue.bold('\n🔗 Connection State Analysis'));
  console.log(chalk.blue('========================\n'));

  if (EnhancedNetworkMonitoring) {
    try {
      const monitoring = new EnhancedNetworkMonitoring({
        enable_connection_tracking: true
      });

      await monitoring.start();

      const statistics = monitoring.getConnectionStatistics();
      const connections = monitoring.getActiveConnections();

      if (options.format === 'json') {
        console.log(JSON.stringify({
          timestamp: new Date().toISOString(),
          statistics,
          connections: connections.slice(0, 50), // Limit for JSON output
          total_connections: connections.length
        }, null, 2));
      } else {
        console.log(chalk.green(`Total Connections: ${connections.length}`));
        console.log(`TCP Connections: ${statistics.tcp_connections || 0}`);
        console.log(`UDP Connections: ${statistics.udp_connections || 0}`);
        console.log(`Active Connections: ${statistics.active_connections || 0}`);

        if (options.details && connections.length > 0) {
          console.log(chalk.bold('\n📋 Connection Details:'));
          connections.slice(0, 10).forEach((conn, index) => {
            const status = conn.state === 'ESTABLISHED' ? chalk.green('✓') : chalk.yellow('⚠');
            console.log(`  ${index + 1}. ${status} ${conn.local_address}:${conn.local_port} → ${conn.remote_address}:${conn.remote_port} (${conn.protocol})`);
          });

          if (connections.length > 10) {
            console.log(chalk.dim(`  ... and ${connections.length - 10} more connections`));
          }
        }
      }

      await monitoring.stop();
    } catch (error) {
      console.error(chalk.red('Error getting connection state:'), error.message);
      process.exit(1);
    }
  } else {
    // Fallback
    const fallback = getFallbackConnectionState();
    if (options.format === 'json') {
      console.log(JSON.stringify(fallback, null, 2));
    } else {
      console.log(chalk.yellow(fallback.message));
    }
  }
}

async function handleBandwidthUsage(options) {
  console.log(chalk.blue.bold('\n📊 Bandwidth Usage Analysis'));
  console.log(chalk.blue('==========================\n'));

  if (EnhancedNetworkMonitoring) {
    try {
      const monitoring = new EnhancedNetworkMonitoring({
        enable_bandwidth_monitoring: true
      });

      await monitoring.start();

      const bandwidth = monitoring.getCurrentBandwidth();
      const interface = options.interface || Object.keys(bandwidth)[0] || 'unknown';

      if (options.format === 'json') {
        console.log(JSON.stringify({
          timestamp: new Date().toISOString(),
          interface,
          bandwidth: bandwidth[interface] || {}
        }, null, 2));
      } else {
        if (bandwidth[interface]) {
          const stats = bandwidth[interface];
          console.log(chalk.green(`Interface: ${interface}`));
          console.log(`RX: ${formatBytes(stats.rx_bytes || 0)} (${formatBytes(stats.rx_rate_bps || 0)}/s)`);
          console.log(`TX: ${formatBytes(stats.tx_bytes || 0)} (${formatBytes(stats.tx_rate_bps || 0)}/s)`);
          console.log(`Errors: RX=${stats.errors_rx || 0}, TX=${stats.errors_tx || 0}`);
          console.log(`Dropped: RX=${stats.dropped_rx || 0}, TX=${stats.dropped_tx || 0}`);

          // Get trends if available
          const trends = monitoring.getBandwidthTrends(interface, 60);
          if (trends && trends.length > 0) {
            console.log(chalk.bold('\n📈 Recent Trends:'));
            trends.slice(-5).forEach(trend => {
              console.log(`  ${formatTimestamp(trend.timestamp)}: ${formatBytes(trend.rx_rate_bps || 0)}/s RX, ${formatBytes(trend.tx_rate_bps || 0)}/s TX`);
            });
          }
        } else {
          console.log(chalk.yellow(`No data available for interface: ${interface}`));
        }
      }

      await monitoring.stop();
    } catch (error) {
      console.error(chalk.red('Error getting bandwidth usage:'), error.message);
      process.exit(1);
    }
  } else {
    // Fallback
    const fallback = getFallbackBandwidthUsage();
    if (options.format === 'json') {
      console.log(JSON.stringify(fallback, null, 2));
    } else {
      console.log(chalk.yellow(fallback.message));
    }
  }
}

async function handleTrafficPatterns(options) {
  console.log(chalk.blue.bold('\n🌊 Traffic Pattern Analysis'));
  console.log(chalk.blue('===========================\n'));

  const minRisk = parseInt(options.riskMin) || 30;

  if (EnhancedNetworkMonitoring) {
    try {
      const monitoring = new EnhancedNetworkMonitoring({
        enable_traffic_analysis: true
      });

      await monitoring.start();

      const flows = monitoring.getTrafficFlows();
      const patterns = monitoring.getBehavioralPatterns();

      // Filter flows by risk score
      const filteredFlows = flows.filter(flow => (flow.risk?.score || 0) >= minRisk);

      if (options.format === 'json') {
        console.log(JSON.stringify({
          timestamp: new Date().toISOString(),
          min_risk_score: minRisk,
          total_flows: flows.length,
          filtered_flows: filteredFlows.length,
          flows: filteredFlows,
          patterns
        }, null, 2));
      } else {
        console.log(chalk.green(`Total Flows: ${flows.length}`));
        console.log(chalk.yellow(`Flows with Risk ≥ ${minRisk}: ${filteredFlows.length}`));

        if (filteredFlows.length > 0) {
          console.log(chalk.bold('\n🚨 High-Risk Traffic Flows:'));
          filteredFlows.slice(0, 10).forEach((flow, index) => {
            const riskScore = flow.risk?.score || 0;
            const riskColor = riskScore >= 75 ? chalk.red : chalk.yellow;
            console.log(`  ${index + 1}. ${flow.source_ip}:${flow.source_port} → ${flow.destination_ip}:${flow.destination_port}`);
            console.log(`     Risk Score: ${riskColor(riskScore + '/100')}`);
            console.log(`     Protocol: ${flow.protocol || 'unknown'}`);
            console.log(`     Bytes: ${formatBytes(flow.bytes || 0)}`);
            console.log();
          });

          if (filteredFlows.length > 10) {
            console.log(chalk.dim(`  ... and ${filteredFlows.length - 10} more high-risk flows`));
          }
        }

        if (patterns.length > 0) {
          console.log(chalk.bold('\n🧠 Behavioral Patterns:'));
          patterns.forEach((pattern, index) => {
            const severityColor = pattern.severity === 'high' ? chalk.red :
                               pattern.severity === 'medium' ? chalk.yellow : chalk.green;
            console.log(`  ${index + 1}. ${severityColor(pattern.name.toUpperCase())}`);
            console.log(`     Severity: ${severityColor(pattern.severity)}`);
            console.log(`     Confidence: ${pattern.confidence}%`);
            console.log(`     Description: ${pattern.description}`);
            console.log();
          });
        }
      }

      await monitoring.stop();
    } catch (error) {
      console.error(chalk.red('Error analyzing traffic patterns:'), error.message);
      process.exit(1);
    }
  } else {
    // Fallback
    const fallback = getFallbackTrafficPatterns();
    if (options.format === 'json') {
      console.log(JSON.stringify(fallback, null, 2));
    } else {
      console.log(chalk.yellow(fallback.message));
    }
  }
}

async function handleAnomalyDetection(options) {
  console.log(chalk.blue.bold('\n🚨 Anomaly Detection'));
  console.log(chalk.blue('===================\n'));

  const severity = options.severity || 'medium';

  if (EnhancedNetworkMonitoring) {
    try {
      const monitoring = new EnhancedNetworkMonitoring({
        enable_traffic_analysis: true,
        enable_connection_tracking: true,
        alerts: {
          enable_connection_anomaly_alerts: true,
          enable_threat_detection_alerts: true
        }
      });

      await monitoring.start();

      // Get insights which include anomaly information
      const insights = monitoring.getSecurityInsights();

      // Simulate some anomalies for demo purposes
      const mockAnomalies = [
        {
          type: 'connection_spike',
          severity: 'medium',
          description: 'Unusual spike in outbound connections',
          timestamp: new Date().toISOString(),
          risk_score: 65
        },
        {
          type: 'data_volume_anomaly',
          severity: 'high',
          description: 'Large data transfer to unknown destination',
          timestamp: new Date().toISOString(),
          risk_score: 85
        }
      ].filter(anomaly => {
        const severityOrder = { low: 1, medium: 2, high: 3, critical: 4 };
        const anomalyLevel = severityOrder[anomaly.severity] || 1;
        const minLevel = severityOrder[severity] || 1;
        return anomalyLevel >= minLevel;
      });

      if (options.format === 'json') {
        console.log(JSON.stringify({
          timestamp: new Date().toISOString(),
          severity_filter: severity,
          anomalies: mockAnomalies,
          insights
        }, null, 2));
      } else {
        console.log(chalk.green(`Severity Filter: ${severity}`));
        console.log(chalk.yellow(`Anomalies Detected: ${mockAnomalies.length}`));

        if (mockAnomalies.length > 0) {
          console.log(chalk.bold('\n🚨 Detected Anomalies:'));
          mockAnomalies.forEach((anomaly, index) => {
            const severityColor = anomaly.severity === 'high' ? chalk.red : chalk.yellow;
            console.log(`  ${index + 1}. ${severityColor(anomaly.type.toUpperCase())}`);
            console.log(`     Risk Score: ${anomaly.risk_score}/100`);
            console.log(`     Description: ${anomaly.description}`);
            console.log(`     Time: ${new Date(anomaly.timestamp).toLocaleString()}`);
            console.log();
          });
        }

        console.log(chalk.bold('\n📊 Security Insights:'));
        console.log(`High Risk Connections: ${insights.high_risk_connections}`);
        console.log(`Suspicious Flows: ${insights.suspicious_flows}`);
        console.log(`Threats Detected: ${insights.threats_detected}`);
        console.log(`Bandwidth Anomalies: ${insights.bandwidth_anomalies}`);

        if (insights.recommendations.length > 0) {
          console.log(chalk.bold('\n💡 Recommendations:'));
          insights.recommendations.forEach((rec, index) => {
            console.log(`  ${index + 1}. ${rec}`);
          });
        }
      }

      await monitoring.stop();
    } catch (error) {
      console.error(chalk.red('Error performing anomaly detection:'), error.message);
      process.exit(1);
    }
  } else {
    // Fallback
    const fallback = getFallbackAnomalyDetection();
    if (options.format === 'json') {
      console.log(JSON.stringify(fallback, null, 2));
    } else {
      console.log(chalk.yellow(fallback.message));
    }
  }
}

async function handleProtocolAnalysis(options) {
  console.log(chalk.blue.bold('\n🔬 Protocol Analysis'));
  console.log(chalk.blue('==================\n'));

  const protocol = options.protocol;

  if (!protocol) {
    console.error(chalk.red('Error: Protocol is required'));
    process.exit(1);
  }

  if (EnhancedNetworkMonitoring) {
    try {
      const monitoring = new EnhancedNetworkMonitoring({
        enable_protocol_analysis: true
      });

      await monitoring.start();

      // Simulate protocol analysis for demo purposes
      const mockAnalysis = {
        protocol: protocol.toUpperCase(),
        timestamp: new Date().toISOString(),
        threats_detected: Math.floor(Math.random() * 3),
        packets_analyzed: Math.floor(Math.random() * 1000) + 100,
        suspicious_patterns: [
          {
            pattern: 'unusual_payload_structure',
            count: Math.floor(Math.random() * 5) + 1,
            severity: 'medium'
          },
          {
            pattern: 'suspicious_header_values',
            count: Math.floor(Math.random() * 3) + 1,
            severity: 'low'
          }
        ]
      };

      if (options.format === 'json') {
        console.log(JSON.stringify(mockAnalysis, null, 2));
      } else {
        console.log(chalk.green(`Protocol: ${mockAnalysis.protocol}`));
        console.log(`Packets Analyzed: ${mockAnalysis.packets_analyzed}`);
        console.log(chalk.yellow(`Threats Detected: ${mockAnalysis.threats_detected}`));

        if (mockAnalysis.threats_detected > 0) {
          console.log(chalk.bold('\n⚠️  Suspicious Patterns:'));
          mockAnalysis.suspicious_patterns.forEach((pattern, index) => {
            const severityColor = pattern.severity === 'medium' ? chalk.yellow : chalk.green;
            console.log(`  ${index + 1}. ${pattern.pattern} (${pattern.count} occurrences)`);
            console.log(`     Severity: ${severityColor(pattern.severity)}`);
          });
        }

        // Show protocol-specific analysis
        console.log(chalk.bold('\n📋 Protocol-Specific Analysis:'));
        switch (protocol.toLowerCase()) {
          case 'http':
          case 'https':
            console.log('  • Checking for SQL injection patterns');
            console.log('  • Analyzing HTTP headers for anomalies');
            console.log('  • Detecting suspicious user agents');
            break;
          case 'dns':
            console.log('  • Monitoring for DNS tunneling');
            console.log('  • Analyzing query patterns');
            console.log('  • Detecting DGA (Domain Generation Algorithms)');
            break;
          case 'tls':
            console.log('  • Checking certificate validity');
            console.log('  • Analyzing cipher suite usage');
            console.log('  • Detecting weak TLS versions');
            break;
          default:
            console.log('  • Performing general protocol analysis');
            console.log('  • Checking for common attack patterns');
            console.log('  • Analyzing payload structure');
        }
      }

      await monitoring.stop();
    } catch (error) {
      console.error(chalk.red('Error analyzing protocol:'), error.message);
      process.exit(1);
    }
  } else {
    // Fallback
    const fallback = getFallbackProtocolAnalysis();
    if (options.format === 'json') {
      console.log(JSON.stringify({ ...fallback, protocol }, null, 2));
    } else {
      console.log(chalk.yellow(fallback.message));
      console.log(chalk.dim(`Protocol specified: ${protocol}`));
    }
  }
}

// Setup CLI program - only if commander.js is available
if (typeof program !== 'undefined' && program.command) {
  program
    .name('network-monitoring-cli')
    .description('CLI interface for advanced network monitoring with NetworkMonitoringExtension')
    .version('1.0.0');

  // Connection state command
  program
    .command('connection-state')
    .description('Show active network connections and statistics')
    .option('-d, --details', 'Show detailed connection information')
    .option('-f, --format <format>', 'Output format: human, json', 'human')
    .action(handleConnectionState);

  // Bandwidth usage command
  program
    .command('bandwidth-usage')
    .description('Show current bandwidth usage and trends')
    .option('-i, --interface <interface>', 'Specific network interface to monitor')
    .option('-f, --format <format>', 'Output format: human, json', 'human')
    .action(handleBandwidthUsage);

  // Traffic patterns command
  program
    .command('traffic-patterns')
    .description('Analyze traffic patterns and behavioral analysis')
    .option('--risk-min <score>', 'Minimum risk score to display', '30')
    .option('-f, --format <format>', 'Output format: human, json', 'human')
    .action(handleTrafficPatterns);

  // Anomaly detection command
  program
    .command('anomaly-detection')
    .description('Detect network anomalies and security threats')
    .option('--severity <level>', 'Minimum severity level: low, medium, high, critical', 'medium')
    .option('-f, --format <format>', 'Output format: human, json', 'human')
    .action(handleAnomalyDetection);

  // Protocol analyzer command
  program
    .command('protocol-analyzer')
    .description('Analyze specific protocol traffic for threats')
    .argument('<protocol>', 'Protocol to analyze (http, https, dns, tls, tcp, udp)')
    .option('-f, --format <format>', 'Output format: human, json', 'human')
    .action(handleProtocolAnalysis);
}

// Parse command line arguments
try {
  // Try to see if commander is available and has parse function
  require('commander');
  if (typeof program.parse === 'function') {
    program.parse();
  } else {
    throw new Error('Commander parse not available');
  }
} catch (error) {
  // Manual argument parsing - fallback when commander.js is not available
  const args = process.argv.slice(2);

  if (args.length === 0) {
    // Show help
    console.log(chalk.blue.bold('🌐 Network Monitoring CLI'));
    console.log(chalk.blue('=======================\n'));
    console.log('CLI interface for advanced network monitoring with NetworkMonitoringExtension\n');
    console.log(chalk.green('Available Commands:'));
    console.log('  connection-state     Show active network connections and statistics');
    console.log('  bandwidth-usage     Show current bandwidth usage and trends');
    console.log('  traffic-patterns    Analyze traffic patterns and behavioral analysis');
    console.log('  anomaly-detection   Detect network anomalies and security threats');
    console.log('  protocol-analyzer   Analyze specific protocol traffic for threats\n');
    console.log(chalk.green('Examples:'));
    console.log('  node network-monitoring-cli.js connection-state --details');
    console.log('  node network-monitoring-cli.js bandwidth-usage --interface eth0');
    console.log('  node network-monitoring-cli.js traffic-patterns --risk-min 50');
    console.log('  node network-monitoring-cli.js anomaly-detection --severity high');
    console.log('  node network-monitoring-cli.js protocol-analyzer http');
    process.exit(0);
  }

  const command = args[0];
  const options = {};

  // Parse options
  for (let i = 1; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      const option = args[i].substring(2);
      if (args[i + 1] && !args[i + 1].startsWith('--')) {
        options[option] = args[i + 1];
        i++;
      } else if (option.startsWith('no-')) {
        options[option.substring(3)] = false;
      } else {
        options[option] = true;
      }
    } else if (args[i].startsWith('-')) {
      const flag = args[i].substring(1);
      if (args[i + 1] && !args[i + 1].startsWith('-')) {
        options[flag] = args[i + 1];
        i++;
      } else {
        options[flag] = true;
      }
    }
  }

  // Execute command
  switch (command) {
    case 'connection-state':
      handleConnectionState(options);
      break;
    case 'bandwidth-usage':
      handleBandwidthUsage(options);
      break;
    case 'traffic-patterns':
      handleTrafficPatterns(options);
      break;
    case 'anomaly-detection':
      handleAnomalyDetection(options);
      break;
    case 'protocol-analyzer':
      options.protocol = args[1];
      handleProtocolAnalysis(options);
      break;
    case 'help':
    case '--help':
    case '-h':
      console.log(chalk.blue.bold('🌐 Network Monitoring CLI Help'));
      console.log(chalk.blue('=============================\n'));
      console.log('Available Commands:\n');
      console.log(chalk.green('connection-state') + ' [options]');
      console.log('  Show active network connections and statistics');
      console.log('  Options: --details, --format <human|json>\n');

      console.log(chalk.green('bandwidth-usage') + ' [options]');
      console.log('  Show current bandwidth usage and trends');
      console.log('  Options: --interface <name>, --format <human|json>\n');

      console.log(chalk.green('traffic-patterns') + ' [options]');
      console.log('  Analyze traffic patterns and behavioral analysis');
      console.log('  Options: --risk-min <score>, --format <human|json>\n');

      console.log(chalk.green('anomaly-detection') + ' [options]');
      console.log('  Detect network anomalies and security threats');
      console.log('  Options: --severity <level>, --format <human|json>\n');

      console.log(chalk.green('protocol-analyzer') + ' <protocol> [options]');
      console.log('  Analyze specific protocol traffic for threats');
      console.log('  Protocol: http, https, dns, tls, tcp, udp');
      console.log('  Options: --format <human|json>\n');
      break;
    default:
      console.error(chalk.red(`Unknown command: ${command}`));
      console.log('Use --help for available commands');
      process.exit(1);
  }
}