import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { AuthProvider } from './auth/AuthProvider'
import { ProtectedApp } from './auth/ProtectedApp'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AuthProvider>
      <ProtectedApp>
        <App />
      </ProtectedApp>
    </AuthProvider>
  </React.StrictMode>,
)
