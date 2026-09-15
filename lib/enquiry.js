'use strict';

const PROJECT_TYPES = new Set([
  'Residential — New Construction',
  'Residential — Renovation',
  'Commercial — New Construction',
  'Commercial — Renovation',
  'Consultation Only'
]);

const DEFAULT_EMAIL = 'divya.rallapalli.1@gmail.com';
const DEFAULT_WHATSAPP = '918129991282';

function envValue(env, key, fallback) {
  const value = env && env[key];
  return (value == null || String(value).trim() === '') ? fallback : String(value).trim();
}

function digitsOnly(value) {
  return String(value || '').replace(/\D/g, '');
}

function buildEnquiryMessage(data) {
  return [
    'New project enquiry from the DKN Projects website:',
    '',
    'Name: ' + data.name,
    'Phone: ' + data.phone,
    'Email: ' + data.email,
    'Project type: ' + data.projectType,
    '',
    data.details
  ].join('\n');
}

function validateEnquiry(input) {
  const data = {
    name: String((input && input.name) || '').trim(),
    phone: String((input && input.phone) || '').trim(),
    email: String((input && input.email) || '').trim(),
    projectType: String((input && input.projectType) || '').trim(),
    details: String((input && input.details) || '').trim()
  };

  if (data.name.length < 2 || data.name.length > 120) {
    return { ok: false, error: 'Please enter your full name.' };
  }
  const phoneDigits = digitsOnly(data.phone);
  if (phoneDigits.length < 8 || phoneDigits.length > 15) {
    return { ok: false, error: 'Please enter a valid phone number.' };
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email) || data.email.length > 160) {
    return { ok: false, error: 'Please enter a valid email address.' };
  }
  if (!PROJECT_TYPES.has(data.projectType)) {
    return { ok: false, error: 'Please select a project type.' };
  }
  if (data.details.length < 5 || data.details.length > 4000) {
    return { ok: false, error: 'Please tell us a little about your project.' };
  }

  return { ok: true, data };
}

async function readJsonBody(req) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
    return req.body;
  }
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8').trim();
  if (!raw) return {};
  return JSON.parse(raw);
}

function json(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(payload));
}

async function postWebhook(url, payload, fetchFn) {
  const response = await fetchFn(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    throw new Error('Provider returned ' + response.status);
  }
  return response;
}

async function sendEmail(data, message, env, fetchFn) {
  const to = envValue(env, 'ENQUIRY_EMAIL', DEFAULT_EMAIL);
  const subject = 'DKN Projects enquiry from ' + data.name;
  const webhook = envValue(env, 'ENQUIRY_EMAIL_WEBHOOK', '');
  if (webhook) {
    await postWebhook(webhook, { channel: 'email', to: to, subject: subject, message: message, visitor: data }, fetchFn);
    return { provider: 'webhook', to: to };
  }
  const resendKey = envValue(env, 'RESEND_API_KEY', '');

  if (resendKey) {
    const response = await fetchFn('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + resendKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'DKN Projects <onboarding@resend.dev>',
        to: [to],
        reply_to: data.email,
        subject: subject,
        text: message
      })
    });
    if (!response.ok) {
      throw new Error('Email provider returned ' + response.status);
    }
    return { provider: 'resend', to: to };
  }

  const response = await fetchFn('https://formsubmit.co/ajax/' + encodeURIComponent(to), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json'
    },
    body: JSON.stringify({
      _subject: subject,
      _template: 'table',
      _captcha: 'false',
      name: data.name,
      phone: data.phone,
      email: data.email,
      projectType: data.projectType,
      message: data.details,
      enquiry: message
    })
  });
  if (!response.ok) {
    throw new Error('Email provider returned ' + response.status);
  }
  const payload = await response.json().catch(function () { return {}; });
  if (payload && payload.success === false) {
    throw new Error(payload.message || 'Email was not accepted');
  }
  return { provider: 'formsubmit', to: to };
}

