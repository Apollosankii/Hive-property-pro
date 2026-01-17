import { useState } from 'react'
import { X, ChevronDown } from 'lucide-react'

interface ExportColumnsModalProps {
  isOpen: boolean
  onClose: () => void
  onExport: (selectedColumns: string[]) => void
  availableColumns: { id: string; label: string; category: string }[]
}

const COLUMN_CATEGORIES = {
  'Basic Info': [
    { id: 'Invoice #', label: 'Invoice #' },
    { id: 'Billing Month', label: 'Billing Month' },
    { id: 'Unit Number', label: 'Unit Number' },
    { id: 'Building Name', label: 'Building Name' },
    { id: 'Tenant Name', label: 'Tenant Name' },
    { id: 'Tenant Phone', label: 'Tenant Phone' },
  ],
  'Water': [
    { id: 'Water Previous Reading', label: 'Water Previous Reading' },
    { id: 'Water Current Reading', label: 'Water Current Reading' },
    { id: 'Water Units Consumed', label: 'Water Units Consumed' },
    { id: 'Water Rate (per unit)', label: 'Water Rate (per unit)' },
    { id: 'Water Amount', label: 'Water Amount' },
  ],
  'Electricity': [
    { id: 'Electricity Previous Reading', label: 'Electricity Previous Reading' },
    { id: 'Electricity Current Reading', label: 'Electricity Current Reading' },
    { id: 'Electricity Units Consumed', label: 'Electricity Units Consumed' },
    { id: 'Electricity Rate (per unit)', label: 'Electricity Rate (per unit)' },
    { id: 'Electricity Amount', label: 'Electricity Amount' },
  ],
  'Rent & Utilities': [
    { id: 'Monthly Rent', label: 'Monthly Rent' },
    { id: 'Garbage Amount', label: 'Garbage Amount' },
    { id: 'Maintenance Amount', label: 'Maintenance Amount' },
    { id: 'Other Utilities Amount', label: 'Other Utilities Amount' },
    { id: 'Total Utilities', label: 'Total Utilities' },
  ],
  'Financial Summary': [
    { id: 'Arrears Brought Forward', label: 'Arrears Brought Forward' },
    { id: 'Total Amount', label: 'Total Amount' },
    { id: 'Amount Paid', label: 'Amount Paid' },
    { id: 'Balance', label: 'Balance' },
    { id: 'Status', label: 'Status' },
  ],
  'Dates': [
    { id: 'Created Date', label: 'Created Date' },
    { id: 'Updated Date', label: 'Updated Date' },
  ],
}

