'use strict';

/**
 * consumable-serving service
 */

const { createCoreService } = require('@strapi/strapi').factories;

module.exports = createCoreService('api::consumable-serving.consumable-serving');
