import { startMockServer } from './server';

const port = Number(process.env.MOCK_AI_PORT ?? 8787);
const apiKey = process.env.MOCK_AI_KEY ?? 'test-key';

const server = await startMockServer({ port, apiKey });
console.log(`mock AI server: ${server.baseUrl}（API key: ${apiKey}）`);

const shutdown = () => void server.close().then(() => process.exit(0));
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
