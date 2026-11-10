import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@/index.css';
import { App } from '@/app/app';
import { installPreloadRecovery } from '@/app/bootstrap/preload-recovery';
import { restoreSpaDeepLink } from '@/app/router/restore-deep-link';

restoreSpaDeepLink();
installPreloadRecovery();

const container = document.getElementById('root');
if (container === null) {
  throw new Error('Root element #root is missing');
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
