import { QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import 'leaflet/dist/leaflet.css';
import './index.css';
import { App } from './App';
import { initAuth } from './lib/auth';
import { queryClient } from './lib/queries';
import { initStore } from './lib/store';

// ログイン中のユーザーを API に確かめてから画面を出す（ストアに入れるため、ストアの後に読む）
initStore()
  .then(initAuth)
  .then(() => {
    createRoot(document.getElementById('root')!).render(
      <StrictMode>
        <QueryClientProvider client={queryClient}>
          <App />
        </QueryClientProvider>
      </StrictMode>,
    );
  });
