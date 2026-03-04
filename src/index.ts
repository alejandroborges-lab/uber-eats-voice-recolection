import express from 'express';
import { env } from './config/env.js';
import { callbackRouter } from './routes/callbacks.js';
import { startScheduler, processCallBatch } from './services/scheduler.js';

const app = express();
app.use(express.json());

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Callback routes (HappyRobot sends results here)
app.use('/api/callbacks', callbackRouter);

// Manual trigger for testing (protected by callback secret)
app.post('/api/test/trigger-now', async (req, res) => {
  if (env.callbackSecret) {
    const secret = req.headers['x-callback-secret'];
    if (secret !== env.callbackSecret) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
  }

  console.log('Manual trigger requested');
  processCallBatch().catch(console.error);
  res.json({ message: 'Call batch triggered' });
});

app.listen(env.port, () => {
  console.log(`Server running on port ${env.port}`);
  startScheduler();
});
