'use strict';

const fs = require('node:fs');
const path = require('node:path');

const source = path.resolve(__dirname, '..', 'invitation-source');
const destination = path.resolve(__dirname, '..', 'invitation');
const files = [
  ['index.html', 'index.html'],
  ['editor.html', 'editor.html'],
  ['assets/Marriage.mp3', 'assets/Marriage.mp3']
];

for (const [sourceRelativePath, destinationRelativePath] of files) {
  const sourcePath = path.join(source, sourceRelativePath);
  if (!fs.existsSync(sourcePath)) {
    throw new Error(`The wedding invitation source file is missing: ${sourcePath}`);
  }

  const destinationPath = path.join(destination, destinationRelativePath);
  fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
  fs.copyFileSync(sourcePath, destinationPath);
}
