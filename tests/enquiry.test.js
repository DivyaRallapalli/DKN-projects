'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const { validateEnquiry, deliverEnquiry, handleEnquiryRequest } = require('../lib/enquiry');

const sample = {
  name: 'Divya Test',
  phone: '9876543210',
  email: 'divya@example.com',
  projectType: 'Consultation Only',
  details: 'Need a 3BHK interior in Hyderabad'
};

describe('validateEnquiry', function () {
  it('accepts a complete enquiry', function () {
    const result = validateEnquiry(sample);
    assert.equal(result.ok, true);
    assert.equal(result.data.name, 'Divya Test');
  });

  it('rejects a missing project type', function () {
    const result = validateEnquiry(Object.assign({}, sample, { projectType: '' }));
    assert.equal(result.ok, false);
  });
});

describe('deliverEnquiry', function () {
  it('posts to both email and WhatsApp providers without a browser redirect', async function () {
    const calls = [];
    async function fakeFetch(url, options) {
      calls.push({ url: String(url), method: options && options.method, body: options && options.body });
      return {
        ok: true,
        status: 200,
        json: async function () { return { success: true }; }
      };
    }

    const env = {
      ENQUIRY_EMAIL: 'divya.rallapalli.1@gmail.com',
      ENQUIRY_WHATSAPP: '918129991282',
      CALLMEBOT_APIKEY: 'test-key'
    };

    const result = await deliverEnquiry(sample, env, fakeFetch);
    assert.equal(result.email.ok, true);
    assert.equal(result.whatsapp.ok, true);
    assert.equal(calls.length, 2);
    assert.ok(calls.some(function (c) { return c.url.includes('formsubmit.co') && c.method === 'POST'; }));
    assert.ok(calls.some(function (c) { return c.url.includes('callmebot.com') && c.url.includes('918129991282'); }));
    assert.ok(calls.every(function (c) { return !c.url.includes('wa.me') && !c.url.startsWith('mailto:'); }));
  });
});

describe('handleEnquiryRequest', function () {
  it('stays on the JSON API and reports both channels', async function () {
    const env = {
      ENQUIRY_EMAIL: 'divya.rallapalli.1@gmail.com',
      ENQUIRY_WHATSAPP: '918129991282',
      RESEND_API_KEY: 're_test',
      WHATSAPP_ACCESS_TOKEN: 'token',
      WHATSAPP_PHONE_NUMBER_ID: '123'
    };
    async function fakeFetch(url, options) {
      const parsed = options && options.body ? JSON.parse(options.body) : {};
      if (String(url).includes('resend.com')) {
        assert.equal(parsed.to[0], 'divya.rallapalli.1@gmail.com');
        assert.match(parsed.text, /Divya Test/);
      }
      if (String(url).includes('graph.facebook.com')) {
        assert.equal(parsed.to, '918129991282');
        assert.match(parsed.text.body, /3BHK/);
      }
      return { ok: true, status: 200, json: async function () { return {}; } };
    }

    const server = http.createServer(function (req, res) {
      handleEnquiryRequest(req, res, env, fakeFetch);
    });

    await new Promise(function (resolve) { server.listen(0, '127.0.0.1', resolve); });
    const port = server.address().port;
    const response = await fetch('http://127.0.0.1:' + port + '/api/enquiry', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(sample)
    });
    const payload = await response.json();
    server.close();

    assert.equal(response.status, 200);
    assert.equal(payload.ok, true);
    assert.equal(payload.email.ok, true);
    assert.equal(payload.whatsapp.ok, true);
    assert.equal(payload.redirect, undefined);
  });
});
