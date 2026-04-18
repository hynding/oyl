import type { Meta, StoryObj } from '@storybook/react';
import { Textarea } from './Textarea';

const meta: Meta<typeof Textarea> = {
  title: 'Common/Inputs/Textarea',
  component: Textarea,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  argTypes: {
    size: {
      control: 'select',
      options: ['small', 'medium', 'large'],
    },
    resize: {
      control: 'select',
      options: ['none', 'vertical', 'horizontal', 'both'],
    },
    disabled: {
      control: 'boolean',
    },
    fullWidth: {
      control: 'boolean',
    },
    showCharCount: {
      control: 'boolean',
    },
  },
};

export default meta;
type Story = StoryObj<typeof Textarea>;

export const Default: Story = {
  args: {
    placeholder: 'Enter your text...',
    rows: 4,
  },
};

export const WithLabel: Story = {
  args: {
    label: 'Description',
    placeholder: 'Enter a description...',
    rows: 4,
  },
};

export const WithHelperText: Story = {
  args: {
    label: 'Bio',
    placeholder: 'Tell us about yourself...',
    helperText: 'Keep it brief and professional',
    rows: 4,
  },
};

export const WithError: Story = {
  args: {
    label: 'Comments',
    placeholder: 'Enter your comments...',
    error: 'Comments are required',
    rows: 4,
  },
};

export const WithCharCount: Story = {
  args: {
    label: 'Tweet',
    placeholder: 'What\'s happening?',
    showCharCount: true,
    rows: 3,
  },
};

export const WithMaxLength: Story = {
  args: {
    label: 'Short Message',
    placeholder: 'Enter a short message...',
    showCharCount: true,
    maxLength: 200,
    helperText: 'Maximum 200 characters',
    rows: 4,
  },
};

export const Small: Story = {
  args: {
    size: 'small',
    placeholder: 'Small textarea',
    rows: 3,
  },
};

export const Medium: Story = {
  args: {
    size: 'medium',
    placeholder: 'Medium textarea',
    rows: 4,
  },
};

export const Large: Story = {
  args: {
    size: 'large',
    placeholder: 'Large textarea',
    rows: 5,
  },
};

export const ResizeNone: Story = {
  args: {
    label: 'Fixed Size',
    placeholder: 'This textarea cannot be resized',
    resize: 'none',
    rows: 4,
  },
};

export const ResizeVertical: Story = {
  args: {
    label: 'Vertical Resize',
    placeholder: 'Resize vertically only',
    resize: 'vertical',
    rows: 4,
  },
};

export const ResizeHorizontal: Story = {
  args: {
    label: 'Horizontal Resize',
    placeholder: 'Resize horizontally only',
    resize: 'horizontal',
    rows: 4,
    cols: 30,
  },
};

export const ResizeBoth: Story = {
  args: {
    label: 'Free Resize',
    placeholder: 'Resize in any direction',
    resize: 'both',
    rows: 4,
  },
};

export const Disabled: Story = {
  args: {
    label: 'Disabled Textarea',
    placeholder: 'Cannot edit this',
    disabled: true,
    rows: 4,
  },
};

export const FullWidth: Story = {
  args: {
    label: 'Full Width Textarea',
    placeholder: 'This spans the full width',
    fullWidth: true,
    rows: 4,
  },
  parameters: {
    layout: 'padded',
  },
};

export const Required: Story = {
  args: {
    label: 'Required Field',
    placeholder: 'This field is required',
    required: true,
    rows: 4,
  },
};

export const LongContent: Story = {
  args: {
    label: 'Article Content',
    value: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.\n\nDuis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.',
    rows: 6,
  },
};

export const WithCharCountAndMaxLength: Story = {
  args: {
    label: 'Product Review',
    placeholder: 'Write your review...',
    helperText: 'Share your experience with this product',
    showCharCount: true,
    maxLength: 500,
    rows: 6,
    fullWidth: true,
  },
  parameters: {
    layout: 'padded',
  },
};
