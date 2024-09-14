import type { Schema, Attribute } from '@strapi/strapi';

export interface DietDailyConsumables extends Schema.Component {
  collectionName: 'components_diet_daily_consumables';
  info: {
    displayName: 'Daily Consumables';
    icon: 'restaurant';
    description: '';
  };
  attributes: {
    consumable: Attribute.Relation<
      'diet.daily-consumables',
      'oneToOne',
      'api::consumable.consumable'
    >;
    servings: Attribute.Decimal &
      Attribute.Required &
      Attribute.SetMinMax<{
        min: 0.01;
      }>;
    time: Attribute.Time & Attribute.Required;
  };
}

export interface ResumeExperience extends Schema.Component {
  collectionName: 'components_resume_experiences';
  info: {
    displayName: 'Experience';
    icon: 'layer';
  };
  attributes: {
    name: Attribute.String & Attribute.Required;
    location: Attribute.String;
    dateStart: Attribute.Date & Attribute.Required;
    dateEnd: Attribute.Date;
    description: Attribute.RichText;
    url: Attribute.String;
  };
}

export interface ResumeSkillType extends Schema.Component {
  collectionName: 'components_resume_skill_types';
  info: {
    displayName: 'Skill Field';
    icon: 'bulletList';
    description: '';
  };
  attributes: {
    name: Attribute.String;
    skills: Attribute.Component<'resume.skills', true>;
  };
}

export interface ResumeSkills extends Schema.Component {
  collectionName: 'components_resume_skills';
  info: {
    displayName: 'Skill';
    icon: 'cloud';
    description: '';
  };
  attributes: {
    name: Attribute.String;
    experience: Attribute.Enumeration<
      ['Beginner', 'Intermediate', 'Advanced', 'Expert']
    > &
      Attribute.DefaultTo<'Intermediate'>;
  };
}

declare module '@strapi/types' {
  export module Shared {
    export interface Components {
      'diet.daily-consumables': DietDailyConsumables;
      'resume.experience': ResumeExperience;
      'resume.skill-type': ResumeSkillType;
      'resume.skills': ResumeSkills;
    }
  }
}
