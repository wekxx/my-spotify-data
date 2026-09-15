import { Analytics } from '@vercel/analytics/react'
import { Capacitor } from '@capacitor/core'
import React from 'react'
import ReactDOM from 'react-dom/client'
import './styles.css'
import { App } from './App'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
    {import.meta.env.PROD && !Capacitor.isNativePlatform() && <Analytics />}
  </React.StrictMode>,
)
