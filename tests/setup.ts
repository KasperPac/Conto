import 'dotenv/config';

// Point DATABASE_URL to the test database when running tests.
// This ensures Better Auth's auth singleton and Drizzle db both use conto_test.
const testUrl = process.env.TEST_DATABASE_URL
  ?? process.env.DATABASE_URL?.replace(/\/conto$/, '/conto_test');
if (testUrl) {
  process.env.DATABASE_URL = testUrl;
}
