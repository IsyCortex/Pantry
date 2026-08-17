const express = require('express');
const { checkDatabase } = require('../db/health');

const router = express.Router();

router.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'pantry' });
});

router.get('/health/db', async (_req, res, next) => {
  try {
    const ok = await checkDatabase();
    res.json({ status: ok ? 'ok' : 'error', database: ok ? 'reachable' : 'unreachable' });
  } catch (error) {
    next(error);
  }
});

module.exports = router;