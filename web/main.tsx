import { createRoot } from 'react-dom/client';
import '@radix-ui/themes/styles.css';
import '@fontsource/manrope/cyrillic-400.css';
import '@fontsource/manrope/cyrillic-500.css';
import '@fontsource/manrope/cyrillic-600.css';
import '@fontsource/manrope/cyrillic-700.css';
import '@fontsource/manrope/latin-400.css';
import '@fontsource/manrope/latin-500.css';
import '@fontsource/manrope/latin-600.css';
import '@fontsource/manrope/latin-700.css';
import './styles.css';
import App from './App';
import { OperationProvider } from './api';

const root = document.getElementById('root');
if (!root) throw new Error('Не найден корневой элемент приложения.');
createRoot(root).render(<OperationProvider><App /></OperationProvider>);
