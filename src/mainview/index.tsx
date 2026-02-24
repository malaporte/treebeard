import React from 'react'
import ReactDOM from 'react-dom/client'
import { Electroview } from 'electrobun/view'
import App from '../App'
import type { TreebeardRPC } from '../shared/rpc-types'

// --- Electroview RPC setup ---

const rpc = Electroview.defineRPC<TreebeardRPC>({
  handlers: {
    requests: {},
    messages: {}
  }
})

const electroview = new Electroview({ rpc })

// Expose the RPC instance globally so hooks can access it
;(window as any).__electrobun = electroview

// --- React mount ---

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
