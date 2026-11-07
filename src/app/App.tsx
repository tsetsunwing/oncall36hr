import { useCallback, useEffect, useMemo, useState } from 'react';
import { testConnection, type DevProxy } from '@/ai';
import { ui } from '@/i18n';
import { loadSettings, saveSettings, type SaveSlotView, type Settings } from '@/storage';
import { Layout, SettingsPage, StartPage } from '@/ui';
import { selectStartGate } from '@/view';
import { GameScreen } from './GameScreen';
import { createLazySaveService } from './lazySaves';
import { navigate, navigateToGame, useRoute } from './router';
import { whenSavesSettled } from './saveFlush';

function downloadJson(filename: string, payload: string) {
  const blob = new Blob([payload], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function saveErrorText(code: string): string {
  return ui.saves.errors[code] ?? ui.saves.errors.UNKNOWN ?? code;
}

const devProxy: DevProxy | undefined = import.meta.env.DEV ? { prefix: '/ai-proxy' } : undefined;

export function App() {
  const route = useRoute();
  const [settings, setSettings] = useState<Settings>(() => loadSettings());
  const gate = selectStartGate(settings);
  const saves = useMemo(() => createLazySaveService(), []);
  const [slots, setSlots] = useState<SaveSlotView[]>([]);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  const refreshSlots = useCallback(async () => {
    try {
      setSlots(await saves.list());
    } catch {
      setSlots([]);
      setSaveMessage(ui.saves.unavailable);
    }
  }, [saves]);

  useEffect(() => {
    if (route === 'game' && !gate.canStart) navigate('start');
  }, [route, gate.canStart]);

  useEffect(() => {
    if (route !== 'start') return;
    let cancel = false;
    void whenSavesSettled().then(() => {
      if (!cancel) void refreshSlots();
    });
    return () => {
      cancel = true;
    };
  }, [route, refreshSlots]);

  const handleSave = useCallback((next: Settings) => {
    saveSettings(next);
    setSettings(next);
  }, []);

  const handleTest = useCallback(
    (candidate: Settings) => testConnection(candidate, devProxy ? { proxy: devProxy } : {}),
    [],
  );

  if (route === 'settings') {
    return (
      <Layout current="settings">
        <SettingsPage initial={settings} onSave={handleSave} onTestConnection={handleTest} />
      </Layout>
    );
  }

  if (route === 'game' && gate.canStart) {
    return (
      <Layout current="game">
        <GameScreen settings={settings} devProxy={devProxy} />
      </Layout>
    );
  }

  return (
    <Layout current="start">
      <StartPage
        gate={gate}
        settings={settings}
        onSettingsChange={handleSave}
        onStart={navigateToGame}
        slots={slots}
        saveMessage={saveMessage}
        onContinue={(id) => {
          window.location.hash = `#/game?slot=${encodeURIComponent(id)}`;
        }}
        onDelete={(id) => {
          void saves.remove(id).then(() => refreshSlots());
        }}
        onExport={(id) => {
          void saves.exportSlot(id).then((result) => {
            if (!result.ok) {
              setSaveMessage(saveErrorText(result.error));
              return;
            }
            downloadJson(result.filename, result.payload);
          });
        }}
        onImport={(slot, json) => {
          void saves.importManual(slot, json).then((result) => {
            if (!result.ok) {
              setSaveMessage(saveErrorText(result.error));
              return;
            }
            setSaveMessage(result.migratedFrom === null ? ui.saves.imported : ui.saves.migrated);
            void refreshSlots();
          });
        }}
      />
    </Layout>
  );
}
