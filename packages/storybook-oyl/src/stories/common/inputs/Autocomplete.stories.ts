import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { Autocomplete } from './Autocomplete';

const sampleOptions = [
  { value: 'apple', label: 'Apple' },
  { value: 'banana', label: 'Banana' },
  { value: 'cherry', label: 'Cherry' },
  { value: 'date', label: 'Date' },
  { value: 'elderberry', label: 'Elderberry' },
  { value: 'fig', label: 'Fig' },
  { value: 'grape', label: 'Grape' },
  { value: 'honeydew', label: 'Honeydew' },
];

const countries = [
  { value: 'us', label: 'United States' },
  { value: 'ca', label: 'Canada' },
  { value: 'mx', label: 'Mexico' },
  { value: 'uk', label: 'United Kingdom' },
  { value: 'fr', label: 'France' },
  { value: 'de', label: 'Germany' },
  { value: 'it', label: 'Italy' },
  { value: 'es', label: 'Spain' },
  { value: 'jp', label: 'Japan' },
  { value: 'au', label: 'Australia' },
];

const fruitsWithDescriptions = [
  {
    value: 'apple',
    label: 'Apple',
    description: 'Crisp and sweet fruit, rich in fiber'
  },
  {
    value: 'apricot',
    label: 'Apricot',
    description: 'Small orange fruit with velvety skin'
  },
  {
    value: 'banana',
    label: 'Banana',
    description: 'Tropical fruit high in potassium'
  },
  {
    value: 'blueberry',
    label: 'Blueberry',
    description: 'Small blue superfood berry'
  },
  {
    value: 'cherry',
    label: 'Cherry',
    description: 'Small stone fruit with antioxidants'
  },
  {
    value: 'date',
    label: 'Date',
    description: 'Sweet dried fruit from date palm'
  },
  {
    value: 'elderberry',
    label: 'Elderberry',
    description: 'Dark purple berry used medicinally'
  },
  {
    value: 'fig',
    label: 'Fig',
    description: 'Sweet fruit with unique texture'
  },
  {
    value: 'grape',
    label: 'Grape',
    description: 'Versatile fruit used for wine'
  },
];

const users = [
  {
    value: 'user1',
    label: 'John Doe',
    description: 'Software Engineer',
    image: 'https://i.pravatar.cc/150?img=12'
  },
  {
    value: 'user2',
    label: 'Jane Smith',
    description: 'Product Manager',
    image: 'https://i.pravatar.cc/150?img=5'
  },
  {
    value: 'user3',
    label: 'Mike Johnson',
    description: 'UX Designer',
    image: 'https://i.pravatar.cc/150?img=33'
  },
  {
    value: 'user4',
    label: 'Sarah Williams',
    description: 'Data Scientist',
    image: 'https://i.pravatar.cc/150?img=9'
  },
  {
    value: 'user5',
    label: 'Chris Brown',
    description: 'DevOps Engineer',
    image: 'https://i.pravatar.cc/150?img=15'
  },
  {
    value: 'user6',
    label: 'Emily Davis',
    description: 'Marketing Director',
    image: 'https://i.pravatar.cc/150?img=47'
  },
  {
    value: 'user7',
    label: 'David Wilson',
    description: 'Sales Manager',
    image: 'https://i.pravatar.cc/150?img=51'
  },
  {
    value: 'user8',
    label: 'Lisa Anderson',
    description: 'HR Specialist',
    image: 'https://i.pravatar.cc/150?img=24'
  },
];

const meta = {
  title: 'Common/Inputs/Autocomplete',
  component: Autocomplete,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  argTypes: {
    options: { control: 'object' },
    placeholder: { control: 'text' },
    className: { control: 'text' },
  },
  args: {
    onSelect: fn(),
  },
} satisfies Meta<typeof Autocomplete>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    options: sampleOptions,
    placeholder: 'Search fruits...',
  },
};

export const Countries: Story = {
  args: {
    options: countries,
    placeholder: 'Select a country...',
  },
};

export const LongList: Story = {
  args: {
    options: Array.from({ length: 50 }, (_, i) => ({
      value: `option-${i}`,
      label: `Option ${i + 1}`,
    })),
    placeholder: 'Search options...',
  },
};

export const ShortList: Story = {
  args: {
    options: [
      { value: 'yes', label: 'Yes' },
      { value: 'no', label: 'No' },
    ],
    placeholder: 'Choose...',
  },
};

export const EmptyState: Story = {
  args: {
    options: [],
    placeholder: 'No options available',
  },
};

export const CustomPlaceholder: Story = {
  args: {
    options: sampleOptions,
    placeholder: 'Type to filter results...',
  },
};

export const WithCustomClassName: Story = {
  args: {
    options: sampleOptions,
    placeholder: 'Search...',
    className: 'max-w-md',
  },
};

export const WithDescriptions: Story = {
  args: {
    options: fruitsWithDescriptions,
    placeholder: 'Search fruits...',
  },
};

export const WithImages: Story = {
  args: {
    options: users,
    placeholder: 'Search team members...',
  },
};

export const UserSearch: Story = {
  args: {
    options: users,
    placeholder: 'Find a colleague...',
    className: 'max-w-lg',
  },
};

export const MixedContent: Story = {
  args: {
    options: [
      { value: '1', label: 'Simple Item' },
      {
        value: '2',
        label: 'Item with Description',
        description: 'This has a description only'
      },
      {
        value: '3',
        label: 'Item with Image',
        image: 'https://i.pravatar.cc/150?img=20'
      },
      {
        value: '4',
        label: 'Complete Item',
        description: 'Has both image and description',
        image: 'https://i.pravatar.cc/150?img=25'
      },
    ],
    placeholder: 'Search items...',
  },
};

export const LoadingState: Story = {
  args: {
    options: [],
    placeholder: 'Search...',
    isLoading: true,
  },
};

export const WithMinLength: Story = {
  args: {
    options: fruitsWithDescriptions,
    placeholder: 'Search fruits (min 3 characters)...',
    minLength: 3,
  },
};

export const WithMinLengthOne: Story = {
  args: {
    options: countries,
    placeholder: 'Type at least 1 character...',
    minLength: 1,
  },
};

export const WithMinLengthFive: Story = {
  args: {
    options: users,
    placeholder: 'Search users (min 5 characters)...',
    minLength: 5,
  },
};
