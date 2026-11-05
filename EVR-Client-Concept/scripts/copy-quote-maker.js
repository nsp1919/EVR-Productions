'use strict';

const fs = require('node:fs');
const path = require('node:path');

const source = path.resolve(__dirname, '..', '..', 'Quote', 'EVR Productions Quote Maker.html');
const destination = path.resolve(__dirname, '..', 'quote-maker.html');

if (!fs.existsSync(source)) {
  throw new Error(`The standalone quotation source file is missing: ${source}`);
}

fs.copyFileSync(source, destination);
