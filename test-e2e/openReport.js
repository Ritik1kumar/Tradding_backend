const path = require('node:path');
const fs = require('node:fs');
const { exec } = require('node:child_process');

const reportPath = path.join(__dirname, '..', 'reports', 'listing-e2e-report.html');

if (!fs.existsSync(reportPath)) {
  console.error(`No report found at ${reportPath}. Run "npm run test:e2e" first.`);
  process.exit(1);
}

const openCommand =
  process.platform === 'win32'
    ? `start "" "${reportPath}"`
    : process.platform === 'darwin'
    ? `open "${reportPath}"`
    : `xdg-open "${reportPath}"`;

exec(openCommand, (err) => {
  if (err) {
    console.error(`Could not auto-open the report, open it manually: ${reportPath}`);
  } else {
    console.log(`Opened ${reportPath}`);
  }
});
