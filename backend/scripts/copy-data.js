const fs = require('fs');
const path = require('path');

function copyDir(src, dest) {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }

  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

// Copy data folder to dist/data
const dataDir = path.join(__dirname, '../data');
const distDataDir = path.join(__dirname, '../dist/data');

console.log('Copying data files to dist/data...');
copyDir(dataDir, distDataDir);
console.log('✅ Data files copied successfully!');
