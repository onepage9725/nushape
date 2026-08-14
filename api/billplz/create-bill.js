function makeError(message, status) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function getOrderSummary(cart) {
  if (!Array.isArray(cart) || cart.length === 0) {
    throw makeError('Cart is empty.', 400);
  }

  let total = 0;
  const parts = [];

  cart.forEach(function (item) {
    const qty = Number(item.qty || 0);
    const price = Number(item.price || 0);
    const name = String(item.name || 'NuShape Product');
    if (!Number.isFinite(qty) || !Number.isFinite(price) || qty <= 0 || price < 0) {
      throw makeError('Invalid cart item.', 400);
    }
    total += qty * price;
    parts.push(name + ' x' + qty);
  });

  const amountInSen = Math.round(total * 100);
  if (amountInSen <= 0) {
    throw makeError('Invalid amount.', 400);
  }

  return {
    amountInSen: amountInSen,
    description: parts.join(', ').slice(0, 180)
  };
}

function toFormBody(data) {
  const params = new URLSearchParams();
  Object.keys(data).forEach(function (key) {
    const value = data[key];
    if (value !== undefined && value !== null && value !== '') {
      params.append(key, String(value));
    }
  });
  return params;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  try {
    const baseUrl = process.env.BILLPLZ_BASE_URL || 'https://www.billplz.com/api/v3';
    const apiKey = process.env.BILLPLZ_API_KEY;
    const collectionId = process.env.BILLPLZ_COLLECTION_ID;
    const appBaseUrl = process.env.APP_BASE_URL;

    if (!apiKey || !collectionId || !appBaseUrl) {
      throw makeError('Missing BILLPLZ_API_KEY, BILLPLZ_COLLECTION_ID, or APP_BASE_URL.', 500);
    }

    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const customer = body.customer && typeof body.customer === 'object' ? body.customer : {};
    const cart = body.cart;

    const order = getOrderSummary(cart);

    const firstName = String(customer.firstName || '').trim();
    const lastName = String(customer.lastName || '').trim();
    const fullName = (firstName + ' ' + lastName).trim() || 'NuShape Customer';
    const mobile = String(customer.phone || '').trim();
    const email = String(customer.email || '').trim();

    if (!mobile) {
      throw makeError('Phone is required for Billplz checkout.', 400);
    }

    const callbackUrl = appBaseUrl.replace(/\/$/, '') + '/api/billplz/callback';
    const redirectUrl = appBaseUrl.replace(/\/$/, '') + '/?payment=return';
    const orderRef = 'NS-' + Date.now();

    const billPayload = {
      collection_id: collectionId,
      description: order.description,
      amount: order.amountInSen,
      name: fullName,
      mobile: mobile,
      email: email,
      callback_url: callbackUrl,
      redirect_url: redirectUrl,
      reference_1_label: 'Order ID',
      reference_1: orderRef,
      reference_2_label: 'State',
      reference_2: String(customer.state || '').trim()
    };

    const encodedCreds = Buffer.from(apiKey + ':').toString('base64');
    const response = await fetch(baseUrl.replace(/\/$/, '') + '/bills', {
      method: 'POST',
      headers: {
        Authorization: 'Basic ' + encodedCreds,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: toFormBody(billPayload)
    });

    const result = await response.json().catch(function () {
      return null;
    });

    if (!response.ok || !result || !result.url) {
      const reason = result && (result.error && result.error.message ? result.error.message : result.error);
      throw makeError('Billplz create bill failed: ' + (reason || 'Unknown error'), 502);
    }

    return res.status(200).json({
      url: result.url,
      id: result.id,
      paid: result.paid === true
    });
  } catch (error) {
    const status = error && error.status ? error.status : 500;
    return res.status(status).json({
      error: error instanceof Error ? error.message : 'Failed to create bill.'
    });
  }
}
