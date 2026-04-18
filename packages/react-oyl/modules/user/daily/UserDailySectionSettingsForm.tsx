'use client';

import React from 'react';

type Props = {
  settings: Record<string, string | number | boolean | number[]>;
  onSave: () => void;
  onCancel: () => void;
  onChangeSetting: (field: keyof Props['settings'], value: string | number | boolean | number[]) => void;
  children?: React.ReactNode;
}

export default function DailySectionSettingsForm({ onSave, onCancel, children, settings, onChangeSetting }: Props) {
  return (
    <>
      {children}

      <div className="space-y-4">
        {/* Auto-add Setting */}
        <div className="border-b border-gray-200 pb-4">
          <label className="flex items-center space-x-3 cursor-pointer">
            <input
              type="checkbox"
              checked={settings.autoAdd}
              onChange={(e) => onChangeSetting('autoAdd', e.target.checked)}
              className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
            />
            <div>
              <p className="font-medium text-gray-900">Auto-add for each day</p>
              <p className="text-sm text-gray-500">Automatically include this activity in your daily schedule</p>
            </div>
          </label>
        </div>

        {/* Frequency Settings */}
        {settings.autoAdd && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Frequency</label>
              <select
                value={settings.frequency}
                onChange={(e) => onChangeSetting('frequency', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="daily">Daily</option>
                <option value="specific-days">Specific Days</option>
                <option value="interval">Every N Days</option>
              </select>
            </div>

            {/* Specific Days Selection */}
            {settings.frequency === 'specific-days' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Select Days</label>
                <div className="grid grid-cols-7 gap-2">
                  {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day, index) => (
                    <button
                      key={day}
                      onClick={() => {
                        const newDays = settings.selectedDays.includes(index)
                          ? settings.selectedDays.filter(d => d !== index)
                          : [...settings.selectedDays, index]
                        onChangeSetting('selectedDays', newDays)
                      }}
                      className={`py-2 px-1 text-xs font-medium rounded transition-colors ${
                        settings.selectedDays.includes(index)
                          ? 'bg-indigo-600 text-white'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      {day}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Interval Setting */}
            {settings.frequency === 'interval' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Repeat every</label>
                <div className="flex items-center space-x-2">
                  <input
                    type="number"
                    min="1"
                    value={settings.intervalDays}
                    onChange={(e) => onChangeSetting('intervalDays', Number(e.target.value))}
                    className="w-20 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <span className="text-gray-700">days</span>
                </div>
              </div>
            )}

            {/* Start Date */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Start Date</label>
              <input
                type="date"
                value={settings.startDate}
                onChange={(e) => onChangeSetting('startDate', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            {/* End Date (Optional) */}
            <div>
              <label className="flex items-center space-x-2 mb-2">
                <input
                  type="checkbox"
                  checked={settings.hasEndDate}
                  onChange={(e) => onChangeSetting('hasEndDate', e.target.checked)}
                  className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                />
                <span className="text-sm font-medium text-gray-700">Set end date</span>
              </label>
              {settings.hasEndDate && (
                <input
                  type="date"
                  value={settings.endDate}
                  onChange={(e) => onChangeSetting('endDate', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              )}
            </div>
          </div>
        )}
      </div>

      <div className="flex space-x-3 mt-6 pt-4 border-t border-gray-200">
        <button
          onClick={onSave}
          className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition-colors font-medium"
        >
          Save Settings
        </button>
        <button
          onClick={onCancel}
          className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 transition-colors font-medium"
        >
          Cancel
        </button>
      </div>
    </>
  )
}