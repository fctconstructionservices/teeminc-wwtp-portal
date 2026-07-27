/**
 * 19-TransferService.gs — Location-to-location transfers (v6.9)
 *
 * A transfer moves materials or equipment between LOCATIONS. A location
 * is either a projectId or the literal 'WAREHOUSE'. That distinction
 * matters: the warehouse is a place stock can sit, not a project — it
 * has no Gantt, no finance, no SOW, and must never appear in project
 * lists. Modelling it as a fake project would leak it into every one of
 * those views.
 *
 * FLOW: request → 'Pending' → ONE admin approval → 'Completed'.
 * Deliberately single-signature: a transfer is an operational decision,
 * not a financial one, so it does not use the multi-sig engine.
 *
 * EFFECT: nothing is written into daily records. Availability is derived
 * live — see availableAt_ — so approving a transfer moves BOTH sides at
 * once and the halves can never drift apart (the failure mode of logging
 * a manual "used" on one project and hoping someone logs a matching
 * "delivered" on the other).
 *
 * COST does NOT follow the item: it stays with the project that bought
 * it (a deliberate simplification agreed with the owner).
 */

var WAREHOUSE_LOC = 'WAREHOUSE';

/** locLabel_ - human label for a location code. */
function locLabel_(loc, projectsById) {
  if (loc === WAREHOUSE_LOC) return 'Warehouse';
  var p = projectsById && projectsById[loc];
  return p ? (p.name + ' (' + loc + ')') : loc;
}

/**
 * availableAt_ - Current stock at a location, derived live.
 *   Project material : delivered + transfersIn − used − transfersOut
 *   Project equipment: last-known qty on site + transfersIn − transfersOut
 *   Warehouse        : transfersIn − transfersOut (it has no daily reports)
 * Returns { itemName: { qty, unit } }.
 */
function availableAt_(loc, itemType) {
  var stock = {};
  var bump_ = function (name, unit, delta) {
    if (!name) return;
    if (!stock[name]) stock[name] = { qty: 0, unit: unit || '' };
    stock[name].qty += delta;
    if (!stock[name].unit && unit) stock[name].unit = unit;
  };

  if (loc !== WAREHOUSE_LOC) {
    var records = liveDailyRecords_().filter(function (d) {
      return d.projectId === loc && d.status !== 'rejected';
    });
    if (itemType === 'Material') {
      records.forEach(function (d) {
        safeParse_(d.materialsDeliveredJSON, []).forEach(function (m) {
          bump_(m.material, m.unit, parseFloat(m.qty) || 0);
        });
        safeParse_(d.materialsUsedJSON, []).forEach(function (m) {
          bump_(m.material, m.unit, -(parseFloat(m.qty) || 0));
        });
      });
    } else {
      // Equipment presence: the latest report that mentions a unit is
      // the authority on how many are on site (not a running total).
      var latest = {};
      records.forEach(function (d) {
        var key = fmtDate_(d.date);
        safeParse_(d.equipmentJSON, []).forEach(function (e) {
          var nm = String(e.name || '').trim();
          if (!nm) return;
          if (!latest[nm] || key > latest[nm].key) {
            latest[nm] = { key: key, qty: parseFloat(e.qty) || 1 };
          }
        });
      });
      Object.keys(latest).forEach(function (nm) { bump_(nm, 'unit', latest[nm].qty); });
    }
  }

  readAll_('Transfers').forEach(function (tr) {
    if (tr.status !== 'Completed' || tr.itemType !== itemType) return;
    if (tr.toLoc === loc) bump_(tr.item, tr.unit, parseFloat(tr.qty) || 0);
    if (tr.fromLoc === loc) bump_(tr.item, tr.unit, -(parseFloat(tr.qty) || 0));
  });

  Object.keys(stock).forEach(function (k) {
    stock[k].qty = Math.round(stock[k].qty * 10000) / 10000;
    if (stock[k].qty <= 0) delete stock[k];
  });
  return stock;
}

/** getTransferOptions - locations + available items, for the modal. */
function getTransferOptions(fromLoc, itemType) {
  var projects = readAll_('Projects').filter(function (p) { return p.status !== 'Archived'; });
  var locations = projects.map(function (p) { return { id: p.id, label: p.name + ' (' + p.id + ')', isWarehouse: false }; });
  locations.push({ id: WAREHOUSE_LOC, label: 'Warehouse', isWarehouse: true });

  var items = [];
  if (fromLoc) {
    var stock = availableAt_(fromLoc, itemType || 'Material');
    items = Object.keys(stock).map(function (k) {
      return { item: k, qty: stock[k].qty, unit: stock[k].unit };
    }).sort(function (a, b) { return a.item < b.item ? -1 : 1; });
  }
  return { locations: locations, items: items };
}

/**
 * requestTransfer - Either side's editor may request (agreed with the
 * owner), so the check is "editor of source OR destination".
 */
