const express = require('express');
const path = require('path');
const healthRoutes = require('./routes/health');
const { createInventoryRouter } = require('./routes/inventory');

function createApp(options = {}) {
  const app = express();

  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, 'views'));

  app.get('/', (_req, res) => {
    res.render('index', { title: 'Pantry', message: 'Pantry foundation is running.' });
  });

  app.use(healthRoutes);
  app.use(createInventoryRouter({ inventoryLoader: options.inventoryLoader }));

  app.use((error, _req, res, _next) => {
    if (error) {
      console.error(error.stack || error);
    }

    res.status(500).json({ status: 'error', message: 'Internal server error' });
  });

  return app;
}

module.exports = { createApp };