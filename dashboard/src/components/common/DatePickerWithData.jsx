import { useState, useEffect, useRef } from 'react';
import {
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
  addMonths,
  subMonths,
  getDay,
  isAfter,
  isBefore,
  parseISO,
} from 'date-fns';

/**
 * Custom date picker that highlights dates with data
 * - Dates with data are highlighted in red
 * - Dates without data are greyed out and not selectable
 */
export default function DatePickerWithData({
  value,
  onChange,
  datesWithData = [],
  label,
  disabled = false,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [currentMonth, setCurrentMonth] = useState(value ? new Date(value) : new Date());
  const containerRef = useRef(null);

  // Convert datesWithData strings to Date objects for comparison
  const dataDateSet = new Set(datesWithData.map(d => d));

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Get days in current month view
  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });

  // Get day of week for first day (0 = Sunday)
  const startDay = getDay(monthStart);

  // Check if a date has data
  const hasData = (date) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    return dataDateSet.has(dateStr);
  };

  // Handle date selection
  const handleDateClick = (date) => {
    if (!hasData(date)) return; // Don't allow selecting dates without data
    onChange(format(date, 'yyyy-MM-dd'));
    setIsOpen(false);
  };

  // Navigate months
  const goToPrevMonth = (e) => {
    e.stopPropagation();
    setCurrentMonth(subMonths(currentMonth, 1));
  };

  const goToNextMonth = (e) => {
    e.stopPropagation();
    setCurrentMonth(addMonths(currentMonth, 1));
  };

  // Jump to first date with data
  const jumpToFirstDataDate = (e) => {
    e.stopPropagation();
    if (datesWithData.length > 0) {
      const firstDate = parseISO(datesWithData[0]);
      setCurrentMonth(firstDate);
    }
  };

  // Jump to last date with data
  const jumpToLastDataDate = (e) => {
    e.stopPropagation();
    if (datesWithData.length > 0) {
      const lastDate = parseISO(datesWithData[datesWithData.length - 1]);
      setCurrentMonth(lastDate);
    }
  };

  // Check if current month has any data
  const monthHasData = daysInMonth.some(day => hasData(day));

  // Selected date for highlighting
  const selectedDate = value ? parseISO(value) : null;

  return (
    <div className="relative" ref={containerRef}>
      {label && (
        <label className="block text-sm font-medium text-gray-700 mb-1">
          {label}
        </label>
      )}

      {/* Input display */}
      <button
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        className={`w-full px-3 py-2 border rounded-lg text-left text-sm flex items-center justify-between ${
          disabled
            ? 'bg-gray-100 border-gray-200 text-gray-500 cursor-not-allowed'
            : 'border-gray-300 hover:border-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-blue-500'
        }`}
      >
        <span className={value ? 'text-gray-900' : 'text-gray-400'}>
          {value ? format(parseISO(value), 'dd/MM/yyyy') : 'Select date...'}
        </span>
        <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      </button>

      {/* Calendar dropdown */}
      {isOpen && (
        <div className="absolute z-50 mt-1 bg-white rounded-lg shadow-lg border border-gray-200 p-3 w-72">
          {/* Month navigation */}
          <div className="flex items-center justify-between mb-3">
            <button
              onClick={goToPrevMonth}
              className="p-1 hover:bg-gray-100 rounded"
              title="Previous month"
            >
              <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>

            <span className="font-semibold text-gray-900">
              {format(currentMonth, 'MMMM yyyy')}
            </span>

            <button
              onClick={goToNextMonth}
              className="p-1 hover:bg-gray-100 rounded"
              title="Next month"
            >
              <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>

          {/* Quick jump buttons */}
          {datesWithData.length > 0 && (
            <div className="flex gap-2 mb-3">
              <button
                onClick={jumpToFirstDataDate}
                className="flex-1 text-xs py-1 px-2 bg-red-50 text-red-600 rounded hover:bg-red-100"
                title={`Jump to ${datesWithData[0]}`}
              >
                ⏮ First Data
              </button>
              <button
                onClick={jumpToLastDataDate}
                className="flex-1 text-xs py-1 px-2 bg-red-50 text-red-600 rounded hover:bg-red-100"
                title={`Jump to ${datesWithData[datesWithData.length - 1]}`}
              >
                Last Data ⏭
              </button>
            </div>
          )}

          {/* Day headers */}
          <div className="grid grid-cols-7 gap-1 mb-1">
            {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(day => (
              <div key={day} className="text-center text-xs font-medium text-gray-500 py-1">
                {day}
              </div>
            ))}
          </div>

          {/* Calendar grid */}
          <div className="grid grid-cols-7 gap-1">
            {/* Empty cells for days before month starts */}
            {Array.from({ length: startDay }).map((_, i) => (
              <div key={`empty-${i}`} className="h-8" />
            ))}

            {/* Days of the month */}
            {daysInMonth.map(day => {
              const dateHasData = hasData(day);
              const isSelected = selectedDate && isSameDay(day, selectedDate);
              const isToday = isSameDay(day, new Date());

              return (
                <button
                  key={day.toISOString()}
                  onClick={() => handleDateClick(day)}
                  disabled={!dateHasData}
                  className={`
                    h-8 w-full rounded text-sm font-medium transition-colors
                    ${isSelected
                      ? 'bg-blue-600 text-white'
                      : dateHasData
                        ? 'bg-red-100 text-red-700 hover:bg-red-200 cursor-pointer font-bold'
                        : 'text-gray-300 cursor-not-allowed line-through'
                    }
                    ${isToday && !isSelected ? 'ring-2 ring-blue-400' : ''}
                  `}
                  title={dateHasData ? `Data available for ${format(day, 'dd/MM/yyyy')}` : 'No data'}
                >
                  {format(day, 'd')}
                </button>
              );
            })}
          </div>

          {/* Legend */}
          <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-center gap-4 text-xs">
            <div className="flex items-center gap-1">
              <div className="w-4 h-4 bg-red-100 rounded" />
              <span className="text-gray-600">Has data</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-4 h-4 bg-gray-100 rounded flex items-center justify-center text-gray-300 text-xs line-through">1</div>
              <span className="text-gray-600">No data</span>
            </div>
          </div>

          {/* Data summary */}
          {datesWithData.length > 0 && (
            <div className="mt-2 text-center text-xs text-gray-500">
              {datesWithData.length} day{datesWithData.length !== 1 ? 's' : ''} with data
              {!monthHasData && (
                <span className="block text-orange-500 mt-1">No data in this month</span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