function requestTransfer(data) {
  requireLogin_();   // v7.0 (editor check on either side follows below)
  var fromLoc = String(data && data.fromLoc || '').trim();
  var toLoc = String(data && data.toLoc || '').trim();
  var itemType = String(data && data.itemType || 'Material').trim();
  var item = String(data && data.item || '').trim();
  var qty = parseFloat(data && data.qty);

  if (!fromLoc || !toLoc) throw new Error('Both source and destination are required.');
  if (fromLoc === toLoc) throw new Error('Source and destination must be different.');
  if (!item) throw new Error('Select an item to transfer.');
  if (isNaN(qty) || qty <= 0) throw new Error('Quantity must be greater than zero.');
  if (itemType !== 'Material' && itemType !== 'Equipment') throw new Error('Invalid item type.');

  var canFrom = fromLoc === WAREHOUSE_LOC || canEditProject_(fromLoc);
  var canTo = toLoc === WAREHOUSE_LOC || canEditProject_(toLoc);
  if (!canFrom && !canTo) {
    throw new Error('You must be an editor of either the source or the destination project.');
  }

  var stock = availableAt_(fromLoc, itemType);
  var avail = stock[item] ? stock[item].qty : 0;
  if (qty > avail + 0.0001) {
    throw new Error('Only ' + avail + ' ' + (stock[item] ? stock[item].unit : '') + ' of "' + item + '" available at the source.');
  }

  var id = nextId_('TRF');
  appendRow_('Transfers', {
    id: id,
    fromLoc: fromLoc,
    toLoc: toLoc,
    itemType: itemType,
    item: item,
    unit: stock[item] ? stock[item].unit : '',
    qty: qty,
    reason: String(data.reason || '').trim(),
    transferDate: data.transferDate || Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd'),
    status: 'Pending',
    requestedBy: currentUserEmail_(),
    createdAt: new Date(),
    decidedBy: '',
    decidedAt: ''
  });
  logActivity_('Transfer ' + id + ': ' + qty + ' ' + item + ' — ' + fromLoc + ' → ' + toLoc + ' (for approval)', 'blue', id);
  return { success: true, id: id };
}

function decideTransfer_(id, decision) {
  var me = currentUserEmail_().toLowerCase();
  var user = readAll_('Users').find(function (u) { return u.email.toLowerCase() === me; });
  if (!user || (user.role !== 'superadmin' && user.role !== 'admin')) {
    throw new Error('Only admins can decide on a transfer.');
  }
  var tr = readAll_('Transfers').find(function (x) { return x.id === id; });
  if (!tr) throw new Error('Transfer not found.');
  if (tr.status !== 'Pending') throw new Error('This transfer is no longer pending.');

  if (decision === 'Completed') {
    // re-check availability at approval time — stock may have moved
    var stock = availableAt_(tr.fromLoc, tr.itemType);
    var avail = stock[tr.item] ? stock[tr.item].qty : 0;
    if ((parseFloat(tr.qty) || 0) > avail + 0.0001) {
      throw new Error('No longer available: only ' + avail + ' of "' + tr.item + '" left at the source.');
    }
  }

  updateRow_('Transfers', 'id', id, {
    status: decision, decidedBy: currentUserEmail_(), decidedAt: new Date()
  });
  logActivity_('Transfer ' + id + ' ' + decision.toLowerCase() +
    (decision === 'Completed' ? ' — stock moved on both sides' : ''), decision === 'Completed' ? 'g' : 'a', id);
  return { success: true, status: decision };
}

function approveTransfer(id) { return decideTransfer_(id, 'Completed'); }
function rejectTransfer(id) { return decideTransfer_(id, 'Rejected'); }

/** getWarehouseStock - materials + equipment currently held, with provenance. */
function getWarehouseStock() {
  var projects = readAll_('Projects');
  var byId = {};
  projects.forEach(function (p) { byId[p.id] = p; });
  var transfers = readAll_('Transfers').filter(function (t) { return t.status === 'Completed'; });

  var build_ = function (itemType) {
    var stock = availableAt_(WAREHOUSE_LOC, itemType);
    return Object.keys(stock).map(function (k) {
      var last = transfers.filter(function (t) {
        return t.itemType === itemType && t.item === k && t.toLoc === WAREHOUSE_LOC;
      }).sort(function (a, b) {
        return String(fmtDate_(a.transferDate)) < String(fmtDate_(b.transferDate)) ? 1 : -1;
      })[0];
      return {
        item: k,
        qty: stock[k].qty,
        unit: stock[k].unit,
        lastFrom: last ? locLabel_(last.fromLoc, byId) : '—',
        lastDate: last ? fmtDate_(last.transferDate) : ''
      };
    }).sort(function (a, b) { return a.item < b.item ? -1 : 1; });
  };

  var materials = build_('Material');
  var equipment = build_('Equipment');
  var rates = {};
  readAll_('Materials').forEach(function (m) {
    if (m.name) rates[String(m.name).toLowerCase()] = parseFloat(m.rate) || 0;
  });
  var estValue = materials.reduce(function (s, m) {
    return s + (rates[String(m.item).toLowerCase()] || 0) * m.qty;
  }, 0);

  return {
    materials: materials,
    equipment: equipment,
    pendingCount: readAll_('Transfers').filter(function (t) { return t.status === 'Pending'; }).length,
    estValue: Math.round(estValue)
  };
}

