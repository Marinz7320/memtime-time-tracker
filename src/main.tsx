import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApiError } from './api/http';
import { ToastProvider } from './components/Toasts';
import App from './App';
import './styles.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Retrying 4xx answers never helps, and every retry spends the 15 req/min budget.
      // 429s are already retried inside the HTTP client; retry network/5xx once.
      // A cancelled request must stay cancelled.
      retry: (count, err) => count < 1 && (!(err instanceof ApiError) || err.kind === 'network' || err.status >= 500),
      refetchOnWindowFocus: false,
    },
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <App />
      </ToastProvider>
    </QueryClientProvider>
  </StrictMode>,
);
