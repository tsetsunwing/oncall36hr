import { useCallback, useEffect, useState } from 'react';
import { testConnection, type DevProxy } from '@/ai';
import { loadSettings, saveSettings, type Settings } from '@/storage';
import { Layout, SettingsPage, StartPage } from '@/ui';
import { selectStartGate } from '@/view';
import { GameScreen } from './GameScreen';
import { navigate, useRoute } from './router';

const devProxy: DevProxy | undefined = import.meta.env.DEV ? { prefix: '/ai-proxy' } : undefined;

export function App() {
  const route = useRoute();
  const [settings, setSettings] = useState<Settings>(() => loadSettings());
  const gate = selectStartGate(settings);

  useEffect(() => {
    if (route === 'game' && !gate.canStart) navigate('start');
  }, [route, gate.canStart]);

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
      <StartPage gate={gate} onStart={() => navigate('game')} />
    </Layout>
  );
}
