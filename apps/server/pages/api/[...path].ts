import type { NextApiRequest, NextApiResponse } from 'next';
import { createApp } from '@clinic/api';

const app = createApp();

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  return app(req, res);
}

export const config = {
  api: {
    bodyParser: false,
  },
};
