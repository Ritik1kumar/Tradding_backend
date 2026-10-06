const http = require('node:http');

// Boots the REAL app (same app.js the production server uses) on an ephemeral
// port in-process. Requiring '../../app' (not bin/www) is deliberate: bin/www
// also starts the hourly price-expiry cron, which we don't want running
// during a test run — expiry is instead triggered on demand (see scenarios/07_expiry.js).
async function startServer() {
  const app = require('../../app');
  const server = http.createServer(app);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const { port } = server.address();
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

module.exports = { startServer };
