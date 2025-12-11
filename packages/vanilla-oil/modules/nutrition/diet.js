/**
 * @typedef Diet
 * @property {string} name - The name of the diet.
 * @property {string} description - A brief description of the diet.
 * @property {string[]} foods - An array of foods included in the diet.
 */

export function getDiet(name = '') {
  const diets = {
    vegan: {
      name: 'Vegan',
      description: 'A diet that excludes all animal products.',
      foods: ['Fruits', 'Vegetables', 'Grains', 'Legumes', 'Nuts', 'Seeds'],
    },
    vegetarian: {
      name: 'Vegetarian',
      description: 'A diet that excludes meat, but may include dairy and eggs.',
      foods: ['Fruits', 'Vegetables', 'Grains', 'Legumes', 'Nuts', 'Seeds', 'Dairy', 'Eggs'],
    },
    paleo: {
      name: 'Paleo',
      description: 'A diet based on the types of foods presumed to have been eaten by early humans.',
      foods: ['Meat', 'Fish', 'Fruits', 'Vegetables', 'Nuts'],
    },
  };

  return diets[name] || null;
}

/**
 * 
 * @param {Diet.name} name 
 * @param {Diet.description} description 
 * @param {Diet.foods} foods 
 * @returns {Diet}
 */
export function createDiet(name, description, foods) {
  return {
    name,
    description,
    foods,
  };
}

const diet = createDiet()