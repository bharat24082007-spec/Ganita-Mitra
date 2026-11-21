import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App.jsx';
import { registerServiceWorker } from './lib/swRegister.js';
import { NexenInspector } from './components/_internal/NexenInspector';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
    {import.meta.env.DEV && <NexenInspector />}
		</React.StrictMode>
);

// Register after first render so the app shell is never blocked by SW setup
registerServiceWorker();
