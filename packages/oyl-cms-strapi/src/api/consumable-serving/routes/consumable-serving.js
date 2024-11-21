'use strict';

/**
 * consumable-serving router
 */

const { createCoreRouter } = require('@strapi/strapi').factories;

module.exports = createCoreRouter('api::consumable-serving.consumable-serving');
