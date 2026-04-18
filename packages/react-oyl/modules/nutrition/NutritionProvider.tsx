import React, { useState, useCallback } from 'react';
import { Provider } from './nutrition-context';

const OPENFOODFACTS_API_BASE = 'https://world.openfoodfacts.net/api/v2';
const USER_AGENT = 'OYL/1.0 (contact@oyl.app)';

interface Product {
  code: string;
  product_name: string;
  brands?: string;
  categories_tags?: string[];
  nutrition_grades?: string;
  nutriments?: Record<string, string | number>;
  image_url?: string;
}

interface SearchResponse {
  count: number;
  page: number;
  page_count: number;
  page_size: number;
  products: Product[];
}

export default function UserNutritionProvider({ children }: { children: React.ReactNode }) {
  const [searchResults, setSearchResults] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const searchProducts = useCallback(async (query: string, options?: {
    categories?: string;
    nutritionGrade?: string;
    fields?: string[];
    pageSize?: number;
  }) => {
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      params.append('search_terms', query);

      if (options?.categories) {
        params.append('categories_tags_en', options.categories);
      }

      if (options?.nutritionGrade) {
        params.append('nutrition_grades_tags', options.nutritionGrade);
      }

      if (options?.fields && options.fields.length > 0) {
        params.append('fields', options.fields.join(','));
      } else {
        params.append('fields', 'code,product_name,brands,categories_tags,nutrition_grades,nutriments,image_url');
      }

      if (options?.pageSize) {
        params.append('page_size', options.pageSize.toString());
      }

      const response = await fetch(`${OPENFOODFACTS_API_BASE}/search?${params.toString()}`, {
        headers: {
          'User-Agent': USER_AGENT,
        },
      });

      if (!response.ok) {
        throw new Error(`API request failed: ${response.status} ${response.statusText}`);
      }

      const data: SearchResponse = await response.json();
      setSearchResults(data.products || []);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
      setError(errorMessage);
      setSearchResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const clearResults = useCallback(() => {
    setSearchResults([]);
    setError(null);
  }, []);

  return (
    <Provider value={{
      searchResults,
      loading,
      error,
      searchProducts,
      clearResults,
    }}>
      {children}
    </Provider>
  );
}
