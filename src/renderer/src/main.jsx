import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/barlow/600.css'
import '@fontsource/barlow-condensed/700.css'
import '@fontsource/barlow-condensed/800.css'
import '@fontsource/dm-sans/400.css'
import '@fontsource/dm-sans/600.css'
import '@fontsource/jetbrains-mono/400.css'
import './styles.css'
import './studio.css'
import App from './App'
import ErrorBoundary from './components/ErrorBoundary'
import ChatWindow from './components/ChatWindow'

// the chat popped out into its own window opens this page at #chat (main process openChatWindow)
const chatOnly = window.location.hash === '#chat'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      {chatOnly ? <ChatWindow /> : <App />}
    </ErrorBoundary>
  </StrictMode>
)
