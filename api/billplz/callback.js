export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).send('Method not allowed');
  }

  // Placeholder callback endpoint for Billplz. Add signature verification
  // and order status persistence when connecting a database.
  return res.status(200).send('OK');
}
