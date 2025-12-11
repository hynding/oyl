import { useDailyProvider } from "./DailyProvider"

export default function DailyNutrition() {
  const {
    foodItems,
    showFoodForm,
    setShowFoodForm,
    newFood,
    setNewFood,
    onChangeFood,
    addFood,
    cancelFoodForm,
    totalCalories,
    totalProtein,
    totalCarbs,
    totalFat
  } = useDailyProvider()

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <h2 className="text-xl font-semibold text-gray-900 mb-4">Nutrition</h2>

      {/* Daily Summary */}
      <div className="mb-6 p-4 bg-gradient-to-r from-green-50 to-blue-50 rounded-lg">
        <h3 className="font-medium text-gray-900 mb-3">Daily Totals</h3>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-gray-600">Calories</p>
            <p className="font-semibold text-lg">{totalCalories}</p>
          </div>
          <div>
            <p className="text-gray-600">Protein</p>
            <p className="font-semibold">{totalProtein}g</p>
          </div>
          <div>
            <p className="text-gray-600">Carbs</p>
            <p className="font-semibold">{totalCarbs}g</p>
          </div>
          <div>
            <p className="text-gray-600">Fat</p>
            <p className="font-semibold">{totalFat}g</p>
          </div>
        </div>
      </div>

      {/* Food Items */}
      <div className="space-y-3 mb-4">
        {foodItems.map(item => (
          <div key={item.id} className="p-3 bg-gray-50 rounded-lg">
            <div className="flex justify-between items-start mb-2">
              <h4 className="font-medium text-gray-900">{item?.name ?? item?.nutrition_item?.name ?? 'Unknown Food'}</h4>
              <span className="text-sm text-gray-500">{item?.time}</span>
            </div>
            <div className="grid grid-cols-4 gap-2 text-xs text-gray-600">
              <div>{item.calories} cal</div>
              <div>{item.protein}g P</div>
              <div>{item.carbs}g C</div>
              <div>{item.fat}g F</div>
            </div>
          </div>
        ))}
      </div>

      {/* Add Food Form */}
      {showFoodForm ? (
        <div className="mt-4 p-4 bg-orange-50 rounded-lg border border-orange-200">
          <h3 className="font-medium text-gray-900 mb-3">Add New Food</h3>
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Food Name</label>
              <input
                type="text"
                value={newFood.name}
                onChange={(e) => onChangeFood('name', e.target.value)}
                placeholder="e.g., Grilled Chicken Breast"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Calories</label>
                <input
                  type="number"
                  value={newFood.calories}
                  onChange={(e) => onChangeFood('calories', e.target.value)}
                  placeholder="320"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Time</label>
                <input
                  type="time"
                  value={newFood.time}
                  onChange={(e) => onChangeFood('time', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Protein (g)</label>
                <input
                  type="number"
                  value={newFood.protein}
                  onChange={(e) => onChangeFood('protein', e.target.value)}
                  placeholder="12"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Carbs (g)</label>
                <input
                  type="number"
                  value={newFood.carbs}
                  onChange={(e) => onChangeFood('carbs', e.target.value)}
                  placeholder="54"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Fat (g)</label>
                <input
                  type="number"
                  value={newFood.fat}
                  onChange={(e) => onChangeFood('fat', e.target.value)}
                  placeholder="8"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>
            <div className="flex space-x-2 pt-2">
              <button
                onClick={addFood}
                className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition-colors"
              >
                Add Food
              </button>
              <button
                onClick={cancelFoodForm}
                className="flex-1 px-4 py-2 bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setShowFoodForm(true)}
          className="w-full px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
        >
          Add Food
        </button>
      )}
    </div>
  )
}