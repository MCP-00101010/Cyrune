(function initialisePortalDelivery(global) {
  'use strict';

  // A bounded sequence of the existing, individually acknowledged game sends.
  // Payloads and delivery IDs are captured once and survive explicit retries.
  function createBatch(entries, send, changed = () => {}) {
    if (!Array.isArray(entries) || entries.length < 1 || entries.length > 100
        || new Set(entries.map(entry => entry.gameId)).size !== entries.length) {
      throw new Error('Select between 1 and 100 distinct games.');
    }
    const batchId = global.crypto.randomUUID();
    const records = entries.map((entry, index) => ({
      title: String(entry.title || 'Game').slice(0, 160),
      payload: Object.freeze({ gameId: entry.gameId, emulatorId: entry.emulatorId || '',
        profileId: entry.profileId || '', deliveryId: `arcade-batch-${batchId}-${index}` }),
      status: 'pending', message: '',
    }));
    let running = false, stopped = false;
    const snapshot = () => ({ running, records: records.map(record => ({ title: record.title, status: record.status, message: record.message })) });
    const notify = () => changed(snapshot());
    async function run() {
      if (running) return;
      running = true;
      stopped = false;
      notify();
      try {
        for (const record of records) {
          if (stopped) break;
          if (record.status === 'delivered' || record.status === 'queued') continue;
          record.status = 'sending';
          record.message = '';
          notify();
          try {
            const result = await send(record.payload);
            if (result?.ok !== true || (!result.queued && !result.persisted)) throw new Error('Unconfirmed delivery');
            record.status = result.queued ? 'queued' : 'delivered';
          } catch (error) {
            // A timeout may follow a successful save. Keep the SAME ID on retry.
            record.status = 'unconfirmed';
            record.message = String(error?.message || 'Check Relay and the game’s launch settings, then retry.').slice(0, 300);
          }
          notify();
        }
      } finally {
        running = false;
        notify();
      }
    }
    return Object.freeze({ run, stop() { stopped = true; }, snapshot });
  }

  global.ArcadePortalDelivery = Object.freeze({ createBatch });
})(globalThis);
