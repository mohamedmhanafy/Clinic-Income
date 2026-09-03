import { createApp } from './app.js';
import { config } from './config.js';
import { prisma } from './prisma.js';

const app = createApp();

const server = app.listen(config.port, () => {
  console.log(`[api] listening on http://localhost:${config.port} (${config.nodeEnv})`);
});

async function shutdown(signal: string) {
  console.log(`[api] ${signal} received, shutting down`);
  server.close(() => {
    void prisma.$disconnect().then(() => process.exit(0));
  });
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
