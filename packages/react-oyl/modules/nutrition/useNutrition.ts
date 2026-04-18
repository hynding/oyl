import { useContext } from 'react';
import NutritionContext, { type NutritionContextValue } from './nutrition-context';

export function useNutrition(): NutritionContextValue {
  const context = useContext(NutritionContext);

  if (context === undefined) {
    throw new Error('useNutrition must be used within a UserNutritionProvider');
  }

  return context;
}
