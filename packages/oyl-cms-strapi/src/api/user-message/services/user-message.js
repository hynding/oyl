'use strict';

/**
 * user-message service
 */

const { createCoreService } = require('@strapi/strapi').factories;

module.exports = createCoreService('api::user-message.user-message');
