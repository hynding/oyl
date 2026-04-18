import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import { CheckboxGroup, type CheckboxOption } from './CheckboxGroup';

const meta: Meta<typeof CheckboxGroup> = {
  title: 'Common/Inputs/CheckboxGroup',
  component: CheckboxGroup,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  argTypes: {
    orientation: {
      control: 'select',
      options: ['horizontal', 'vertical'],
    },
    size: {
      control: 'select',
      options: ['small', 'medium', 'large'],
    },
    disabled: {
      control: 'boolean',
    },
  },
};

export default meta;
type Story = StoryObj<typeof CheckboxGroup>;

const basicOptions: CheckboxOption[] = [
  { value: 'option1', label: 'Option 1' },
  { value: 'option2', label: 'Option 2' },
  { value: 'option3', label: 'Option 3' },
];

const optionsWithDescriptions: CheckboxOption[] = [
  {
    value: 'email',
    label: 'Email Notifications',
    description: 'Receive updates via email',
  },
  {
    value: 'sms',
    label: 'SMS Notifications',
    description: 'Receive text message alerts',
  },
  {
    value: 'push',
    label: 'Push Notifications',
    description: 'Get notifications on your device',
  },
];

const featureOptions: CheckboxOption[] = [
  {
    value: 'analytics',
    label: 'Analytics',
    description: 'Track and analyze user behavior',
  },
  {
    value: 'collaboration',
    label: 'Team Collaboration',
    description: 'Work together with your team',
  },
  {
    value: 'api',
    label: 'API Access',
    description: 'Integrate with external services',
  },
  {
    value: 'support',
    label: 'Priority Support',
    description: '24/7 customer support access',
  },
];

const ControlledCheckboxGroup = (args: typeof meta extends Meta<infer T> ? T : never) => {
  const [selectedValues, setSelectedValues] = useState(args.value || []);

  return (
    <CheckboxGroup
      {...args}
      value={selectedValues}
      onChange={setSelectedValues}
    />
  );
};

export const Default: Story = {
  render: ControlledCheckboxGroup,
  args: {
    name: 'default',
    options: basicOptions,
    value: ['option1'],
  },
};

export const WithLabel: Story = {
  render: ControlledCheckboxGroup,
  args: {
    name: 'withLabel',
    label: 'Select options',
    options: basicOptions,
    value: ['option1', 'option2'],
  },
};

export const WithDescriptions: Story = {
  render: ControlledCheckboxGroup,
  args: {
    name: 'withDescriptions',
    label: 'Notification Preferences',
    options: optionsWithDescriptions,
    value: ['email', 'push'],
  },
};

export const WithHelperText: Story = {
  render: ControlledCheckboxGroup,
  args: {
    name: 'withHelper',
    label: 'Add-on Features',
    options: featureOptions,
    helperText: 'Select the features you want to enable',
    value: ['analytics'],
  },
};

export const WithError: Story = {
  render: ControlledCheckboxGroup,
  args: {
    name: 'withError',
    label: 'Terms and Conditions',
    options: [
      { value: 'terms', label: 'I agree to the terms and conditions' },
      { value: 'privacy', label: 'I agree to the privacy policy' },
    ],
    error: 'You must agree to both terms and privacy policy',
  },
};

export const Horizontal: Story = {
  render: ControlledCheckboxGroup,
  args: {
    name: 'horizontal',
    label: 'Select sizes',
    options: [
      { value: 'xs', label: 'XS' },
      { value: 's', label: 'S' },
      { value: 'm', label: 'M' },
      { value: 'l', label: 'L' },
      { value: 'xl', label: 'XL' },
    ],
    orientation: 'horizontal',
    value: ['m', 'l'],
  },
};

export const Small: Story = {
  render: ControlledCheckboxGroup,
  args: {
    name: 'small',
    label: 'Small Size',
    options: basicOptions,
    size: 'small',
    value: ['option1'],
  },
};

export const Medium: Story = {
  render: ControlledCheckboxGroup,
  args: {
    name: 'medium',
    label: 'Medium Size',
    options: basicOptions,
    size: 'medium',
    value: ['option1'],
  },
};

export const Large: Story = {
  render: ControlledCheckboxGroup,
  args: {
    name: 'large',
    label: 'Large Size',
    options: basicOptions,
    size: 'large',
    value: ['option1'],
  },
};

export const Disabled: Story = {
  render: ControlledCheckboxGroup,
  args: {
    name: 'disabled',
    label: 'Disabled Group',
    options: basicOptions,
    value: ['option1', 'option2'],
    disabled: true,
  },
};

export const PartiallyDisabled: Story = {
  render: ControlledCheckboxGroup,
  args: {
    name: 'partiallyDisabled',
    label: 'Some Options Disabled',
    options: [
      { value: 'option1', label: 'Available Option 1' },
      { value: 'option2', label: 'Disabled Option', disabled: true },
      { value: 'option3', label: 'Available Option 2' },
    ],
    value: ['option1'],
  },
};

export const AllSelected: Story = {
  render: ControlledCheckboxGroup,
  args: {
    name: 'allSelected',
    label: 'All Selected',
    options: basicOptions,
    value: ['option1', 'option2', 'option3'],
  },
};

export const NoneSelected: Story = {
  render: ControlledCheckboxGroup,
  args: {
    name: 'noneSelected',
    label: 'None Selected',
    options: basicOptions,
    value: [],
  },
};
