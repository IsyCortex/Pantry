const express = require('express');
const { getActiveInventoryForDisplay, getConfirmedInventoryItem, updateConfirmedInventoryItem, markInventoryItemRemoved } = require('../services/inventory-service');
const { VALID_LOCATIONS, VALID_UNITS, VALID_DATE_TYPES } = require('../validation/intake-batch');

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

  router.get('/inventory/:id/edit', async (req, res) => {
    const item = await getConfirmedInventoryItem(Number(req.params.id));
    if (!item) {
      res.status(404).send('Inventory item not found');
      return;
    }

    res.status(200).render('inventory-edit', {
      title: 'Edit inventory item',
      item: {
        id: item.id,
        name: item.name,
        quantity: item.quantity ?? '',
        unit: item.unit ?? '',
        location: item.location,
        expirationDate: item.expiration_date ?? '',
        dateType: item.date_type ?? ''
      },
      errors: [],
      locations: Array.from(VALID_LOCATIONS),
      units: Array.from(VALID_UNITS),
      dateTypes: Array.from(VALID_DATE_TYPES)
    });
  });

  router.post('/inventory/:id/edit', async (req, res) => {
    try {
      const updated = await updateConfirmedInventoryItem(Number(req.params.id), {
        name: req.body.name,
        quantity: req.body.quantity === '' ? null : Number(req.body.quantity),
        unit: req.body.unit === '' ? null : req.body.unit,
        location: req.body.location,
        expirationDate: req.body.expirationDate === '' ? null : req.body.expirationDate,
        dateType: req.body.dateType === '' ? null : req.body.dateType
      });
      res.status(200).render('inventory-edit', {
        title: 'Edit inventory item',
        item: {
          id: updated.id,
          name: updated.name,
          quantity: updated.quantity ?? '',
          unit: updated.unit ?? '',
          location: updated.location,
          expirationDate: updated.expiration_date ?? '',
          dateType: updated.date_type ?? ''
        },
        errors: [],
        locations: Array.from(VALID_LOCATIONS),
        units: Array.from(VALID_UNITS),
        dateTypes: Array.from(VALID_DATE_TYPES)
      });
    } catch (error) {
      if (error.code === 'VALIDATION_FAILED') {
        res.status(400).render('inventory-edit', {
          title: 'Edit inventory item',
          item: {
            id: Number(req.params.id),
            name: req.body.name,
            quantity: req.body.quantity,
            unit: req.body.unit,
            location: req.body.location,
            expirationDate: req.body.expirationDate,
            dateType: req.body.dateType
          },
          errors: error.details,
          locations: Array.from(VALID_LOCATIONS),
          units: Array.from(VALID_UNITS),
          dateTypes: Array.from(VALID_DATE_TYPES)
        });
        return;
      }

      if (error.code === 'INVALID_STATE_TRANSITION') {
        res.status(409).send(error.message);
        return;
      }

      throw error;
    }
  });

  router.get('/inventory/:id/use-up', async (req, res) => {
    const item = await getConfirmedInventoryItem(Number(req.params.id));
    if (!item) {
      res.status(404).send('Inventory item not found');
      return;
    }

    res.status(200).render('inventory-remove-confirm', {
      title: 'Confirm removal',
      item,
      action: 'use-up',
      actionLabel: 'used up'
    });
  });

  router.get('/inventory/:id/discard', async (req, res) => {
    const item = await getConfirmedInventoryItem(Number(req.params.id));
    if (!item) {
      res.status(404).send('Inventory item not found');
      return;
    }

    res.status(200).render('inventory-remove-confirm', {
      title: 'Confirm removal',
      item,
      action: 'discard',
      actionLabel: 'discarded'
    });
  });

  router.post('/inventory/:id/use-up/confirm', async (req, res) => {
    try {
      await markInventoryItemRemoved(Number(req.params.id), 'used_up');
      res.status(200).redirect('/inventory');
    } catch (error) {
      if (error.code === 'INVALID_STATE_TRANSITION') {
        res.status(409).send(error.message);
        return;
      }
      throw error;
    }
  });

  router.post('/inventory/:id/discard/confirm', async (req, res) => {
    try {
      await markInventoryItemRemoved(Number(req.params.id), 'discarded');
      res.status(200).redirect('/inventory');
    } catch (error) {
      if (error.code === 'INVALID_STATE_TRANSITION') {
        res.status(409).send(error.message);
        return;
      }
      throw error;
    }
  });

  return router;
}

module.exports = { createInventoryRouter };