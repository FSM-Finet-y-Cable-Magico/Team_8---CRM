const fs = require('node:fs');
const ts = require('typescript');
const source = fs.readFileSync(require('node:path').resolve(__dirname, '../../src/shared/components/ChileanPhoneInput.tsx'), 'utf8');
const exportsObject = {};
new Function('require', 'exports', ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText)(require, exportsObject);
module.exports = exportsObject;
