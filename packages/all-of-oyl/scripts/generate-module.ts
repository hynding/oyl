// create a script that generates a module boilerplate
// the module should have a folder structure like this:
// module-name/
//   ├── module-name-tuples.ts
//   ├── index.ts

import * as fs from 'fs';
import * as path from 'path';

const modulePath = process.argv[2];

if (!modulePath) {
  console.error('Please provide a module path');
  process.exit(1);
}

// Split the path to get the module name and parent path
const pathParts = modulePath.split('/');
const moduleName = pathParts[pathParts.length - 1];
const moduleDir = path.join(__dirname, '..', modulePath);

if (!fs.existsSync(moduleDir)) {
  fs.mkdirSync(moduleDir, { recursive: true });
}

const pascalCaseName = toPascalCase(moduleName);

const tuplesContent = `export type T${pascalCaseName} = {
  id: number;
  name: string;
};
`;

const indexContent = `import { T${pascalCaseName} } from './${moduleName}-tuples';

export { T${pascalCaseName} };
`;

fs.writeFileSync(path.join(moduleDir, `${moduleName}-tuples.ts`), tuplesContent);
fs.writeFileSync(path.join(moduleDir, `index.ts`), indexContent);

console.log(`Module ${moduleName} created successfully at ${moduleDir}`);

function toPascalCase(str: string): string {
  return str
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join('');
}

// Write a comment explaining how to run this script
// To run this script, use the command: ts-node generate-module.ts <module-path>
// Replace '<module-path>' with the desired path of your module
// Use forward slashes to create nested sub-modules
// Examples:
//   ts-node generate-module.ts my-module
//   ts-node generate-module.ts parent/child
//   ts-node generate-module.ts parent/child/grandchild
// Or to run with npm script, use: npm run generate-module -- <module-path>