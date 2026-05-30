import React from 'react'

type TActivity = {
  id: string
  name: string
}

function ActivityItemForm(props: { id?: string, name?: string, onSave: (data: TActivity) => void }) {
  const nameRef = React.useRef<HTMLInputElement>(null)
  const { id, name, onSave } = props

  const handleSave = () => {
    if (nameRef.current?.value) {
      onSave({
        id: id || crypto.randomUUID(),
        name: nameRef.current.value
      })
    }
  }
  return (
    <div>
      Name: 
      <input type="text" ref={nameRef} defaultValue={name} />
      <button onClick={handleSave}>Save</button>
    </div>
  )
}

export default function DataPage() {

  const [activities, setActivities] = React.useState<TActivity[]>([])

  React.useEffect(() => {
    const localActivities = localStorage.getItem('activities')
    if (localActivities) {
      setActivities(JSON.parse(localActivities) as TActivity[])
    }
  }, [])

  const handleSave = (data: TActivity) => {
    const existingItemIndex = activities.findIndex((item: TActivity) => {
      return item.id === data.id
    })
    console.log('existingItemIndex', existingItemIndex)
    if (existingItemIndex > -1) {
      activities[existingItemIndex] = data
      setActivities([...activities])
      localStorage.setItem('activities', JSON.stringify(activities))
    } else {
      console.log(data)
      activities.push(data)
      setActivities([...activities])
      localStorage.setItem('activities', JSON.stringify(activities))
    }
  }

  return (
    <div>
      {activities.map((activity) => (
        <ActivityItemForm id={activity.id} name={activity.name} onSave={handleSave} />
      ))}
      <ActivityItemForm name="" onSave={handleSave} />
    </div>
  )
}