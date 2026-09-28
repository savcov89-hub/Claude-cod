import { db, error, json, requireAuth, router } from '@appdeploy/sdk';
import { createHandler, type Sdk } from './app';

// All request logic lives in ./app so the test build can run the same code in the browser.
export const handler = createHandler({ db, error, json, requireAuth, router } as unknown as Sdk);
