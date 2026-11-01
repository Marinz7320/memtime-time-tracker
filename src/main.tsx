import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { shouldRetryQuery } from './api/http';
import { ToastProvider } from './components/Toasts';
import App from './App';
import './styles.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: shouldRetryQuery,
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
