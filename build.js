#!/usr/bin/env node

const { execSync } = require('child_process');

try {
  // Installer Vite si pas présent
  execSync('npm list vite || npm install vite', { stdio: 'inherit' });
  
  // Lancer le build
  execSync('npx vite build', { stdio: 'inherit' });
} catch (error) {
  console.error('Build failed:', error);
  process.exit(1);
}