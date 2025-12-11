import Image from "next/image"

export default async function Home() {
  // const result = await fetch('http://localhost:3000/api/user', { method: 'POST', body: JSON.stringify({ name: 'John Doe' }) })
  // const data = await result.json()

  return (
    <div className="grid grid-rows-[20px_1fr_20px] items-center justify-items-center min-h-screen p-8 pb-20 gap-16 sm:p-20 font-[family-name:var(--font-geist-sans)]">
      <header>
        <h1>OYL - Organize Your Life</h1>
      </header>
      <main className="flex flex-col gap-8 row-start-2 items-center sm:items-start">
        <p>
          Welcome to OYL, the ultimate tool for organizing your life. With OYL,
          you can easily manage your tasks, set reminders, and keep track of
          your goals.
        </p>
        <div>
          <h2>Today is {new Date().toLocaleDateString()}</h2>
          <div>What have you consumed today?</div>
        </div>
      </main>
      <footer className="row-start-3 flex gap-6 flex-wrap items-center justify-center">

      </footer>
    </div>
  );
}
