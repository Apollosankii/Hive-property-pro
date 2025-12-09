import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts'

interface OccupancyChartProps {
  occupied: number
  vacant: number
}

export function OccupancyChart({ occupied, vacant }: OccupancyChartProps) {
  const data = [
    { name: 'Occupied', value: occupied, color: '#10b981' },
    { name: 'Vacant', value: vacant, color: '#94a3b8' },
  ]

  const total = occupied + vacant
  const occupancyRate = total > 0 ? ((occupied / total) * 100).toFixed(1) : '0'

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0]
      const percentage = total > 0 ? ((data.value / total) * 100).toFixed(1) : '0'
      return (
        <div className="bg-white dark:bg-zinc-800 p-3 rounded-lg shadow-lg border border-slate-200 dark:border-zinc-700">
          <p className="text-sm font-semibold" style={{ color: data.payload.color }}>
            {data.name}
          </p>
          <p className="text-sm text-slate-600 dark:text-zinc-400">
            Units: {data.value}
          </p>
          <p className="text-sm text-slate-600 dark:text-zinc-400">
            Percentage: {percentage}%
          </p>
        </div>
      )
    }
    return null
  }

  return (
    <div className="w-full">
      <ResponsiveContainer width="100%" height={300}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            labelLine={false}
            label={({ name, percent }) => `${name}: ${((percent || 0) * 100).toFixed(0)}%`}
            outerRadius={100}
            fill="#8884d8"
            dataKey="value"
          >
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip content={<CustomTooltip />} />
          <Legend />
        </PieChart>
      </ResponsiveContainer>
      <div className="text-center mt-4">
        <p className="text-2xl font-bold text-slate-900 dark:text-zinc-50">
          {occupancyRate}%
        </p>
        <p className="text-sm text-slate-600 dark:text-zinc-400">Occupancy Rate</p>
      </div>
    </div>
  )
}

