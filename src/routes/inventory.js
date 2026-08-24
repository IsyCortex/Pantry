const express = require('express');
const { getActiveInventoryForDisplay, getConfirmedInventoryItem, updateConfirmedInventoryItem, markInventoryItemRemoved } = require('../services/inventory-service');
const { VALID_LOCATIONS, VALID_UNITS, VALID_DATE_TYPES } = require('../validation/intake-batch');

const NOTICE_MESSAGES = {
  updated: 'Inventory item updated successfully.',
  used_up: 'Item marked as used up.',
  discarded: 'Item marked as discarded.',
  confirmed: (created) => `Batch confirmed. ${created} item(s) added to inventory.`
};

function createInventoryRouter({ inventoryLoader = getActiveInventoryForDisplay } = {}) {
  const router = express.Router();

  router.get('/inventory', async (req, res) => {
    try {
      const items = await inventoryLoader();
      const noticeKey = req.query.notice;
      const notice = noticeKey === 'confirmed'
        ? NOTICE_MESSAGES.confirmed(Number(req.query.created) || 0)
        : (NOTICE_MESSAGES[noticeKey] || null);
      res.render('inventory', { title: 'Inventory', items, errorMessage: null, notice });
    } catch (error) {
      console.error(error.stack || error);
      res.status(500).render('inventory', {
        title: 'Inventory',
        items: [],
        errorMessage: 'Inventory could not be loaded right now.',
        notice: null
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
      notice: null,
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
      // Ground rule 3: after saving an inventory item, forward to the
      // inventory report showing the saved item (with confirmation).
      res.redirect('/inventory?notice=updated');
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
          notice: null,
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
      actionLabel: 'used up',
      notice: null
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
      actionLabel: 'discarded',
      notice: null
    });
  });

  router.post('/inventory/:id/use-up/confirm', async (req, res) => {
    try {
      await markInventoryItemRemoved(Number(req.params.id), 'used_up');
      res.redirect('/inventory?notice=used_up');
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
      res.redirect('/inventory?notice=discarded');
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