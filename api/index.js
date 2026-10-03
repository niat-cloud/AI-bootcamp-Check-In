// Vercel serverless entry: every /api/* request is handled by the Express app.
// The server is compiled to server/dist by `npm run build` before functions are bundled.
import { createApp } from '../server/dist/app.js';

export default createApp();
