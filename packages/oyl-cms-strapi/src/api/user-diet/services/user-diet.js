'use strict';

/**
 * user-diet service
 */

const { createCoreService } = require('@strapi/strapi').factories;

module.exports = createCoreService('api::user-diet.user-diet');
