const express = require('express');
const path = require('path');
const healthRoutes = require('./routes/health');

function createApp() {
  const app = express();

  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, 'views'));

  app.get('/', (_req, res) => {
    res.render('index', { title: 'Pantry', message: 'Pantry foundation is running.' });
  });

  app.use(healthRoutes);

  app.use((error, _req, res, _next) => {
    res.status(500).json({ status: 'error', message: 'Internal server error' });
  });

  return app;
}

module.exports = { createApp };