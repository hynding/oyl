import type { Struct, Schema } from '@strapi/strapi';

export interface ResumeSkills extends Struct.ComponentSchema {
  collectionName: 'components_resume_skills';
  info: {
    displayName: 'Skill';
    icon: 'cloud';
    description: '';
  };
  attributes: {
    name: Schema.Attribute.String;
    experience: Schema.Attribute.Enumeration<
      ['Beginner', 'Intermediate', 'Advanced', 'Expert']
    > &
      Schema.Attribute.DefaultTo<'Intermediate'>;
  };
}

export interface ResumeSkillType extends Struct.ComponentSchema {
  collectionName: 'components_resume_skill_types';
  info: {
    displayName: 'Skill Field';
    icon: 'bulletList';
    description: '';
  };
  attributes: {
    name: Schema.Attribute.String;
    skills: Schema.Attribute.Component<'resume.skills', true>;
  };
}

export interface ResumeExperience extends Struct.ComponentSchema {
  collectionName: 'components_resume_experiences';
  info: {
    displayName: 'Experience';
    icon: 'layer';
  };
  attributes: {
    name: Schema.Attribute.String & Schema.Attribute.Required;
    location: Schema.Attribute.String;
    dateStart: Schema.Attribute.Date & Schema.Attribute.Required;
    dateEnd: Schema.Attribute.Date;
    description: Schema.Attribute.RichText;
    url: Schema.Attribute.String;
  };
}

export interface DietDailyConsumables extends Struct.ComponentSchema {
  collectionName: 'components_diet_daily_consumables';
  info: {
    displayName: 'Daily Consumables';
    icon: 'restaurant';
    description: '';
  };
  attributes: {
    consumable: Schema.Attribute.Relation<
      'oneToOne',
      'api::consumable.consumable'
    >;
    servings: Schema.Attribute.Decimal &
      Schema.Attribute.Required &
      Schema.Attribute.SetMinMax<
        {
          min: 0.01;
        },
        number
      >;
    time: Schema.Attribute.Time & Schema.Attribute.Required;
  };
}

declare module '@strapi/strapi' {
  export module Public {
    export interface ComponentSchemas {
      'resume.skills': ResumeSkills;
      'resume.skill-type': ResumeSkillType;
      'resume.experience': ResumeExperience;
      'diet.daily-consumables': DietDailyConsumables;
    }
  }
}
