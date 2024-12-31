import type { Schema, Struct } from "@strapi/strapi"

export interface DietDailyConsumables extends Struct.ComponentSchema {
  collectionName: "components_diet_daily_consumables"
  info: {
    description: ""
    displayName: "Daily Consumables"
    icon: "restaurant"
  }
  attributes: {
    consumable: Schema.Attribute.Relation<
      "oneToOne",
      "api::consumable.consumable"
    >
    servings: Schema.Attribute.Decimal &
      Schema.Attribute.Required &
      Schema.Attribute.SetMinMax<
        {
          min: 0.01
        },
        number
      >
    time: Schema.Attribute.Time & Schema.Attribute.Required
  }
}

export interface ResumeExperience extends Struct.ComponentSchema {
  collectionName: "components_resume_experiences"
  info: {
    displayName: "Experience"
    icon: "layer"
  }
  attributes: {
    dateEnd: Schema.Attribute.Date
    dateStart: Schema.Attribute.Date & Schema.Attribute.Required
    description: Schema.Attribute.RichText
    location: Schema.Attribute.String
    name: Schema.Attribute.String & Schema.Attribute.Required
    url: Schema.Attribute.String
  }
}

export interface ResumeSkillType extends Struct.ComponentSchema {
  collectionName: "components_resume_skill_types"
  info: {
    description: ""
    displayName: "Skill Field"
    icon: "bulletList"
  }
  attributes: {
    name: Schema.Attribute.String
    skills: Schema.Attribute.Component<"resume.skills", true>
  }
}

export interface ResumeSkills extends Struct.ComponentSchema {
  collectionName: "components_resume_skills"
  info: {
    description: ""
    displayName: "Skill"
    icon: "cloud"
  }
  attributes: {
    experience: Schema.Attribute.Enumeration<
      ["Beginner", "Intermediate", "Advanced", "Expert"]
    > &
      Schema.Attribute.DefaultTo<"Intermediate">
    name: Schema.Attribute.String
  }
}

declare module "@strapi/strapi" {
  export module Public {
    export interface ComponentSchemas {
      "diet.daily-consumables": DietDailyConsumables
      "resume.experience": ResumeExperience
      "resume.skill-type": ResumeSkillType
      "resume.skills": ResumeSkills
    }
  }
}
