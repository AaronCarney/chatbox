import dotenv from 'dotenv';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '..', '..', '..', '.env') });

import { seed } from './seed.js';

seed()
  .then(() => { console.log('Seeded 3 apps (chess, go, spotify)'); process.exit(0); })
  .catch((e) => { console.error('Seed failed:', e.message); process.exit(1); });
