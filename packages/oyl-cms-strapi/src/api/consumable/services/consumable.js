'use strict';

/**
 * consumable service
 */

const { createCoreService } = require('@strapi/strapi').factories;

module.exports = createCoreService('api::consumable.consumable');
