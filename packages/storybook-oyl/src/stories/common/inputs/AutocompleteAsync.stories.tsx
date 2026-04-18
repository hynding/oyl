import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { useState, useRef, useEffect } from 'react';
import { Autocomplete, type AutocompleteOption } from './Autocomplete';

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
  title: 'Common/Inputs/Autocomplete/Async',
  component: Autocomplete,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof Autocomplete>;

export default meta;
type Story = StoryObj<typeof meta>;

const AsyncSearchComponent = (args: typeof meta extends Meta<infer T> ? T : never) => {
  const [options, setOptions] = useState<AutocompleteOption[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const handleInputChange = (value: string) => {
    if (!value) {
      setOptions([]);
      return;
    }

    setIsLoading(true);

    // Simulate API call
    setTimeout(() => {
      const filtered = users.filter(user =>
        user.label.toLowerCase().includes(value.toLowerCase())
      );
      setOptions(filtered);
      setIsLoading(false);
    }, 500);
  };

  return (
    <Autocomplete
      options={options}
      isLoading={isLoading}
      onInputChange={handleInputChange}
      placeholder={args.placeholder}
      onSelect={args.onSelect}
      className={args.className}
    />
  );
};

export const AsyncSearch: Story = {
  render: AsyncSearchComponent,
  args: {
    options: [],
    placeholder: 'Search users (async)...',
    onSelect: fn(),
  },
};

const AsyncWithDebounceComponent = (args: typeof meta extends Meta<infer T> ? T : never) => {
  const [options, setOptions] = useState<AutocompleteOption[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const debounceTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }

    if (!inputValue) {
      setOptions([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);

    // Simulate debounced API call
    debounceTimeoutRef.current = window.setTimeout(() => {
      const filtered = fruitsWithDescriptions.filter(fruit =>
        fruit.label.toLowerCase().includes(inputValue.toLowerCase()) ||
        fruit.description?.toLowerCase().includes(inputValue.toLowerCase())
      );
      setOptions(filtered);
      setIsLoading(false);
    }, 800);

    return () => {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
    };
  }, [inputValue]);

  const handleInputChange = (value: string) => {
    setInputValue(value);
  };

  return (
    <Autocomplete
      options={options}
      isLoading={isLoading}
      onInputChange={handleInputChange}
      placeholder={args.placeholder}
      onSelect={args.onSelect}
      className={args.className}
    />
  );
};

export const AsyncWithDebounce: Story = {
  render: AsyncWithDebounceComponent,
  args: {
    options: [],
    placeholder: 'Search fruits (debounced)...',
    onSelect: fn(),
  },
};
