import { getConfig } from '@/content';
import { openSaveDb, createSaveRepository } from '@/storage';
import { APP_VERSION } from './appVersion';
import { createSaveService, type SaveService } from './saveService';

/** 第一次存檔先開 IndexedDB；開唔到（例如私隱模式）就由 session 嘅 onSaveError 處理，遊戲照玩。 */
export function createLazySaveService(): SaveService {
  let service: Promise<SaveService> | null = null;
  const get = () => {
    service ??= openSaveDb().then((db) =>
      createSaveService(createSaveRepository({ db, slots: getConfig().saves }), APP_VERSION),
    );
    return service;
  };
  return {
    save: async (state, target) => (await get()).save(state, target),
    load: async (slotId) => (await get()).load(slotId),
    list: async () => (await get()).list(),
    remove: async (slotId) => (await get()).remove(slotId),
    exportSlot: async (slotId) => (await get()).exportSlot(slotId),
    importManual: async (slot, json) => (await get()).importManual(slot, json),
  };
}
