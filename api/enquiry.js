'use strict';

const { handleEnquiryRequest } = require('../lib/enquiry');

module.exports = async function handler(req, res) {
  await handleEnquiryRequest(req, res);
};