async function sendWhatsApp(data, message, env, fetchFn) {
  const to = digitsOnly(envValue(env, 'ENQUIRY_WHATSAPP', DEFAULT_WHATSAPP));
  const webhook = envValue(env, 'ENQUIRY_WHATSAPP_WEBHOOK', '');
  if (webhook) {
    await postWebhook(webhook, { channel: 'whatsapp', to: to, message: message, visitor: data }, fetchFn);
    return { provider: 'webhook', to: to };
  }
  const token = envValue(env, 'WHATSAPP_ACCESS_TOKEN', '');
  const phoneId = envValue(env, 'WHATSAPP_PHONE_NUMBER_ID', '');
  const twilioSid = envValue(env, 'TWILIO_ACCOUNT_SID', '');
  const twilioToken = envValue(env, 'TWILIO_AUTH_TOKEN', '');
  const twilioFrom = envValue(env, 'TWILIO_WHATSAPP_FROM', '');
  const callmebotKey = envValue(env, 'CALLMEBOT_APIKEY', '');

  if (token && phoneId) {
    const response = await fetchFn('https://graph.facebook.com/v21.0/' + encodeURIComponent(phoneId) + '/messages', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + token,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: to,
        type: 'text',
        text: { body: message.slice(0, 4000) }
      })
    });
    if (!response.ok) {
      throw new Error('WhatsApp provider returned ' + response.status);
    }
    return { provider: 'meta', to: to };
  }

  if (twilioSid && twilioToken && twilioFrom) {
    const body = new URLSearchParams({
      From: twilioFrom,
      To: 'whatsapp:+' + to,
      Body: message.slice(0, 1600)
    });
    const response = await fetchFn('https://api.twilio.com/2010-04-01/Accounts/' + encodeURIComponent(twilioSid) + '/Messages.json', {
      method: 'POST',
      headers: {
        Authorization: 'Basic ' + Buffer.from(twilioSid + ':' + twilioToken).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: body.toString()
    });
    if (!response.ok) {
      throw new Error('WhatsApp provider returned ' + response.status);
    }
    return { provider: 'twilio', to: to };
  }

  if (callmebotKey) {
    const url = 'https://api.callmebot.com/whatsapp.php?phone=' + encodeURIComponent(to)
      + '&text=' + encodeURIComponent(message)
      + '&apikey=' + encodeURIComponent(callmebotKey);
    const response = await fetchFn(url, { method: 'GET' });
    if (!response.ok) {
      throw new Error('WhatsApp provider returned ' + response.status);
    }
    return { provider: 'callmebot', to: to };
  }

  throw new Error('WhatsApp is not configured');
}

async function deliverEnquiry(data, env, fetchFn) {
  const runtime = env || process.env;
  const http = fetchFn || fetch;
  const message = buildEnquiryMessage(data);
  const [emailResult, whatsappResult] = await Promise.allSettled([
    sendEmail(data, message, runtime, http),
    sendWhatsApp(data, message, runtime, http)
  ]);

  return {
    email: emailResult.status === 'fulfilled'
      ? { ok: true, to: emailResult.value.to }
      : { ok: false, error: emailResult.reason && emailResult.reason.message ? emailResult.reason.message : 'Email failed' },
    whatsapp: whatsappResult.status === 'fulfilled'
      ? { ok: true, to: whatsappResult.value.to }
      : { ok: false, error: whatsappResult.reason && whatsappResult.reason.message ? whatsappResult.reason.message : 'WhatsApp failed' }
  };
}

async function handleEnquiryRequest(req, res, env, fetchFn) {
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }
  if (req.method !== 'POST') {
    json(res, 405, { ok: false, error: 'Use POST.' });
    return;
  }

  let body;
  try {
    body = await readJsonBody(req);
  } catch (err) {
    json(res, 400, { ok: false, error: 'Invalid request.' });
    return;
  }

  if (body && String(body.company || '').trim()) {
    json(res, 200, { ok: true, email: { ok: true }, whatsapp: { ok: true } });
    return;
  }

  const parsed = validateEnquiry(body);
  if (!parsed.ok) {
    json(res, 400, { ok: false, error: parsed.error });
    return;
  }

  const result = await deliverEnquiry(parsed.data, env || process.env, fetchFn || fetch);
  const ok = result.email.ok && result.whatsapp.ok;
  json(res, ok ? 200 : 502, {
    ok: ok,
    email: { ok: result.email.ok },
    whatsapp: { ok: result.whatsapp.ok },
    error: ok ? undefined : (result.email.ok ? 'WhatsApp could not be sent.' : result.whatsapp.ok ? 'Email could not be sent.' : 'Email and WhatsApp could not be sent.')
  });
}

module.exports = {
  PROJECT_TYPES,
  buildEnquiryMessage,
  validateEnquiry,
  deliverEnquiry,
  handleEnquiryRequest
};
