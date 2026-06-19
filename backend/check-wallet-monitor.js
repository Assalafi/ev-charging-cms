const fs = require('fs');

const logFile = '/var/www/evcharging/backend/logs/out.log';
const lines = fs.readFileSync(logFile, 'utf8').split('\n');

// Get last 20 lines containing WalletMonitor
const walletMonitorLines = lines.filter(line => line.includes('WalletMonitor')).slice(-20);

walletMonitorLines.forEach(line => {
  console.log(line);
});
