import { createRoot } from 'react-dom/client';

import App from './App';
import { getMediaCapability } from './lib/mediaCapability';

import './index.css';

// Prime capability flags before first paint of auth/onboarding media.
getMediaCapability();

createRoot(document.getElementById('root')!).render(<App />);
