'use client';

type Props = {
  title: string
  textShowForm?: string
  show: boolean
  toggleShow: () => void
  children?: React.ReactNode
}

export default function DailySectionForm({ title, show, toggleShow, textShowForm, children }: Props) {
  return show 
    ? (
      <div className="mt-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
        <h3 className="font-medium text-gray-900 mb-3">{title}</h3>
        {children}
      </div>
    ) : (
      <button
        onClick={toggleShow}
        className="w-full mt-4 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
      >
        {textShowForm || `Add New`}
      </button>
    )
}