import { createContext } from 'react';

interface Product {
  code: string;
  product_name: string;
  brands?: string;
  categories_tags?: string[];
  nutrition_grades?: string;
  nutriments?: Record<string, string | number>;
  image_url?: string;
}

interface NutritionContextValue {
  searchResults: Product[];
  loading: boolean;
  error: string | null;
  searchProducts: (query: string, options?: {
    categories?: string;
    nutritionGrade?: string;
    fields?: string[];
    pageSize?: number;
  }) => Promise<void>;
  clearResults: () => void;
}

const NutritionContext = createContext<NutritionContextValue | undefined>(undefined);

export const Provider = NutritionContext.Provider;
export default NutritionContext;
export type { Product, NutritionContextValue };
