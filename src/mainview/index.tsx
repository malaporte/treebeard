import { StrictMode } from 'react'
import ReactDOM from 'react-dom/client'
import { Electroview } from 'electrobun/view'
import './styles.css'
import App from '../App'
import type { TreebeardRPC } from '../shared/rpc-types'

// --- Electroview RPC setup ---

const rpc = Electroview.defineRPC<TreebeardRPC>({
  maxRequestTime: 30000,
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
  <StrictMode>
    <App />
  </StrictMode>
)
