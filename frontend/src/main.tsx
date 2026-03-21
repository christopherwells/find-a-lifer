import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import ErrorBoundary from './components/ErrorBoundary'
import { LifeListProvider } from './contexts/LifeListContext'
import { ToastProvider } from './contexts/ToastContext'
import { AuthProvider } from './contexts/AuthContext'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary section="app">
      <AuthProvider>
        <LifeListProvider>
          <ToastProvider>
            <App />
          </ToastProvider>
        </LifeListProvider>
      </AuthProvider>
    </ErrorBoundary>
  </StrictMode>,
)
