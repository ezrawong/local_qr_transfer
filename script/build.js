'use strict';

const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const modules = [];
const ids = new Map();

function bundle(filename) {
  filename = require.resolve(filename);
  if (ids.has(filename)) return ids.get(filename);
  const id = modules.length;
  ids.set(filename, id);
  modules.push('');
  const source = fs.readFileSync(filename, 'utf8').replace(
    /require\((['"])([^'"]+)\1\)/g,
    (_, quote, request) => {
      // qrcode's optional string optimizer uses Dijkstra; keep that helper local.
      if (request === 'dijkstrajs') return `require(${bundle(path.join(root, 'src', 'shortest-path.js'))})`;
      if (request.startsWith('qrcode/')) return `require(${bundle(require.resolve(request, { paths: [path.dirname(filename)] }))})`;
      if (!request.startsWith('.')) throw new Error(`Unexpected external module ${request} in ${filename}`);
      return `require(${bundle(path.resolve(path.dirname(filename), request))})`;
    }
  );
  modules[id] = `function(module,exports,require){\n${source}\n}`;
  return id;
}

const entry = bundle(path.join(root, 'src', 'app.js'));
const javascript = `(function(){'use strict';const modules=[${modules.join(',\n')}];const cache={};function require(id){if(cache[id])return cache[id].exports;const module=cache[id]={exports:{}};modules[id](module,module.exports,require);return module.exports;}require(${entry});})();`;
const template = fs.readFileSync(path.join(root, 'src', 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'src', 'style.css'), 'utf8');
const license = fs.readFileSync(path.join(root, 'node_modules', 'qrcode', 'license'), 'utf8');
const html = template.replace('/* INLINE_CSS */', css).replace('/* INLINE_JS */', () =>
  `/* qrcode license:\n${license.replace(/\*\//g, '* /')}\n*/\n${javascript.replace(/<\/script/gi, '<\\/script')}`);
const output = path.join(root, 'dist', 'index.html');
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, html);
console.log(`Built dist\\index.html (${(Buffer.byteLength(html) / 1024).toFixed(1)} KiB), no external assets.`);
