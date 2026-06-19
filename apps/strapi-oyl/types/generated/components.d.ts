import type { Schema, Struct } from "@strapi/strapi"

export interface FinanceMoney extends Struct.ComponentSchema {
  collectionName: "components_finance_money"
  info: {
    description: "A monetary amount mirroring the domain Money: minor units (biginteger, overflow-safe, negatives allowed for refunds) + ISO currency + exponent."
    displayName: "Money"
  }
  attributes: {
    currency: Schema.Attribute.String
    exponent: Schema.Attribute.Integer
    minor: Schema.Attribute.BigInteger
  }
}

export interface NutritionAdditionalNutrient extends Struct.ComponentSchema {
  collectionName: "components_nutrition_additional_nutrients"
  info: {
    description: "An extensible nutrient (registry slug + canonical-unit amount)."
    displayName: "Additional Nutrient"
  }
  attributes: {
    amount: Schema.Attribute.Decimal & Schema.Attribute.Required
    slug: Schema.Attribute.String & Schema.Attribute.Required
  }
}

export interface NutritionNutritionFacts extends Struct.ComponentSchema {
  collectionName: "components_nutrition_nutrition_facts"
  info: {
    description: "FDA nutrition facts mirroring the domain NutritionFacts: typed amount columns + nested servingSize + extensible additional nutrients. (ingredients/allergens live on consumable/consumable-product, not here \u2014 Consumption has facts but no ingredients.)"
    displayName: "Nutrition Facts"
  }
  attributes: {
    addedSugars: Schema.Attribute.Decimal
    additional: Schema.Attribute.Component<
      "nutrition.additional-nutrient",
      true
    >
    calcium: Schema.Attribute.Decimal
    calories: Schema.Attribute.Decimal
    cholesterol: Schema.Attribute.Decimal
    dietaryFiber: Schema.Attribute.Decimal
    iron: Schema.Attribute.Decimal
    potassium: Schema.Attribute.Decimal
    protein: Schema.Attribute.Decimal
    saturatedFat: Schema.Attribute.Decimal
    servingSize: Schema.Attribute.Component<"nutrition.serving-size", false>
    sodium: Schema.Attribute.Decimal
    totalCarbohydrate: Schema.Attribute.Decimal
    totalFat: Schema.Attribute.Decimal
    totalSugars: Schema.Attribute.Decimal
    transFat: Schema.Attribute.Decimal
    vitaminD: Schema.Attribute.Decimal
    waterMl: Schema.Attribute.Decimal
  }
}

export interface NutritionServingSize extends Struct.ComponentSchema {
  collectionName: "components_nutrition_serving_sizes"
  info: {
    description: "A serving size mirroring the domain ServingSize: amount + unit (+ optional household measure)."
    displayName: "Serving Size"
  }
  attributes: {
    amount: Schema.Attribute.Decimal & Schema.Attribute.Required
    household: Schema.Attribute.String
    unit: Schema.Attribute.String & Schema.Attribute.Required
  }
}

declare module "@strapi/strapi" {
  export module Public {
    export interface ComponentSchemas {
      "finance.money": FinanceMoney
      "nutrition.additional-nutrient": NutritionAdditionalNutrient
      "nutrition.nutrition-facts": NutritionNutritionFacts
      "nutrition.serving-size": NutritionServingSize
    }
  }
}