/** getTransfersForProject - transfer log for a project's Site Materials tab. */
function getTransfersForProject(projectId) {
  var projects = readAll_('Projects');
  var byId = {};
  projects.forEach(function (p) { byId[p.id] = p; });
  return readAll_('Transfers')
    .filter(function (t) { return t.fromLoc === projectId || t.toLoc === projectId; })
    .map(function (t) {
      return {
        id: t.id,
        fromLoc: t.fromLoc, toLoc: t.toLoc,
        fromLabel: locLabel_(t.fromLoc, byId), toLabel: locLabel_(t.toLoc, byId),
        direction: t.toLoc === projectId ? 'in' : 'out',
        itemType: t.itemType, item: t.item, unit: t.unit,
        qty: parseFloat(t.qty) || 0,
        reason: t.reason || '',
        transferDate: fmtDate_(t.transferDate),
        status: t.status,
        requestedBy: t.requestedBy || ''
      };
    })
    .sort(function (a, b) { return a.transferDate < b.transferDate ? 1 : -1; });
}
/**
 * requestTransferBatch (v8) - Multiple items in ONE transfer request.
 * data = { fromLoc, toLoc, itemType, transferDate, reason,
 *          items: [{ item, qty }, ...] }
 * Creates one Transfer row per item (each approved individually by an
 * admin, same single-signature flow), sharing the same date/reason.
 * Validates the WHOLE batch against source stock before writing
 * anything, aggregating duplicate item lines, so a batch can never be
 * half-created.
 */
function requestTransferBatch(data) {
  requireLogin_();
  var fromLoc = String(data && data.fromLoc || '').trim();
  var toLoc = String(data && data.toLoc || '').trim();
  var itemType = String(data && data.itemType || 'Material').trim();
  var items = (data && data.items) || [];

  if (!fromLoc || !toLoc) throw new Error('Both source and destination are required.');
  if (fromLoc === toLoc) throw new Error('Source and destination must be different.');
  if (itemType !== 'Material' && itemType !== 'Equipment') throw new Error('Invalid item type.');
  if (!items.length) throw new Error('Add at least one item to transfer.');

  var canFrom = fromLoc === WAREHOUSE_LOC || canEditProject_(fromLoc);
  var canTo = toLoc === WAREHOUSE_LOC || canEditProject_(toLoc);
  if (!canFrom && !canTo) {
    throw new Error('You must be an editor of either the source or the destination project.');
  }

  // aggregate duplicate lines, then validate the batch as a whole
  var want = {};
  items.forEach(function (it) {
    var nm = String(it && it.item || '').trim();
    var q = parseFloat(it && it.qty);
    if (!nm) throw new Error('Every line must have an item selected.');
    if (isNaN(q) || q <= 0) throw new Error('Quantity for "' + nm + '" must be greater than zero.');
    want[nm] = (want[nm] || 0) + q;
  });
  var stock = availableAt_(fromLoc, itemType);
  Object.keys(want).forEach(function (nm) {
    var avail = stock[nm] ? stock[nm].qty : 0;
    if (want[nm] > avail + 0.0001) {
      throw new Error('Only ' + avail + ' ' + (stock[nm] ? stock[nm].unit : '') + ' of "' + nm + '" available at the source.');
    }
  });

  var tz = Session.getScriptTimeZone();
  var dateStr = data.transferDate || Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');
  var reason = String(data.reason || '').trim();
  var ids = [];
  items.forEach(function (it) {
    var nm = String(it.item).trim();
    var id = nextId_('TRF');
    ids.push(id);
    appendRow_('Transfers', {
      id: id,
      fromLoc: fromLoc,
      toLoc: toLoc,
      itemType: itemType,
      item: nm,
      unit: stock[nm] ? stock[nm].unit : '',
      qty: parseFloat(it.qty),
      reason: reason,
      transferDate: dateStr,
      status: 'Pending',
      requestedBy: currentUserEmail_(),
      createdAt: new Date(),
      decidedBy: '',
      decidedAt: ''
    });
  });
  logActivity_('Transfer batch (' + ids.length + ' item' + (ids.length > 1 ? 's' : '') + '): ' +
    fromLoc + ' → ' + toLoc + ' [' + ids.join(', ') + '] (for approval)', 'blue', ids[0]);
  return { success: true, ids: ids, count: ids.length };
}
