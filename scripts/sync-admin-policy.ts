import { synchronizeAdminPolicy } from '../src/server/adminPolicy.js';

// Runs on the hosting server during production deployment. Environment edits
// therefore update (or revoke) background-worker allowances on redeployment,
// without requiring the owner to keep a browser session open.
if (process.env.VERCEL_ENV === 'production') {
  await synchronizeAdminPolicy();
  console.log('Administrator allowance policy synchronized.');
}
