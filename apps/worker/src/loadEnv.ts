import { config } from 'dotenv';
import path from 'path';

const envFiles = [
  // Project root overrides
  path.resolve(__dirname, '../../../.env.local'),
  path.resolve(__dirname, '../../../.env'),
  // App-level overrides
  path.resolve(__dirname, '../../.env.local'),
  path.resolve(__dirname, '../../.env'),
  // Worker-specific overrides
  path.resolve(__dirname, '../.env.local'),
  path.resolve(__dirname, '../.env'),
];

for (const file of envFiles) {
  config({ path: file, override: true });
}


