import React, { useState, useContext } from 'react';
import NutritionContext, { type Product } from './nutrition-context';
import UserNutritionProvider from './NutritionProvider';

function NutritionSearchPage() {
  const context = useContext(NutritionContext);
  const [query, setQuery] = useState('');

  if (!context) {
    throw new Error('NutritionSearchPage must be used within UserNutritionProvider');
  }

  const { searchResults, loading, error, searchProducts, clearResults } = context;

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    searchProducts(query);
  };

  const handleClear = () => {
    setQuery('');
    clearResults();
  };

  return (
    <div className="nutrition-page">
      <h1>Nutrition Search</h1>

      <form onSubmit={handleSearch} className="search-form">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search for food products..."
          className="search-input"
        />
        <button type="submit" disabled={loading || !query.trim()}>
          {loading ? 'Searching...' : 'Search'}
        </button>
        {searchResults.length > 0 && (
          <button type="button" onClick={handleClear}>
            Clear
          </button>
        )}
      </form>

      {error && (
        <div className="error-message">
          Error: {error}
        </div>
      )}

      {loading && (
        <div className="loading">Searching...</div>
      )}

      {!loading && searchResults.length > 0 && (
        <div className="results">
          <h2>{searchResults.length} Results</h2>
          <div className="results-grid">
            {searchResults.map((product: Product) => (
              <div key={product.code} className="product-card">
                {product.image_url && (
                  <img
                    src={product.image_url}
                    alt={product.product_name}
                    className="product-image"
                  />
                )}
                <h3>{product.product_name}</h3>
                {product.brands && (
                  <p className="product-brand">{product.brands}</p>
                )}
                {product.nutrition_grades && (
                  <div className={`nutrition-grade grade-${product.nutrition_grades}`}>
                    Grade: {product.nutrition_grades.toUpperCase()}
                  </div>
                )}
                {product.nutriments && (
                  <div className="nutriments">
                    {product.nutriments.energy_kcal_100g && (
                      <div>Energy: {product.nutriments.energy_kcal_100g} kcal/100g</div>
                    )}
                    {product.nutriments.proteins_100g && (
                      <div>Protein: {product.nutriments.proteins_100g}g/100g</div>
                    )}
                    {product.nutriments.carbohydrates_100g && (
                      <div>Carbs: {product.nutriments.carbohydrates_100g}g/100g</div>
                    )}
                    {product.nutriments.fat_100g && (
                      <div>Fat: {product.nutriments.fat_100g}g/100g</div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {!loading && searchResults.length === 0 && query && (
        <div className="no-results">
          No results found for "{query}"
        </div>
      )}
    </div>
  );
}

export default function NutritionPage() {
  return (
    <UserNutritionProvider>
      <NutritionSearchPage />
    </UserNutritionProvider>
  );
}
