import React from 'react';
import ReactDOM from 'react-dom/client';
import { ErrorBoundary } from './ErrorBoundary'; // This import will now work
import SomniaStreamApp from './SomniaStreamApp';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <SomniaStreamApp />
    </ErrorBoundary>
  </React.StrictMode>
);