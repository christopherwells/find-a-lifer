import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { LifeListProvider } from './contexts/LifeListContext'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LifeListProvider>
      <App />
    </LifeListProvider>
  </StrictMode>,
)