export default function ExportColumnsModal({ isOpen, onClose, onExport, availableColumns }: ExportColumnsModalProps) {
  const [selectedColumns, setSelectedColumns] = useState<Set<string>>(
    new Set(availableColumns.map(col => col.id))
  )
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
    new Set(Object.keys(COLUMN_CATEGORIES))
  )

  const toggleCategory = (category: string) => {
    const newExpanded = new Set(expandedCategories)
    if (newExpanded.has(category)) {
      newExpanded.delete(category)
    } else {
      newExpanded.add(category)
    }
    setExpandedCategories(newExpanded)
  }

  const toggleColumn = (columnId: string) => {
    const newSelected = new Set(selectedColumns)
    if (newSelected.has(columnId)) {
      newSelected.delete(columnId)
    } else {
      newSelected.add(columnId)
    }
    setSelectedColumns(newSelected)
  }

  const toggleCategoryAll = (category: string) => {
    const columns = COLUMN_CATEGORIES[category as keyof typeof COLUMN_CATEGORIES] || []
    const columnIds = columns.map(col => col.id)
    const allSelected = columnIds.every(id => selectedColumns.has(id))

    const newSelected = new Set(selectedColumns)
    if (allSelected) {
      columnIds.forEach(id => newSelected.delete(id))
    } else {
      columnIds.forEach(id => newSelected.add(id))
    }
    setSelectedColumns(newSelected)
  }

  const selectAll = () => {
    const allColumnIds = Object.values(COLUMN_CATEGORIES)
      .flat()
      .map(col => col.id)
    setSelectedColumns(new Set(allColumnIds))
  }

  const deselectAll = () => {
    setSelectedColumns(new Set())
  }

  const handleExport = () => {
    if (selectedColumns.size === 0) {
      alert('Please select at least one column to export')
      return
    }
    onExport(Array.from(selectedColumns))
    onClose()
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-slate-900 rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white dark:bg-slate-900 border-b border-gray-200 dark:border-slate-700 p-4 sm:p-6 flex items-center justify-between">
          <h2 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-slate-100">Select Columns to Export</h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-lg transition"
          >
            <X size={24} className="text-gray-600 dark:text-slate-400" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 sm:p-6">
          {/* Quick Actions */}
          <div className="flex gap-2 mb-6">
            <button
              onClick={selectAll}
              className="px-3 py-2 sm:px-4 text-sm font-medium bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/50 transition"
            >
              Select All
            </button>
            <button
              onClick={deselectAll}
              className="px-3 py-2 sm:px-4 text-sm font-medium bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-300 rounded-lg hover:bg-gray-200 dark:hover:bg-slate-700 transition"
            >
              Deselect All
            </button>
            <div className="flex-1 text-right text-sm text-gray-600 dark:text-slate-400">
              {selectedColumns.size} selected
            </div>
          </div>

          {/* Categories */}
          <div className="space-y-4">
            {Object.entries(COLUMN_CATEGORIES).map(([category, columns]) => {
              const categoryColumnIds = columns.map(col => col.id)
              const allSelected = categoryColumnIds.every(id => selectedColumns.has(id))
              const someSelected = categoryColumnIds.some(id => selectedColumns.has(id))
              const isExpanded = expandedCategories.has(category)

              return (
                <div key={category} className="border border-gray-200 dark:border-slate-700 rounded-lg overflow-hidden">
                  {/* Category Header */}
                  <button
                    onClick={() => toggleCategory(category)}
                    className="w-full px-4 py-3 sm:py-4 flex items-center justify-between bg-gray-50 dark:bg-slate-800 hover:bg-gray-100 dark:hover:bg-slate-700 transition"
                  >
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={allSelected}
                        onChange={() => toggleCategoryAll(category)}
                        onClick={(e) => e.stopPropagation()}
                        className="w-4 h-4 rounded cursor-pointer accent-blue-600 dark:accent-blue-500"
                      />
                      <span className="font-semibold text-gray-900 dark:text-slate-100">{category}</span>
                      {someSelected && !allSelected && (
                        <span className="text-xs bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 px-2 py-1 rounded">
                          {categoryColumnIds.filter(id => selectedColumns.has(id)).length}/{categoryColumnIds.length}
                        </span>
                      )}
                    </div>
                    <ChevronDown
                      size={20}
                      className={`text-gray-600 dark:text-slate-400 transition ${isExpanded ? 'rotate-180' : ''}`}
                    />
                  </button>

                  {/* Category Items */}
                  {isExpanded && (
                    <div className="bg-white dark:bg-slate-900 border-t border-gray-200 dark:border-slate-700 p-4 space-y-3">
                      {columns.map((column) => (
                        <label
                          key={column.id}
                          className="flex items-center gap-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-slate-800 p-2 rounded transition"
                        >
                          <input
                            type="checkbox"
                            checked={selectedColumns.has(column.id)}
                            onChange={() => toggleColumn(column.id)}
                            className="w-4 h-4 rounded cursor-pointer accent-blue-600 dark:accent-blue-500"
                          />
                          <span className="text-gray-700 dark:text-slate-300">{column.label}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-white dark:bg-slate-900 border-t border-gray-200 dark:border-slate-700 p-4 sm:p-6 flex gap-3 justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-gray-300 dark:border-slate-600 text-gray-700 dark:text-slate-300 font-medium hover:bg-gray-50 dark:hover:bg-slate-800 transition"
          >
            Cancel
          </button>
          <button
            onClick={handleExport}
            disabled={selectedColumns.size === 0}
            className="px-6 py-2 rounded-lg bg-blue-600 dark:bg-blue-700 text-white font-medium hover:bg-blue-700 dark:hover:bg-blue-600 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Export to Excel
          </button>
        </div>
      </div>
    </div>
  )
}
