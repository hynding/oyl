import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import { RadioGroup, type RadioOption } from './RadioGroup';

const meta: Meta<typeof RadioGroup> = {
  title: 'Common/Inputs/RadioGroup',
  component: RadioGroup,
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
type Story = StoryObj<typeof RadioGroup>;

const basicOptions: RadioOption[] = [
  { value: 'option1', label: 'Option 1' },
  { value: 'option2', label: 'Option 2' },
  { value: 'option3', label: 'Option 3' },
];

const optionsWithDescriptions: RadioOption[] = [
  {
    value: 'free',
    label: 'Free',
    description: 'Best for personal use and small projects',
  },
  {
    value: 'pro',
    label: 'Pro',
    description: 'For professionals and growing teams',
  },
  {
    value: 'enterprise',
    label: 'Enterprise',
    description: 'For large organizations with advanced needs',
  },
];

const deliveryOptions: RadioOption[] = [
  {
    value: 'standard',
    label: 'Standard Delivery',
    description: '5-7 business days - Free',
  },
  {
    value: 'express',
    label: 'Express Delivery',
    description: '2-3 business days - $9.99',
  },
  {
    value: 'overnight',
    label: 'Overnight Delivery',
    description: 'Next business day - $24.99',
  },
];

const ControlledRadioGroup = (args: typeof meta extends Meta<infer T> ? T : never) => {
  const [selectedValue, setSelectedValue] = useState(args.value || '');

  return (
    <RadioGroup
      {...args}
      value={selectedValue}
      onChange={setSelectedValue}
    />
  );
};

export const Default: Story = {
  render: ControlledRadioGroup,
  args: {
    name: 'default',
    options: basicOptions,
    value: 'option1',
  },
};

export const WithLabel: Story = {
  render: ControlledRadioGroup,
  args: {
    name: 'withLabel',
    label: 'Choose an option',
    options: basicOptions,
    value: 'option1',
  },
};

export const WithDescriptions: Story = {
  render: ControlledRadioGroup,
  args: {
    name: 'withDescriptions',
    label: 'Select a plan',
    options: optionsWithDescriptions,
    value: 'pro',
  },
};

export const WithHelperText: Story = {
  render: ControlledRadioGroup,
  args: {
    name: 'withHelper',
    label: 'Delivery Method',
    options: deliveryOptions,
    helperText: 'Choose your preferred delivery speed',
    value: 'standard',
  },
};

export const WithError: Story = {
  render: ControlledRadioGroup,
  args: {
    name: 'withError',
    label: 'Payment Method',
    options: [
      { value: 'credit', label: 'Credit Card' },
      { value: 'debit', label: 'Debit Card' },
      { value: 'paypal', label: 'PayPal' },
    ],
    error: 'Please select a payment method',
  },
};

export const Horizontal: Story = {
  render: ControlledRadioGroup,
  args: {
    name: 'horizontal',
    label: 'Size',
    options: [
      { value: 'small', label: 'Small' },
      { value: 'medium', label: 'Medium' },
      { value: 'large', label: 'Large' },
    ],
    orientation: 'horizontal',
    value: 'medium',
  },
};

export const Small: Story = {
  render: ControlledRadioGroup,
  args: {
    name: 'small',
    label: 'Small Size',
    options: basicOptions,
    size: 'small',
    value: 'option1',
  },
};

export const Medium: Story = {
  render: ControlledRadioGroup,
  args: {
    name: 'medium',
    label: 'Medium Size',
    options: basicOptions,
    size: 'medium',
    value: 'option1',
  },
};

export const Large: Story = {
  render: ControlledRadioGroup,
  args: {
    name: 'large',
    label: 'Large Size',
    options: basicOptions,
    size: 'large',
    value: 'option1',
  },
};

export const Disabled: Story = {
  render: ControlledRadioGroup,
  args: {
    name: 'disabled',
    label: 'Disabled Group',
    options: basicOptions,
    value: 'option1',
    disabled: true,
  },
};

export const PartiallyDisabled: Story = {
  render: ControlledRadioGroup,
  args: {
    name: 'partiallyDisabled',
    label: 'Some Options Disabled',
    options: [
      { value: 'option1', label: 'Available Option 1' },
      { value: 'option2', label: 'Disabled Option', disabled: true },
      { value: 'option3', label: 'Available Option 2' },
    ],
    value: 'option1',
  },
};

export const NoSelection: Story = {
  render: ControlledRadioGroup,
  args: {
    name: 'noSelection',
    label: 'No Initial Selection',
    options: basicOptions,
  },
};
