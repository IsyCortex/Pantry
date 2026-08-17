const express = require('express');
const { getActiveInventoryForDisplay } = require('../services/inventory-service');

function createInventoryRouter({ inventoryLoader = getActiveInventoryForDisplay } = {}) {
  const router = express.Router();

  router.get('/inventory', async (_req, res) => {
    try {
      const items = await inventoryLoader();
      res.render('inventory', { title: 'Inventory', items, errorMessage: null });
    } catch (error) {
      console.error(error.stack || error);
      res.status(500).render('inventory', {
        title: 'Inventory',
        items: [],
        errorMessage: 'Inventory could not be loaded right now.'
      });
    }
  });

  return router;
}

module.exports = { createInventoryRouter };