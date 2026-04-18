import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { ListBox } from './ListBox';

const sampleOptions = [
  { value: 'apple', label: 'Apple' },
  { value: 'banana', label: 'Banana' },
  { value: 'cherry', label: 'Cherry' },
  { value: 'date', label: 'Date' },
  { value: 'elderberry', label: 'Elderberry' },
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
];

const fruitsWithDescriptions = [
  {
    value: 'apple',
    label: 'Apple',
    description: 'Crisp and sweet fruit, rich in fiber'
  },
  {
    value: 'banana',
    label: 'Banana',
    description: 'Tropical fruit high in potassium'
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
];

const usersWithImages = [
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
];

const meta = {
  title: 'Common/Containers/ListBox',
  component: ListBox,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  argTypes: {
    options: { control: 'object' },
    highlightedIndex: { control: 'number' },
    className: { control: 'text' },
  },
  args: {
    onOptionClick: fn(),
  },
} satisfies Meta<typeof ListBox>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    options: sampleOptions,
  },
};

export const WithHighlightedItem: Story = {
  args: {
    options: sampleOptions,
    highlightedIndex: 2,
  },
};

export const FirstItemHighlighted: Story = {
  args: {
    options: countries,
    highlightedIndex: 0,
  },
};

export const LastItemHighlighted: Story = {
  args: {
    options: countries,
    highlightedIndex: 7,
  },
};

export const LongList: Story = {
  args: {
    options: Array.from({ length: 20 }, (_, i) => ({
      value: `option-${i}`,
      label: `Option ${i + 1}`,
    })),
    highlightedIndex: 10,
  },
};

export const ShortList: Story = {
  args: {
    options: [
      { value: 'yes', label: 'Yes' },
      { value: 'no', label: 'No' },
    ],
    highlightedIndex: 0,
  },
};

export const SingleOption: Story = {
  args: {
    options: [{ value: 'only', label: 'Only Option' }],
    highlightedIndex: 0,
  },
};

export const NoHighlight: Story = {
  args: {
    options: countries,
    highlightedIndex: -1,
  },
};

export const WithCustomClassName: Story = {
  args: {
    options: sampleOptions,
    highlightedIndex: 1,
    className: 'max-w-sm',
  },
};

export const WithDescriptions: Story = {
  args: {
    options: fruitsWithDescriptions,
    highlightedIndex: 1,
  },
};

export const WithImages: Story = {
  args: {
    options: usersWithImages,
    highlightedIndex: 2,
  },
};

export const WithImagesAndDescriptions: Story = {
  args: {
    options: usersWithImages,
    highlightedIndex: 0,
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
    highlightedIndex: 3,
  },
};
